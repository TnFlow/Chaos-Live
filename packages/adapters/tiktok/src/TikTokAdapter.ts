import { WebcastPushConnection } from 'tiktok-live-connector/legacy';
import type { PlatformAdapter } from '@chaos-live/core';
import { PlatformWaitingError } from '@chaos-live/core';
import type { ChaosEvent } from '@chaos-live/shared-protocol';
import {
  normalizeGift,
  shouldEmitGift,
  normalizeLike,
  normalizeComment,
  normalizeFollow,
  normalizeShare,
  normalizeSubscribe,
  normalizeViewerCount,
} from './normalizer.js';

export interface CircuitBreakerConfig {
  /** Number of consecutive connection failures before opening the circuit. Default: 5. */
  failureThreshold?: number;
  /** Cooldown time in ms before attempting to reset from open circuit. Default: 30,000ms. */
  resetTimeoutMs?: number;
}

export interface ReconnectConfig {
  /** Whether automatic reconnection is enabled. Default: true. */
  enabled?: boolean;
  /** Maximum reconnection attempts before stopping. Default: 10. */
  maxAttempts?: number;
  /** Initial delay before first retry in ms. Default: 1,000ms. */
  initialDelayMs?: number;
  /** Maximum backoff delay in ms. Default: 30,000ms. */
  maxDelayMs?: number;
  /**
   * Cada cuanto se vuelve a mirar si el streamer ya ha empezado el directo.
   * Default: 30,000ms. No usa backoff ni gasta intentos: puede estar offline
   * horas y Chaos-Live tiene que seguir esperandole.
   */
  offlinePollMs?: number;
}

/**
 * Distingue "todavia no has empezado el directo" de un fallo de conexion.
 *
 * tiktok-live-connector lanza `UserOfflineError` cuando la sala no existe
 * todavia. Es el estado normal mientras el streamer monta la escena, y tratarlo
 * como una averia hacia que Chaos-Live no llegara ni a arrancar.
 */
function esStreamerNoEnDirecto(error: Error): boolean {
  return error.name === 'UserOfflineError' || /isn't online|is offline/i.test(error.message);
}

/**
 * Saca un mensaje legible de lo que emite tiktok-live-connector.
 *
 * Su evento 'error' no siempre trae un Error: a veces es un objeto plano
 * `{ exception, info }`, y `String(objeto)` daba "[object Object]" en el
 * registro, justo en la linea que tenia que explicar por que no conectaba.
 */
function comoError(valor: unknown): Error {
  if (valor instanceof Error) return valor;

  if (valor && typeof valor === 'object') {
    const obj = valor as Record<string, unknown>;
    const anidado = obj['exception'] ?? obj['error'];
    if (anidado instanceof Error) return anidado;

    const texto = obj['info'] ?? obj['message'] ?? obj['reason'];
    if (typeof texto === 'string' && texto.length > 0) return new Error(texto);

    try {
      return new Error(JSON.stringify(valor));
    } catch {
      return new Error('Error desconocido de TikTok LIVE');
    }
  }

  return new Error(String(valor));
}

export interface TikTokAdapterConfig {
  /** The TikTok username (uniqueId) without @ */
  uniqueId: string;
  /** Custom client options passed to TikTokLiveConnection. */
  clientOptions?: Record<string, unknown>;
  /** Reconnection settings. */
  reconnect?: ReconnectConfig;
  /** Circuit breaker settings. */
  circuitBreaker?: CircuitBreakerConfig;
}

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * TikTokAdapter
 * Platform adapter connecting to TikTok LIVE streams via tiktok-live-connector.
 * Implements PlatformAdapter with circuit breaker resilience and exponential backoff.
 */
export class TikTokAdapter implements PlatformAdapter {
  public readonly name = 'TikTok LIVE';

  private readonly uniqueId: string;
  private readonly clientOptions: Record<string, unknown>;
  private readonly reconnectConfig: Required<ReconnectConfig>;
  private readonly circuitConfig: Required<CircuitBreakerConfig>;

  private connection?: WebcastPushConnection;
  private isExplicitlyDisconnected = false;
  private eventHandlers: Set<(event: ChaosEvent) => void> = new Set();
  private errorHandlers: Set<(error: Error) => void> = new Set();

  // Circuit breaker state
  private circuitState: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;

  // Ultimo error notificado, para no repetir el mismo aviso dos veces.
  private ultimoErrorMensaje = '';
  private ultimoErrorEn = 0;

  // Reconnection state
  private reconnectAttempts = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  constructor(config: TikTokAdapterConfig) {
    this.uniqueId = config.uniqueId;
    this.clientOptions = config.clientOptions ?? {};

    this.reconnectConfig = {
      enabled: config.reconnect?.enabled ?? true,
      maxAttempts: config.reconnect?.maxAttempts ?? 10,
      initialDelayMs: config.reconnect?.initialDelayMs ?? 1000,
      maxDelayMs: config.reconnect?.maxDelayMs ?? 30000,
      offlinePollMs: config.reconnect?.offlinePollMs ?? 30000,
    };

    this.circuitConfig = {
      failureThreshold: config.circuitBreaker?.failureThreshold ?? 5,
      resetTimeoutMs: config.circuitBreaker?.resetTimeoutMs ?? 30000,
    };
  }

  public isConnected(): boolean {
    return !!this.connection?.isConnected;
  }

  public getCircuitState(): CircuitState {
    return this.circuitState;
  }

  public onEvent(handler: (event: ChaosEvent) => void): void {
    this.eventHandlers.add(handler);
  }

  public onError(handler: (error: Error) => void): void {
    this.errorHandlers.add(handler);
  }

