import { randomUUID } from 'node:crypto';
import { getGiftCoins } from '@chaos-live/shared-protocol';
import type {
  ChaosEvent,
  StreamUser,
  GiftMetadata,
  LikeMetadata,
  CommentMetadata,
  FollowMetadata,
  ShareMetadata,
  SubscribeMetadata,
  ViewerCountMetadata,
} from '@chaos-live/shared-protocol';

/**
 * Los eventos de TikTok llegan en dos formas distintas.
 *
 * El cliente antiguo aplanaba cada mensaje y renombraba los campos
 * (`comment`, `likeCount`, `giftName`). El cliente actual entrega el mensaje
 * protobuf tal cual, con otros nombres (`content`, `count`) y los datos del
 * regalo dentro de `gift`. Este módulo lee las dos, así que da igual por cuál
 * llegue el evento y una actualización de la librería no vuelve a dejar el
 * overlay mostrando "dijo hola" y "Unknown Gift".
 */

/** Primer texto no vacío. El protobuf usa '' para lo que no viene. */
function primerTexto(...valores: unknown[]): string | undefined {
  for (const v of valores) {
    if (typeof v === 'string' && v.trim() !== '') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

/** Primer número utilizable, ignorando lo que no lo sea. */
function primerNumero(...valores: unknown[]): number | undefined {
  for (const v of valores) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function objeto(valor: unknown): Record<string, unknown> | undefined {
  return valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : undefined;
}

function extractUser(data: Record<string, unknown>): StreamUser {
  // `user` anidado en la forma nueva; campos sueltos en la aplanada.
  const u = objeto(data['user']);

  const id =
    primerTexto(data['userId'], u?.['idStr'], u?.['id'], data['uniqueId'], u?.['displayId']) ??
    'unknown_user';

  const displayName =
    primerTexto(data['nickname'], u?.['nickname'], data['uniqueId'], u?.['displayId']) ??
    'Anonymous';

  return { id, displayName };
}

/**
 * Datos del regalo, vengan sueltos o dentro de `gift`.
 *
 * Ojo con la capa `legacy` del conector: sustituye `gift` por un objeto propio
 * (`{gift_id, repeat_count, repeat_end, gift_type}`) que ya no lleva ni el
 * nombre ni los diamantes. Por eso se leen las dos variantes y se acepta que
 * falte cualquiera de ellas.
 */
function datosDelRegalo(data: Record<string, unknown>): {
  name?: string;
  id?: number;
  diamonds?: number;
  type?: number;
} {
  const g = objeto(data['gift']);
  const detalles = objeto(data['giftDetails']);

  return {
    name: primerTexto(data['giftName'], g?.['name'], detalles?.['giftName']),
    id: primerNumero(data['giftId'], g?.['id'], g?.['gift_id'], detalles?.['giftId']),
    diamonds: primerNumero(data['diamondCount'], g?.['diamondCount'], detalles?.['diamondCount']),
    type: primerNumero(data['giftType'], g?.['type'], g?.['gift_type'], detalles?.['giftType']),
  };
}

/**
 * Decide si un evento `gift` debe emitirse al motor.
 *
 * TikTok emite el evento varias veces mientras dura una racha: con
 * `repeatEnd: false` en cada pulsación y una última vez con `repeatEnd: true` y
 * el `repeatCount` definitivo. Esto solo ocurre con los regalos que admiten
 * racha (`giftType === 1`), que son los baratos y más frecuentes.
 *
 * Si no se filtran las emisiones intermedias, una racha de 10 rosas dispara ~10
 * acciones en el juego y suma de más en metas y clasificación.
 *
 * Los regalos que no admiten racha (`giftType !== 1`) llegan una sola vez y se
 * emiten siempre.
 */
export function shouldEmitGift(data: Record<string, unknown>): boolean {
  const giftType = datosDelRegalo(data).type;

  // Sin saber el tipo no se puede filtrar una racha. Se emite, que como mucho
  // duplica, en vez de callar un regalo que el espectador ha pagado.
  //
  // Antes esto pasaba siempre: el tipo se leia solo de `data.giftType`, que la
  // forma nueva no trae, asi que `Number(undefined ?? 0)` daba 0 y toda racha
  // se emitia entera. Seis rosas entraban como seis regalos sueltos.
  if (giftType === undefined) {
    return true;
  }

  if (giftType !== 1) {
    return true;
  }

  return data['repeatEnd'] === true || data['repeatEnd'] === 1;
}

export function normalizeGift(data: Record<string, unknown>): ChaosEvent<'gift'> {
  const user = extractUser(data);
  const regalo = datosDelRegalo(data);
  const giftName = regalo.name ?? 'Unknown Gift';
  const giftId = regalo.id ?? 0;
  const repeatCount = primerNumero(data['repeatCount'], data['comboCount']) ?? 1;
  // Si TikTok no manda `diamondCount`, deducirlo del catálogo antes de caer al
  // valor 1, que infravaloraría los regalos caros.
  const rawDiamondCount = regalo.diamonds ?? 0;
  const diamondCount = rawDiamondCount > 0 ? rawDiamondCount : (getGiftCoins(giftName) ?? 1);

  // Economic value is diamond count * streak count
  const value = Math.max(1, diamondCount * Math.max(1, repeatCount));

  const metadata: GiftMetadata = {
    giftName,
    giftId,
    repeatCount,
    diamondCount,
  };

  return {
    id: randomUUID(),
    platform: 'tiktok',
    type: 'gift',
    user,
    value,
    metadata,
    raw: data,
    timestamp: Date.now(),
  };
}

export function normalizeLike(data: Record<string, unknown>): ChaosEvent<'like'> {
  const user = extractUser(data);
  // `likeCount` en la forma aplanada, `count` en la nueva. Leyendo solo el
  // primero, cada tanda de "me gusta" contaba como uno y el recuento del
  // overlay no se parecia en nada al de TikTok.
  const likeCount = primerNumero(data['likeCount'], data['count']) ?? 1;

  const metadata: LikeMetadata = {
    likeCount,
  };

  return {
    id: randomUUID(),
    platform: 'tiktok',
    type: 'like',
    user,
    value: likeCount,
    metadata,
    raw: data,
    timestamp: Date.now(),
  };
}

export function normalizeComment(data: Record<string, unknown>): ChaosEvent<'comment'> {
  const user = extractUser(data);
  // `comment` en la forma aplanada, `content` en la nueva. Leyendo solo el
  // primero el texto salia vacio siempre, y el overlay lo tapaba inventandose
  // un "dijo hola" que el espectador no habia escrito.
  const text = (primerTexto(data['comment'], data['content']) ?? '').trim();

  const metadata: CommentMetadata = {
    text,
  };

  return {
    id: randomUUID(),
    platform: 'tiktok',
    type: 'comment',
    user,
    value: 1,
    metadata,
    raw: data,
    timestamp: Date.now(),
  };
}

export function normalizeFollow(data: Record<string, unknown>): ChaosEvent<'follow'> {
  const user = extractUser(data);
  const metadata: FollowMetadata = {};

  return {
    id: randomUUID(),
    platform: 'tiktok',
    type: 'follow',
    user,
    value: 5, // Baseline weight for follows
    metadata,
    raw: data,
    timestamp: Date.now(),
  };
}

export function normalizeShare(data: Record<string, unknown>): ChaosEvent<'share'> {
  const user = extractUser(data);
  const metadata: ShareMetadata = {};

  return {
    id: randomUUID(),
    platform: 'tiktok',
    type: 'share',
    user,
    value: 10, // Baseline weight for shares
    metadata,
    raw: data,
    timestamp: Date.now(),
  };
}

export function normalizeSubscribe(data: Record<string, unknown>): ChaosEvent<'subscribe'> {
  const user = extractUser(data);
  const tier = typeof data['subMonth'] === 'number' ? Number(data['subMonth']) : undefined;

  const metadata: SubscribeMetadata = {
    tier,
  };

  return {
    id: randomUUID(),
    platform: 'tiktok',
    type: 'subscribe',
    user,
    value: 50, // Baseline weight for subscriptions
    metadata,
    raw: data,
    timestamp: Date.now(),
  };
}

export function normalizeViewerCount(data: Record<string, unknown>): ChaosEvent<'viewer_count'> {
  const viewerCount = primerNumero(data['viewerCount'], data['totalUser'], data['total']) ?? 0;
  const metadata: ViewerCountMetadata = {
    viewerCount,
  };

  return {
    id: randomUUID(),
    platform: 'tiktok',
    type: 'viewer_count',
    user: { id: 'system', displayName: 'System' },
    value: viewerCount,
    metadata,
    raw: data,
    timestamp: Date.now(),
  };
}
