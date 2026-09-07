import { jest } from '@jest/globals';

/**
 * La conexion real con TikTok se sustituye por una que falla como falla de
 * verdad cuando el streamer todavia no ha empezado: con un `UserOfflineError`.
 */
const conexionesCreadas: FalsaConexion[] = [];

class FalsaConexion {
  public isConnected = false;
  public static seguirOffline = true;
  private oyentes = new Map<string, (dato: unknown) => void>();

  constructor(public readonly uniqueId: string) {
    conexionesCreadas.push(this);
  }

  async connect(): Promise<void> {
    if (FalsaConexion.seguirOffline) {
      const err = new Error("The requested user isn't online :(");
      err.name = 'UserOfflineError';
      throw err;
    }
    this.isConnected = true;
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
  }

  on(evento: string, handler: (dato: unknown) => void): void {
    this.oyentes.set(evento, handler);
  }

  removeAllListeners(): void {
    this.oyentes.clear();
  }

  emitir(evento: string, dato: unknown): void {
    this.oyentes.get(evento)?.(dato);
  }
}

jest.unstable_mockModule('tiktok-live-connector', () => ({
  TikTokLiveConnection: FalsaConexion,
}));

const { TikTokAdapter } = await import('../src/TikTokAdapter.js');
const { isPlatformWaitingError } = await import('@chaos-live/core');

describe('TikTokAdapter con el streamer fuera de directo', () => {
  beforeEach(() => {
    conexionesCreadas.length = 0;
    FalsaConexion.seguirOffline = true;
  });

  /**
   * `UserOfflineError` no es una averia: es el estado normal mientras el
   * streamer monta la escena. Tratarlo como fallo abria el circuito a los
   * cinco intentos y agotaba los reintentos, asi que Chaos-Live se rendia
   * justo con quien todavia no habia empezado.
   */
  it('no abre el circuito ni gasta intentos', async () => {
    const adapter = new TikTokAdapter({
      uniqueId: 'quien_sea',
      circuitBreaker: { failureThreshold: 2 },
      reconnect: { enabled: false },
    });

    for (let i = 0; i < 5; i++) {
      const err = await adapter.connect().catch((e: unknown) => e);
      expect(isPlatformWaitingError(err)).toBe(true);
    }

    expect(adapter.getCircuitState()).toBe('CLOSED');
    expect(adapter.isConnected()).toBe(false);
  });

  it('vuelve a intentarlo y conecta cuando empieza el directo', async () => {
    jest.useFakeTimers();
    try {
      const adapter = new TikTokAdapter({
        uniqueId: 'quien_sea',
        reconnect: { enabled: true, offlinePollMs: 1000 },
      });

      await expect(adapter.connect()).rejects.toThrow(/no está en directo/);
      expect(adapter.isConnected()).toBe(false);

      // El streamer le da a "empezar directo".
      FalsaConexion.seguirOffline = false;
      await jest.advanceTimersByTimeAsync(1200);

      expect(adapter.isConnected()).toBe(true);
      await adapter.disconnect();
    } finally {
      jest.useRealTimers();
    }
  });

  /**
   * El motor distingue "esperando directo" de una averia por el tipo del error.
   * Sin esta marca, cada reintento se registraba como EVENT_FAILED y el
   * streamer veia una cruz roja cada treinta segundos con todo en orden.
   */
  it('marca la espera como PlatformWaitingError, no como averia', async () => {
    const adapter = new TikTokAdapter({
      uniqueId: 'quien_sea',
      reconnect: { enabled: false },
    });

    const recibidos: Error[] = [];
    adapter.onError((err) => recibidos.push(err));

    await expect(adapter.connect()).rejects.toThrow();

    // Una sola vez, aunque el fallo entre por las dos vias.
    expect(recibidos).toHaveLength(1);
    expect(isPlatformWaitingError(recibidos[0])).toBe(true);
    expect(recibidos[0]?.message).toContain('quien_sea');
    expect(recibidos[0]?.message).not.toContain("isn't online");
  });

  /**
   * El evento 'error' de tiktok-live-connector no siempre trae un Error. Con un
   * objeto plano, el registro escribia "[object Object]" justo en la linea que
   * tenia que explicar por que no conectaba.
   */
  it('saca un mensaje legible de un error que no es Error', async () => {
    const adapter = new TikTokAdapter({
      uniqueId: 'quien_sea',
      reconnect: { enabled: false },
    });

    const recibidos: string[] = [];
    adapter.onError((err) => recibidos.push(err.message));

    await expect(adapter.connect()).rejects.toThrow();
    conexionesCreadas[0]?.emitir('error', { info: 'Fallo al leer la sala', exception: {} });

    expect(recibidos).toContain('Fallo al leer la sala');
    expect(recibidos).not.toContain('[object Object]');
  });
});