  public async connect(): Promise<void> {
    this.isExplicitlyDisconnected = false;

    // Check circuit breaker
    if (this.circuitState === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime > this.circuitConfig.resetTimeoutMs) {
        this.circuitState = 'HALF_OPEN';
      } else {
        const error = new Error('TikTokAdapter: Circuit breaker is OPEN. Connection attempts suspended.');
        this.notifyError(error);
        throw error;
      }
    }

    try {
      this.teardownConnection();

      this.connection = new WebcastPushConnection(this.uniqueId, this.clientOptions as any);
      this.attachListeners(this.connection);

      await this.connection.connect();

      // Successful connection: reset circuit and retry counters
      this.circuitState = 'CLOSED';
      this.failureCount = 0;
      this.reconnectAttempts = 0;
    } catch (err) {
      const error = comoError(err);
      this.handleConnectionFailure(error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    this.isExplicitlyDisconnected = true;
    this.clearReconnectTimer();
    this.teardownConnection();
  }

  private teardownConnection(): void {
    if (this.connection) {
      try {
        this.connection.removeAllListeners();
        if (this.connection.isConnected) {
          void this.connection.disconnect();
        }
      } catch {
        // Ignore teardown errors
      }
      this.connection = undefined;
    }
  }

  private attachListeners(conn: WebcastPushConnection): void {
    conn.on('gift', (data: any) => {
      // Descartar las emisiones intermedias de una racha: TikTok repite el
      // evento mientras el espectador mantiene pulsado y solo la última trae el
      // `repeatCount` definitivo.
      if (!shouldEmitGift(data)) {
        return;
      }
      this.emitEvent(normalizeGift(data));
    });

    conn.on('like', (data: any) => {
      this.emitEvent(normalizeLike(data));
    });

    conn.on('chat', (data: any) => {
      this.emitEvent(normalizeComment(data));
    });

    conn.on('follow', (data: any) => {
      this.emitEvent(normalizeFollow(data));
    });

    conn.on('share', (data: any) => {
      this.emitEvent(normalizeShare(data));
    });

    conn.on('subscribe', (data: any) => {
      this.emitEvent(normalizeSubscribe(data));
    });

    conn.on('roomUser', (data: any) => {
      this.emitEvent(normalizeViewerCount(data));
    });

    conn.on('error', (err: unknown) => {
      this.notifyError(comoError(err));
    });

    conn.on('disconnected', () => {
      if (!this.isExplicitlyDisconnected) {
        this.scheduleReconnect();
      }
    });

    conn.on('streamEnd', () => {
      this.notifyError(new Error(`TikTok LIVE stream for ${this.uniqueId} has ended.`));
    });
  }

  private handleConnectionFailure(error: Error): void {
    // Que el streamer no haya empezado todavia no es una averia: no cuenta como
    // fallo, no abre el circuito y no gasta intentos. Solo se vuelve a mirar
    // cada cierto rato, indefinidamente, hasta que arranque el directo.
    if (esStreamerNoEnDirecto(error)) {
      this.notifyError(
        new PlatformWaitingError(`@${this.uniqueId} no está en directo ahora mismo.`, error),
      );
      if (!this.isExplicitlyDisconnected && this.reconnectConfig.enabled) {
        this.scheduleRetry(this.reconnectConfig.offlinePollMs);
      }
      return;
    }

    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.circuitConfig.failureThreshold) {
      this.circuitState = 'OPEN';
    }

    this.notifyError(error);

    if (!this.isExplicitlyDisconnected && this.reconnectConfig.enabled) {
      this.scheduleReconnect();
    }
  }

  /** Programa un unico reintento dentro de `delay` ms, sin tocar contadores. */
  private scheduleRetry(delay: number): void {
    this.clearReconnectTimer();

    this.reconnectTimer = setTimeout(() => {
      void this.connect().catch(() => {
        // Ya se ha notificado en connect().
      });
    }, delay);

    // Un reintento pendiente no puede ser lo unico que mantenga vivo el
    // proceso: si no, cerrar Chaos-Live mientras espera un directo dejaba el
    // apagado colgado hasta que saltaba el vigilante.
    this.reconnectTimer.unref?.();
  }

  private scheduleReconnect(): void {
    if (this.isExplicitlyDisconnected || !this.reconnectConfig.enabled) {
      return;
    }

    if (this.reconnectAttempts >= this.reconnectConfig.maxAttempts) {
      this.notifyError(
        new Error(`TikTokAdapter: Reached maximum reconnect attempts (${this.reconnectConfig.maxAttempts}).`),
      );
      return;
    }

    this.clearReconnectTimer();

    // Exponential backoff with jitter
    const delay = Math.min(
      this.reconnectConfig.initialDelayMs * Math.pow(1.5, this.reconnectAttempts) + Math.random() * 500,
      this.reconnectConfig.maxDelayMs,
    );

    this.reconnectAttempts++;
    this.scheduleRetry(delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private emitEvent(event: ChaosEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        this.notifyError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  private notifyError(error: Error): void {
    // Un mismo fallo de conexion llega dos veces: por el evento 'error' de la
    // libreria y por el catch de connect(). Sin esto, el registro escribia cada
    // aviso por duplicado y parecia que fallaba el doble.
    const ahora = Date.now();
    if (error.message === this.ultimoErrorMensaje && ahora - this.ultimoErrorEn < 2000) {
      return;
    }
    this.ultimoErrorMensaje = error.message;
    this.ultimoErrorEn = ahora;

    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch {
        // Ignore handler error
      }
    }
  }
}
