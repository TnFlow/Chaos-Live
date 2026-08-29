import {
  normalizeTwitchCheer,
  normalizeTwitchFollow,
  normalizeTwitchSubscribe,
  normalizeTwitchReward,
  normalizeTwitchChat,
  normalizeTwitchRaid,
} from '../src/normalizer.js';

describe('Twitch Normalizers', () => {
  it('normalizes channel.cheer bits', () => {
    const raw = {
      user_id: '12345',
      user_name: 'TwitchCheerer',
      bits: 500,
      message: 'Take my bits!',
    };

    const event = normalizeTwitchCheer(raw);
    expect(event.platform).toBe('twitch');
    expect(event.type).toBe('gift');
    expect(event.user.displayName).toBe('TwitchCheerer');
    expect(event.value).toBe(500);
    expect(event.metadata.giftName).toBe('Cheer 500 Bits');
  });

  it('normalizes anonymous cheer bits', () => {
    const raw = {
      is_anonymous: true,
      bits: 100,
    };

    const event = normalizeTwitchCheer(raw);
    expect(event.user.displayName).toBe('Anonymous');
    expect(event.user.id).toBe('anonymous');
    expect(event.value).toBe(100);
  });

  it('normalizes channel.follow', () => {
    const raw = {
      user_id: '888',
      user_name: 'NewTwitchFan',
    };

    const event = normalizeTwitchFollow(raw);
    expect(event.platform).toBe('twitch');
    expect(event.type).toBe('follow');
    expect(event.user.displayName).toBe('NewTwitchFan');
    expect(event.value).toBe(5);
  });

  it('normalizes channel.subscribe tier 3', () => {
    const raw = {
      user_id: '777',
      user_name: 'Tier3Sub',
      tier: '3000',
      cumulative_months: 6,
    };

    const event = normalizeTwitchSubscribe(raw);
    expect(event.platform).toBe('twitch');
    expect(event.type).toBe('subscribe');
    expect(event.value).toBe(25);
    expect(event.metadata.tier).toBe(3);
  });

  it('normalizes channel points reward redemption to gift', () => {
    const raw = {
      user_id: '555',
      user_name: 'PointsSpender',
      reward: {
        title: 'Summon Creeper',
        cost: 2000,
      },
      user_input: 'make it charged',
    };

    const event = normalizeTwitchReward(raw);
    expect(event.platform).toBe('twitch');
    expect(event.type).toBe('gift');
    expect(event.value).toBe(2000);
    expect(event.metadata.giftName).toBe('Summon Creeper');
    expect(event.metadata.diamondCount).toBe(2000);
  });

  it('normalizes channel.chat.message', () => {
    const raw = {
      chatter_user_id: '444',
      chatter_user_name: 'TwitchChatter',
      message: {
        text: 'poggers in the chat',
      },
    };

    const event = normalizeTwitchChat(raw);
    expect(event.platform).toBe('twitch');
    expect(event.type).toBe('comment');
    expect(event.metadata.text).toBe('poggers in the chat');
  });

  it('normalizes channel.raid', () => {
    const raw = {
      from_broadcaster_user_id: '333',
      from_broadcaster_user_name: 'BigStreamer',
      viewers: 120,
    };

    const event = normalizeTwitchRaid(raw);
    expect(event.platform).toBe('twitch');
    expect(event.type).toBe('share');
    expect(event.user.displayName).toBe('BigStreamer');
    expect(event.value).toBe(120);
  });
});