/**
 * De extremo a extremo dentro del adapter: entran los mensajes tal y como los
 * entrega el cliente actual y se comprueba que salen ChaosEvents con lo que el
 * espectador hizo de verdad. Es la prueba que faltaba: el normalizador podia
 * estar bien y el adapter seguir enganchado a la capa `legacy`, que destruye
 * los datos del regalo antes de que nadie los lea.
 */
describe('TikTokAdapter con los mensajes del cliente actual', () => {
  const usuario = { idStr: '4242', displayId: 'diana_mc', nickname: 'Diana' };

  beforeEach(() => {
    conexionesCreadas.length = 0;
    FalsaConexion.seguirOffline = false;
  });

  async function adapterConectado() {
    const adapter = new TikTokAdapter({
      uniqueId: 'streamer',
      reconnect: { enabled: false },
      likes: { quietMs: 1000 },
    });
    const recibidos: any[] = [];
    adapter.onEvent((e) => recibidos.push(e));
    await adapter.connect();
    return { adapter, recibidos, conn: conexionesCreadas[0]! };
  }

  it('un comentario llega con su texto, no con uno inventado', async () => {
    const { recibidos, conn } = await adapterConectado();

    conn.emitir('chat', { user: usuario, content: 'vamos a por el warden' });

    expect(recibidos).toHaveLength(1);
    expect(recibidos[0].type).toBe('comment');
    expect(recibidos[0].metadata.text).toBe('vamos a por el warden');
    expect(recibidos[0].user.displayName).toBe('Diana');
  });

  /**
   * Seis rosas son UN regalo de seis, no seis regalos. La racha manda una
   * emision por pulsacion y solo la ultima trae el total.
   */
  it('seis rosas son un solo evento con repeatCount 6', async () => {
    const { recibidos, conn } = await adapterConectado();
    const rosa = { id: '5655', name: 'Rose', diamondCount: 1, type: 1 };

    for (let i = 1; i <= 5; i++) {
      conn.emitir('gift', { user: usuario, giftId: '5655', repeatCount: i, repeatEnd: 0, gift: rosa });
    }
    conn.emitir('gift', { user: usuario, giftId: '5655', repeatCount: 6, repeatEnd: 1, gift: rosa });

    expect(recibidos).toHaveLength(1);
    expect(recibidos[0].type).toBe('gift');
    expect(recibidos[0].metadata.giftName).toBe('Rose');
    expect(recibidos[0].metadata.repeatCount).toBe(6);
    expect(recibidos[0].value).toBe(6);
  });

  it('los me gusta se acumulan y salen con el numero real', async () => {
    jest.useFakeTimers();
    try {
      const { recibidos, conn } = await adapterConectado();

      conn.emitir('like', { user: usuario, count: 10, total: '100' });
      conn.emitir('like', { user: usuario, count: 15, total: '115' });
      conn.emitir('like', { user: usuario, count: 5, total: '120' });

      expect(recibidos).toHaveLength(0);

      jest.advanceTimersByTime(1200);

      expect(recibidos).toHaveLength(1);
      expect(recibidos[0].type).toBe('like');
      expect(recibidos[0].value).toBe(30);
      expect(recibidos[0].metadata.likeCount).toBe(30);
    } finally {
      jest.useRealTimers();
    }
  });
});
