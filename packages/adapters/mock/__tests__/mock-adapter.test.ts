import type { ChaosEvent } from '@chaos-live/shared-protocol';
import { MockAdapter } from '../src/MockAdapter.js';

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

    await new Promise((r) => setTimeout(r, 65));
    expect(received.length).toBeGreaterThanOrEqual(2);

    await adapter.disconnect();
  });
});
