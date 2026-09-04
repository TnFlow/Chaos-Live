import {
  normalizeGift,
  shouldEmitGift,
  normalizeLike,
  normalizeComment,
  normalizeFollow,
  normalizeShare,
  normalizeSubscribe,
  normalizeViewerCount,
} from '../src/normalizer.js';

describe('TikTok Normalizer', () => {
  it('normalizes gift event with calculated economic value', () => {
    const rawData = {
      userId: '778899',
      uniqueId: 'gifter_pro',
      nickname: 'Pro Gifter',
      giftId: 5655,
      giftName: 'Rose',
      diamondCount: 1,
      repeatCount: 10,
    };

    const event = normalizeGift(rawData);

    expect(event.platform).toBe('tiktok');
    expect(event.type).toBe('gift');
    expect(event.user.id).toBe('778899');
    expect(event.user.displayName).toBe('Pro Gifter');
    expect(event.value).toBe(10); // 1 diamond * 10 streak
    expect(event.metadata.giftName).toBe('Rose');
    expect(event.metadata.repeatCount).toBe(10);
    expect(event.id).toBeDefined();
    expect(event.timestamp).toBeGreaterThan(0);
  });

  it('derives gift value from the coin catalog when diamondCount is missing', () => {
    const event = normalizeGift({
      uniqueId: 'whale_sender',
      giftId: 5655,
      giftName: 'Lion',
      repeatCount: 1,
    });

    // Sin catálogo el valor caería a 1 e infravaloraría un regalo de 29999 monedas.
    expect(event.metadata.diamondCount).toBe(29999);
    expect(event.value).toBe(29999);
  });

  it('falls back to a value of 1 for gifts outside the catalog', () => {
    const event = normalizeGift({
      uniqueId: 'someone',
      giftName: 'Regalo Desconocido',
      repeatCount: 2,
    });

    expect(event.metadata.diamondCount).toBe(1);
    expect(event.value).toBe(2);
  });

  describe('gift streak filtering', () => {
    it('discards intermediate emissions of a streakable gift', () => {
      // giftType 1 = admite racha. TikTok repite el evento en cada pulsación.
      expect(shouldEmitGift({ giftType: 1, repeatEnd: false, repeatCount: 1 })).toBe(false);
      expect(shouldEmitGift({ giftType: 1, repeatEnd: false, repeatCount: 7 })).toBe(false);
    });

    it('emits the final emission of a streak with the definitive repeatCount', () => {
      const raw = { giftType: 1, repeatEnd: true, giftName: 'Rose', diamondCount: 1, repeatCount: 10 };

      expect(shouldEmitGift(raw)).toBe(true);

      const event = normalizeGift(raw);
      expect(event.metadata.repeatCount).toBe(10);
      expect(event.value).toBe(10);
    });

    it('always emits gifts that do not support streaks', () => {
      expect(shouldEmitGift({ giftType: 2, repeatEnd: false })).toBe(true);
      expect(shouldEmitGift({ giftName: 'Lion', repeatCount: 1 })).toBe(true);
    });

    it('accepts repeatEnd expressed as the numeric flag 1', () => {
      expect(shouldEmitGift({ giftType: 1, repeatEnd: 1 })).toBe(true);
    });

    it('counts a full streak exactly once', () => {
      // Secuencia real de TikTok: 3 emisiones intermedias y una final.
      const stream = [
        { giftType: 1, repeatEnd: false, giftName: 'Rose', diamondCount: 1, repeatCount: 1 },
        { giftType: 1, repeatEnd: false, giftName: 'Rose', diamondCount: 1, repeatCount: 2 },
        { giftType: 1, repeatEnd: false, giftName: 'Rose', diamondCount: 1, repeatCount: 3 },
        { giftType: 1, repeatEnd: true, giftName: 'Rose', diamondCount: 1, repeatCount: 3 },
      ];

      const emitted = stream.filter(shouldEmitGift).map(normalizeGift);

      expect(emitted).toHaveLength(1);
      expect(emitted[0]!.value).toBe(3);
    });
  });

  it('normalizes like event', () => {
    const rawData = {
      uniqueId: 'liker123',
      likeCount: 25,
    };

    const event = normalizeLike(rawData);

    expect(event.platform).toBe('tiktok');
    expect(event.type).toBe('like');
    expect(event.user.displayName).toBe('liker123');
    expect(event.value).toBe(25);
    expect(event.metadata.likeCount).toBe(25);
  });

  it('normalizes comment event and trims whitespace', () => {
    const rawData = {
      uniqueId: 'chatter',
      comment: '  Hello streamer!  ',
    };

    const event = normalizeComment(rawData);

    expect(event.platform).toBe('tiktok');
    expect(event.type).toBe('comment');
    expect(event.metadata.text).toBe('Hello streamer!');
    expect(event.value).toBe(1);
  });

  it('normalizes follow event', () => {
    const rawData = {
      uniqueId: 'new_follower',
    };

    const event = normalizeFollow(rawData);

    expect(event.platform).toBe('tiktok');
    expect(event.type).toBe('follow');
    expect(event.value).toBe(5);
  });

  it('normalizes share event', () => {
    const rawData = {
      uniqueId: 'sharer',
    };

    const event = normalizeShare(rawData);

    expect(event.platform).toBe('tiktok');
    expect(event.type).toBe('share');
    expect(event.value).toBe(10);
  });

  it('normalizes subscribe event', () => {
    const rawData = {
      uniqueId: 'subscriber',
      subMonth: 3,
    };

    const event = normalizeSubscribe(rawData);

    expect(event.platform).toBe('tiktok');
    expect(event.type).toBe('subscribe');
    expect(event.metadata.tier).toBe(3);
    expect(event.value).toBe(50);
  });

  it('normalizes viewer count event', () => {
    const rawData = {
      viewerCount: 420,
    };

    const event = normalizeViewerCount(rawData);

    expect(event.platform).toBe('tiktok');
    expect(event.type).toBe('viewer_count');
    expect(event.metadata.viewerCount).toBe(420);
    expect(event.value).toBe(420);
  });
});
