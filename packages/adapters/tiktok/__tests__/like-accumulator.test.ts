import { jest } from '@jest/globals';
import type { ChaosEvent } from '@chaos-live/shared-protocol';
import { LikeAccumulator } from '../src/like-accumulator.js';

function like(userId: string, cuantos: number, nombre = 'Diana'): ChaosEvent<'like'> {
  return {
    id: `evt-${userId}-${cuantos}-${Math.random()}`,
    platform: 'tiktok',
    type: 'like',
    user: { id: userId, displayName: nombre },
    value: cuantos,
    metadata: { likeCount: cuantos },
    raw: {},
    timestamp: Date.now(),
  };
}

describe('LikeAccumulator', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  /**
   * TikTok no manda un mensaje por toque, manda tandas. Emitiendo cada tanda,
   * el overlay enseñaba una ristra de lineas de la misma persona y ningun
   * numero coincidia con el que ve el streamer.
   */
  it('junta las tandas de un espectador en una sola cifra', () => {
    const emitidos: ChaosEvent<'like'>[] = [];
    const acc = new LikeAccumulator((e) => emitidos.push(e), { quietMs: 1000 });

    acc.add(like('u1', 5));
    acc.add(like('u1', 3));
    acc.add(like('u1', 7));

    // Mientras sigue tocando, no se emite nada todavia.
    jest.advanceTimersByTime(500);
    expect(emitidos).toHaveLength(0);

    // Cuando para, sale una sola vez con el total de verdad.
    jest.advanceTimersByTime(600);
    expect(emitidos).toHaveLength(1);
    expect(emitidos[0]?.value).toBe(15);
    expect(emitidos[0]?.metadata.likeCount).toBe(15);
  });

  it('cada espectador lleva su propia cuenta', () => {
    const emitidos: ChaosEvent<'like'>[] = [];
    const acc = new LikeAccumulator((e) => emitidos.push(e), { quietMs: 1000 });

    acc.add(like('u1', 4, 'Diana'));
    acc.add(like('u2', 9, 'Carlos'));
    jest.advanceTimersByTime(1100);

    expect(emitidos).toHaveLength(2);
    const porNombre = Object.fromEntries(emitidos.map((e) => [e.user.displayName, e.value]));
    expect(porNombre).toEqual({ Diana: 4, Carlos: 9 });
  });

  /**
   * Quien no para de tocar tiene que aparecer igualmente: sin tope, su tanda
   * no se cerraria nunca y el overlay no enseñaria nada de esa persona.
   */
  it('cierra la tanda al llegar al tope aunque siga tocando', () => {
    const emitidos: ChaosEvent<'like'>[] = [];
    const acc = new LikeAccumulator((e) => emitidos.push(e), {
      quietMs: 1000,
      maxWindowMs: 3000,
    });

    // Un toque cada 500 ms, sin descanso: nunca hay 1000 ms de silencio.
    for (let i = 0; i < 10; i++) {
      acc.add(like('u1', 2));
      jest.advanceTimersByTime(500);
    }

    expect(emitidos.length).toBeGreaterThan(0);
    const total = emitidos.reduce((n, e) => n + e.value, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(20);
  });

  it('no pierde lo acumulado al cerrar', () => {
    const emitidos: ChaosEvent<'like'>[] = [];
    const acc = new LikeAccumulator((e) => emitidos.push(e), { quietMs: 5000 });

    acc.add(like('u1', 6));
    acc.flushAll();

    expect(emitidos).toHaveLength(1);
    expect(emitidos[0]?.value).toBe(6);
  });

  it('clear() descarta sin emitir', () => {
    const emitidos: ChaosEvent<'like'>[] = [];
    const acc = new LikeAccumulator((e) => emitidos.push(e), { quietMs: 1000 });

    acc.add(like('u1', 6));
    acc.clear();
    jest.advanceTimersByTime(5000);

    expect(emitidos).toHaveLength(0);
  });
});
