import {
  normalizeGift,
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
