import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { PROTOCOL_VERSION } from '@chaos-live/shared-protocol';
import type { ChaosEvent, GameAction } from '@chaos-live/shared-protocol';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type ClientType = 'overlay' | 'mod' | 'unknown';

export interface ConnectedClient {
  socket: WebSocket;
  clientType: ClientType;
  protocolVersion?: string;
  connectedAt: number;
}

export interface ModActionResult {
  correlationId: string;
  success: boolean;
  durationMs: number;
  response?: string;
  error?: string;
}

export interface WebSocketHubConfig {
  port: number;
  staticDir?: string;
  onClientConnected?: (socket: WebSocket, client: ConnectedClient) => void;
  onModActionResult?: (result: ModActionResult) => void;
  onHttpRequest?: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<boolean> | boolean;
}

/**
 * WebSocketHub
 * Centralized real-time communication hub serving:
 * 1. OBS Browser Source overlays (broadcasts live events, alerts, goal progress).
 * 2. Minecraft Fabric mod client (Phase 6 client connection).
 * 3. Static HTTP server hosting the overlay web application.
 */
export class WebSocketHub {
  public readonly port: number;
  private readonly staticDir: string;
  private readonly onClientConnected?: (socket: WebSocket, client: ConnectedClient) => void;
  private readonly onModActionResult?: (result: ModActionResult) => void;
  private readonly onHttpRequest?: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<boolean> | boolean;

  private server?: http.Server;
  private wss?: WebSocketServer;
  private clients = new Map<WebSocket, ConnectedClient>();

