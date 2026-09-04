import type { ChaosEvent } from '@chaos-live/shared-protocol';
import { SessionLeaderboard } from '../src/session/session-leaderboard.js';

function gift(userId: string, displayName: string, value: number, id = `evt-${Math.random()}`): ChaosEvent<'gift'> {
  return {
    id,
    platform: 'tiktok',
    type: 'gift',
    user: { id: userId, displayName },
    value,
    metadata: { giftName: 'Rose', giftId: 1, repeatCount: 1, diamondCount: value },
    raw: {},
    timestamp: Date.now(),
  };
}

describe('SessionLeaderboard', () => {
  it('accumulates gift value per contributor and ranks descending', () => {
    const board = new SessionLeaderboard();

    board.record(gift('u1', 'Ana', 10));
    board.record(gift('u2', 'Beto', 30));
    board.record(gift('u1', 'Ana', 25));

    const top = board.getTop();
    expect(top).toHaveLength(2);
    expect(top[0]).toMatchObject({ userId: 'u1', name: 'Ana', totalValue: 35, contributions: 2 });
    expect(top[1]).toMatchObject({ userId: 'u2', name: 'Beto', totalValue: 30 });
    expect(board.getTotalValue()).toBe(65);
  });

  it('groups by user id, not by display name', () => {
    const board = new SessionLeaderboard();

    // Dos espectadores distintos con el mismo apodo no deben fusionarse.
    board.record(gift('u1', 'Ana', 10));
    board.record(gift('u2', 'Ana', 10));

    expect(board.size()).toBe(2);
  });

  it('keeps the most recent display name of a contributor', () => {
    const board = new SessionLeaderboard();

    board.record(gift('u1', 'NombreViejo', 10));
    board.record(gift('u1', 'NombreNuevo', 5));

    expect(board.getTop()[0]?.name).toBe('NombreNuevo');
  });

  it('ignores non-scoring event types by default', () => {
    const board = new SessionLeaderboard();

    const like: ChaosEvent<'like'> = {
      id: 'evt-like',
      platform: 'tiktok',
      type: 'like',
      user: { id: 'u3', displayName: 'Liker' },
      value: 500,
      metadata: { likeCount: 500 },
      raw: {},
      timestamp: Date.now(),
    };

    expect(board.record(like)).toBe(false);
    expect(board.size()).toBe(0);
  });

  it('ignores non-positive or malformed values', () => {
    const board = new SessionLeaderboard();

    expect(board.record(gift('u1', 'Ana', 0))).toBe(false);
    expect(board.record(gift('u1', 'Ana', -5))).toBe(false);
    expect(board.record(gift('u1', 'Ana', Number.NaN))).toBe(false);
    expect(board.size()).toBe(0);
  });

  it('honours the configured top size', () => {
    const board = new SessionLeaderboard({ topSize: 2 });

    board.record(gift('u1', 'Ana', 10));
    board.record(gift('u2', 'Beto', 20));
    board.record(gift('u3', 'Carla', 30));

    expect(board.getTop()).toHaveLength(2);
    expect(board.getTop(3)).toHaveLength(3);
  });

  it('clears state on reset', () => {
    const board = new SessionLeaderboard();
    board.record(gift('u1', 'Ana', 10));

    board.reset();

    expect(board.size()).toBe(0);
    expect(board.getTop()).toEqual([]);
    expect(board.getTotalValue()).toBe(0);
  });
});
