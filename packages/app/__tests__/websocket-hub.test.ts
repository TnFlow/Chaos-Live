import { WebSocket } from 'ws';
import { WebSocketHub, StartupError } from '../src/server.js';
import type { ChaosEvent } from '@chaos-live/shared-protocol';

describe('WebSocketHub', () => {
  const testPort = 9876;
  let hub: WebSocketHub;

  beforeEach(async () => {
    hub = new WebSocketHub({ port: testPort });
    await hub.start();
  });

  afterEach(async () => {
    await hub.stop();
  });

  it('serves health check via HTTP', async () => {
    const res = await fetch(`http://localhost:${testPort}/health`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.status).toBe('ok');
    expect(body.protocolVersion).toBe('0.1.0');
    expect(body.clients.total).toBe(0);
  });

  it('accepts overlay WebSocket connection and sends handshake ack', async () => {
    const ws = new WebSocket(`ws://localhost:${testPort}/?clientType=overlay`);

    const messagePromise = new Promise<any>((resolve) => {
      ws.on('message', (data) => {
        resolve(JSON.parse(data.toString()));
      });
    });

    const msg = await messagePromise;
    expect(msg.type).toBe('HANDSHAKE_ACK');
    expect(msg.assignedType).toBe('overlay');

    ws.close();
  });

  it('broadcasts ChaosEvents to connected overlay clients', async () => {
    const ws = new WebSocket(`ws://localhost:${testPort}/?clientType=overlay`);

    await new Promise((resolve) => ws.on('open', resolve));

    const eventsReceived: any[] = [];
    ws.on('message', (data) => {
      eventsReceived.push(JSON.parse(data.toString()));
    });

    const sampleEvent: ChaosEvent<'gift'> = {
      id: 'test-evt-broadcast',
      platform: 'tiktok',
      type: 'gift',
      user: { id: 'u1', displayName: 'OverlayTester' },
      value: 100,
      metadata: {
        giftName: 'Lion',
        giftId: 6054,
        repeatCount: 1,
        diamondCount: 29999,
      },
      raw: {},
      timestamp: Date.now(),
    };

    // Wait 50ms for socket registration
    await new Promise((r) => setTimeout(r, 50));

    hub.broadcastEvent(sampleEvent);

    await new Promise((r) => setTimeout(r, 50));

    const broadcastMsg = eventsReceived.find((m) => m.type === 'CHAOS_EVENT');
    expect(broadcastMsg).toBeDefined();
    expect(broadcastMsg.payload.id).toBe('test-evt-broadcast');
    expect(broadcastMsg.payload.metadata.giftName).toBe('Lion');

    ws.close();
  });
});


describe('WebSocketHub con el puerto ocupado', () => {
  const testPort = 9877;
  let ocupante: WebSocketHub;

  beforeEach(async () => {
    ocupante = new WebSocketHub({ port: testPort });
    await ocupante.start();
  });

  afterEach(async () => {
    await ocupante.stop();
  });

  /**
   * `ws` reemite el 'error' del servidor HTTP en el WebSocketServer. Sin un
   * listener ahi, ese reenvio lanzaba y el EADDRINUSE salia como excepcion no
   * capturada: el proceso moria con codigo 1 antes de llegar a nuestro
   * manejador, y el lanzador reintentaba diez veces la misma caida.
   */
  it('rechaza con un error explicable en vez de tumbar el proceso', async () => {
    const segundo = new WebSocketHub({ port: testPort });

    await expect(segundo.start()).rejects.toBeInstanceOf(StartupError);
    await segundo.stop();
  });

  it('el error dice el puerto y que hacer', async () => {
    const segundo = new WebSocketHub({ port: testPort });

    const err = await segundo.start().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StartupError);
    expect((err as StartupError).message).toContain(String(testPort));
    expect((err as StartupError).hint).toContain('.env');

    await segundo.stop();
  });
});
