import type { ChaosEvent } from '@chaos-live/shared-protocol';
import { MockAdapter } from '../src/MockAdapter.js';

/**
 * Espera a que se cumpla una condicion, sondeandola.
 *
 * Los tests de flujo automatico dormian un tiempo fijo calculado sobre el
 * intervalo del adaptador. Con los workers de jest en paralelo los timers se
 * retrasan, asi que esa espera se quedaba corta de vez en cuando y la suite
 * fallaba sin que nada estuviera roto. Sondear mantiene el test rapido cuando
 * la maquina va suelta y le da margen cuando va cargada.
 */
async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('La condicion no se cumplio a tiempo');
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('MockAdapter', () => {
  it('connects and disconnects cleanly', async () => {
    const adapter = new MockAdapter();
    expect(adapter.isConnected()).toBe(false);

    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);

    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });

  it('generates well-formed ChaosEvents for all requested types', () => {
    const adapter = new MockAdapter();

    const gift = adapter.generateRandomEvent('gift');
    expect(gift.platform).toBe('mock');
    expect(gift.type).toBe('gift');
    expect(gift.value).toBeGreaterThanOrEqual(1);
    expect(gift.metadata.giftName).toBeDefined();

    const like = adapter.generateRandomEvent('like');
    expect(like.type).toBe('like');
    expect(like.value).toBeGreaterThanOrEqual(1);

    const comment = adapter.generateRandomEvent('comment');
    expect(comment.type).toBe('comment');
    expect(comment.metadata.text).toBeDefined();
  });

  it('emits events to registered onEvent listeners when connected', async () => {
    const adapter = new MockAdapter();
    await adapter.connect();

    const received: ChaosEvent[] = [];
    adapter.onEvent((event) => received.push(event));

    adapter.emitRandomEvent();
    expect(received.length).toBe(1);
    expect(received[0]?.platform).toBe('mock');

    await adapter.disconnect();
  });

  it('triggers bursts of specified count', async () => {
    const adapter = new MockAdapter();
    await adapter.connect();

    const received: ChaosEvent[] = [];
    adapter.onEvent((event) => received.push(event));

    const burstEvents = adapter.triggerBurst(5, 'gift');
    expect(burstEvents.length).toBe(5);
    expect(received.length).toBe(5);
    expect(received.every((e) => e.type === 'gift')).toBe(true);

    await adapter.disconnect();
  });

  it('streams events automatically when configured', async () => {
    const adapter = new MockAdapter({ autoStreamIntervalMs: 20 });
    await adapter.connect();

    const received: ChaosEvent[] = [];
    adapter.onEvent((event) => received.push(event));

    await waitFor(() => received.length >= 2);
    expect(received.length).toBeGreaterThanOrEqual(2);

    await adapter.disconnect();
  });
});