  constructor(config: WebSocketHubConfig) {
    this.port = config.port;
    this.onClientConnected = config.onClientConnected;
    this.onModActionResult = config.onModActionResult;
    this.onHttpRequest = config.onHttpRequest;

    const possiblePaths = [
      config.staticDir,
      path.resolve(process.cwd(), 'packages/overlay/dist'),
      path.resolve(process.cwd(), '../overlay/dist'),
      path.resolve(__dirname, '../../overlay/dist'),
    ].filter(Boolean) as string[];

    let resolvedDir = possiblePaths[0]!;
    for (const p of possiblePaths) {
      if (fs.existsSync(p) && fs.existsSync(path.join(p, 'index.html'))) {
        resolvedDir = p;
        break;
      }
    }

    this.staticDir = resolvedDir;
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        if (this.onHttpRequest) {
          try {
            const handled = await this.onHttpRequest(req, res);
            if (handled) return;
          } catch (err) {
            logger.error({ err }, 'Error in onHttpRequest hook');
          }
        }
        this.handleHttpRequest(req, res);
      });

      this.wss = new WebSocketServer({ server: this.server });

      this.wss.on('connection', (socket, request) => {
        this.handleConnection(socket, request);
      });

      this.server.on('error', (err) => {
        logger.error({ err, port: this.port }, 'HTTP/WebSocket Server error');
        reject(err);
      });

      this.server.listen(this.port, () => {
        logger.info(
          { port: this.port, overlayUrl: `http://localhost:${this.port}/` },
          `🌐 WebSocket Hub & Static Server listening on port ${this.port}`,
        );
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      for (const client of this.clients.keys()) {
        try {
          client.close(1000, 'Server shutting down');
        } catch {
          // Ignore close error
        }
      }
      this.clients.clear();

      if (this.wss) {
        this.wss.close();
        this.wss = undefined;
      }

      if (this.server) {
        this.server.close(() => {
          resolve();
        });
        this.server = undefined;
      } else {
        resolve();
      }
    });
  }

  /**
   * Broadcasts an event to all connected OBS overlay clients.
   */
  public broadcastToOverlay(type: string, payload: unknown): void {
    this.broadcastToType('overlay', {
      type,
      payload,
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcasts a ChaosEvent to the overlay feed.
   */
  public broadcastEvent(event: ChaosEvent): void {
    this.broadcastToOverlay('CHAOS_EVENT', event);
  }

  /**
   * Broadcasts an action execution notification to the overlay.
   */
  public broadcastAction(action: GameAction): void {
    this.broadcastToOverlay('GAME_ACTION', action);
  }

  /**
   * Broadcasts to mod clients (Phase 6).
   */
  public broadcastToMod(type: string, payload: unknown): void {
    this.broadcastToType('mod', {
      type,
      payload,
      timestamp: Date.now(),
    });
  }

  /**
   * Dispatches a GameAction to connected Fabric mod clients.
   * Returns true if successfully queued to at least one mod.
   */
  public sendActionToMod(action: GameAction): boolean {
    if (!this.isModConnected()) {
      return false;
    }
    this.broadcastToMod('GAME_ACTION', action);
    return true;
  }

  public isModConnected(): boolean {
    return this.getConnectedCount('mod') > 0;
  }

  public getConnectedCount(clientType?: ClientType): number {
    if (!clientType) return this.clients.size;
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.clientType === clientType) count++;
    }
    return count;
  }

  private broadcastToType(targetType: ClientType, data: unknown): void {
    const serialized = JSON.stringify(data);
    for (const [socket, client] of this.clients.entries()) {
      if (client.clientType === targetType && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(serialized);
        } catch (err) {
          logger.warn({ err }, 'Failed to send packet to client');
        }
      }
    }
  }

  private handleConnection(socket: WebSocket, request: http.IncomingMessage): void {
    const url = new URL(request.url ?? '/', `http://localhost:${this.port}`);
    const clientTypeParam = url.searchParams.get('clientType');

    let initialType: ClientType = 'overlay';
    if (clientTypeParam === 'mod') initialType = 'mod';
    else if (clientTypeParam === 'overlay') initialType = 'overlay';

    const clientInfo: ConnectedClient = {
      socket,
      clientType: initialType,
      connectedAt: Date.now(),
    };

    this.clients.set(socket, clientInfo);

    logger.info(
      { clientType: initialType, remoteAddress: request.socket.remoteAddress },
      `🔌 WebSocket client connected (type: ${initialType})`,
    );

    // Send handshake acknowledgement
    socket.send(
      JSON.stringify({
        type: 'HANDSHAKE_ACK',
        protocolVersion: PROTOCOL_VERSION,
        assignedType: initialType,
        serverTime: Date.now(),
      }),
    );

    try {
      this.onClientConnected?.(socket, clientInfo);
    } catch {
      // Ignore callback errors
    }

    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'HANDSHAKE') {
          clientInfo.clientType = msg.clientType || clientInfo.clientType;
          clientInfo.protocolVersion = msg.protocolVersion;
          logger.info(
            { clientType: clientInfo.clientType, version: msg.protocolVersion },
            'Client negotiated handshake',
          );
        } else if (msg.type === 'ACTION_RESULT') {
          logger.info(
            {
              correlationId: msg.correlationId,
              success: msg.success,
              durationMs: msg.durationMs,
            },
            '📥 Received action result ACK from Fabric mod',
          );
          this.onModActionResult?.(msg);
        }
      } catch {
        // Ignore unparseable message
      }
    });

    socket.on('close', () => {
      this.clients.delete(socket);
      logger.info({ clientType: clientInfo.clientType }, 'WebSocket client disconnected');
    });

    socket.on('error', (err) => {
      logger.warn({ err }, 'WebSocket client error');
      this.clients.delete(socket);
    });
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const parsedUrl = new URL(req.url ?? '/', `http://localhost:${this.port}`);
    let pathname = parsedUrl.pathname;

    // Health check endpoint
    if (pathname === '/health' || pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          protocolVersion: PROTOCOL_VERSION,
          clients: {
            total: this.clients.size,
            overlay: this.getConnectedCount('overlay'),
            mod: this.getConnectedCount('mod'),
          },
          uptime: process.uptime(),
        }),
      );
      return;
    }

    // Static overlay files
    if (pathname === '/' || pathname === '/overlay') {
      pathname = '/index.html';
    }

    const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    let filePath = path.join(this.staticDir, safePath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(this.staticDir, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Chaos-Live Overlay assets not found. Run build in packages/overlay.');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(filePath).pipe(res);
  }
}
