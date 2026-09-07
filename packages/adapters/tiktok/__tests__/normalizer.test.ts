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


/**
 * Forma que entrega el cliente actual de tiktok-live-connector: el mensaje
 * protobuf tal cual, sin aplanar. Los nombres son otros (`content` en vez de
 * `comment`, `count` en vez de `likeCount`) y los datos del regalo viven
 * dentro de `gift`. Leyendo solo los nombres antiguos, el overlay mostraba
 * "dijo hola" en cada comentario y "Unknown Gift" en cada regalo.
 */
describe('Normalizador con los eventos del cliente actual', () => {
  const usuario = {
    idStr: '99887766',
    displayId: 'rosa_fan',
    nickname: 'Rosa Fan',
  };

  it('lee el texto real del comentario desde `content`', () => {
    const evento = normalizeComment({
      user: usuario,
      content: 'que buena partida',
    });

    expect(evento.metadata.text).toBe('que buena partida');
    expect(evento.user.displayName).toBe('Rosa Fan');
    expect(evento.user.id).toBe('99887766');
  });

  it('no se inventa texto cuando el comentario viene vacío', () => {
    const evento = normalizeComment({ user: usuario, content: '' });
    expect(evento.metadata.text).toBe('');
  });

  it('saca nombre y diamantes del regalo desde `gift`', () => {
    const evento = normalizeGift({
      user: usuario,
      giftId: '5655',
      repeatCount: 6,
      repeatEnd: 1,
      gift: { id: '5655', name: 'Rose', diamondCount: 1, type: 1 },
    });

    expect(evento.metadata.giftName).toBe('Rose');
    expect(evento.metadata.repeatCount).toBe(6);
    expect(evento.metadata.diamondCount).toBe(1);
    // Seis rosas son un regalo de seis, no seis regalos.
    expect(evento.value).toBe(6);
  });

  /**
   * El tipo de regalo vive en `gift.type`. Leyéndolo solo de `data.giftType`
   * salía `undefined`, se tomaba como 0 y ninguna racha se filtraba: las seis
   * pulsaciones de una racha de seis rosas entraban como seis regalos.
   */
  it('filtra las emisiones intermedias de una racha', () => {
    const enCurso = {
      user: usuario,
      repeatCount: 3,
      repeatEnd: 0,
      gift: { id: '5655', name: 'Rose', diamondCount: 1, type: 1 },
    };
    const definitiva = { ...enCurso, repeatCount: 6, repeatEnd: 1 };

    expect(shouldEmitGift(enCurso)).toBe(false);
    expect(shouldEmitGift(definitiva)).toBe(true);
  });

  it('emite siempre los regalos que no admiten racha', () => {
    expect(
      shouldEmitGift({
        user: usuario,
        repeatEnd: 0,
        gift: { id: '5269', name: 'Lion', diamondCount: 29999, type: 2 },
      }),
    ).toBe(true);
  });

  it('lee la cantidad de "me gusta" desde `count`', () => {
    const evento = normalizeLike({ user: usuario, count: 12, total: '340' });

    expect(evento.metadata.likeCount).toBe(12);
    expect(evento.value).toBe(12);
  });

  it('lee el aforo desde `totalUser`', () => {
    expect(normalizeViewerCount({ totalUser: '1420', total: '1420' }).value).toBe(1420);
  });
});
