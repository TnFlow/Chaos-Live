import { TwitchAdapter } from '../src/TwitchAdapter.js';
import type { ChaosEvent } from '@chaos-live/shared-protocol';

describe('TwitchAdapter', () => {
  it('instantiates with twitch platform identifier', () => {
    const adapter = new TwitchAdapter();
    expect(adapter.platform).toBe('twitch');
    expect(adapter.name).toBe('Twitch EventSub');
    expect(adapter.getCircuitBreakerState()).toBe('CLOSED');
  });

  it('receives emitted events through onEvent listener', () => {
    const adapter = new TwitchAdapter();
    const received: ChaosEvent[] = [];

    adapter.onEvent((evt) => {
      received.push(evt);
    });

    const sampleEvent: ChaosEvent<'gift'> = {
      id: 'test-twitch-cheer',
      platform: 'twitch',
      type: 'gift',
      user: { id: 'u1', displayName: 'CheerMaster' },
      value: 1000,
      metadata: {
        giftName: 'Cheer 1000 Bits',
        giftId: 1000,
        repeatCount: 1,
        diamondCount: 1000,
      },
      raw: {},
      timestamp: Date.now(),
    };

    adapter.emitEvent(sampleEvent);

    expect(received.length).toBe(1);
    expect(received[0]?.id).toBe('test-twitch-cheer');
    expect(received[0]?.platform).toBe('twitch');
    expect(received[0]?.value).toBe(1000);
  });
});
