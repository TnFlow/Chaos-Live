/**
 * Catálogo canónico de regalos de TikTok LIVE.
 *
 * Fuente única de verdad, compartida por:
 * - `@chaos-live/adapter-tiktok` — para deducir el valor en monedas cuando la
 *   pasarela no envía `diamondCount`.
 * - `@chaos-live/app` — lo sirve en `GET /api/gifts/presets`.
 * - `@chaos-live/overlay` — el editor de reglas del panel lo usa como plantillas.
 *
 * NOTA: aquí no se declara qué regalos admiten racha (`giftType === 1`). Ese dato
 * lo manda TikTok en cada evento y es el único fiable; duplicarlo aquí solo
 * crearía una segunda verdad que se desincroniza.
 */

export type GiftCategory = 'popular' | 'cheap' | 'medium' | 'luxury';

export interface TikTokGiftPreset {
  readonly id: string;
  /** Nombre exacto tal y como lo envía TikTok (en inglés — NO traducir). */
  readonly name: string;
  /** Precio en monedas de TikTok. */
  readonly coins: number;
  readonly icon: string;
  readonly category: GiftCategory;
  /** Comando de Minecraft sugerido al crear una regla desde este regalo. */
  readonly defaultCommand: string;
  readonly defaultFeedbackTitle: string;
  readonly defaultFeedbackDesc: string;
  readonly bannerColor: string;
}

export const TIKTOK_GIFTS: readonly TikTokGiftPreset[] = [
  {
    id: 'gift-rose',
    name: 'Rose',
    coins: 1,
    icon: '🌹',
    category: 'popular',
    defaultCommand: 'execute at @p run summon chicken ~ ~1 ~ {CustomName:\'"${user.displayName}"\'}',
    defaultFeedbackTitle: '🌹 ¡LLUVIA DE ROSAS!',
    defaultFeedbackDesc: '¡${user.displayName} envió una Rosa! Apareció una gallina.',
    bannerColor: '#f43f5e',
  },
  {
    id: 'gift-heart-me',
    name: 'Heart Me',
    coins: 1,
    icon: '💖',
    category: 'cheap',
    defaultCommand: 'execute at @p run particle heart ~ ~1 ~ 0.5 0.5 0.5 0.1 15',
    defaultFeedbackTitle: '💖 ¡MUCHO AMOR!',
    defaultFeedbackDesc: '¡${user.displayName} mandó amor con un Heart Me!',
    bannerColor: '#ec4899',
  },
  {
    id: 'gift-finger-heart',
    name: 'Finger Heart',
    coins: 5,
    icon: '🫰',
    category: 'cheap',
    defaultCommand: 'effect give @p minecraft:speed 10 1',
    defaultFeedbackTitle: '🫰 ¡SUBIDÓN DE VELOCIDAD!',
    defaultFeedbackDesc: '¡${user.displayName} dio un Finger Heart! Buff de velocidad.',
    bannerColor: '#fb7185',
  },
  {
    id: 'gift-panda',
    name: 'Panda',
    coins: 5,
    icon: '🐼',
    category: 'cheap',
    defaultCommand: 'execute at @p run summon panda ~ ~ ~',
    defaultFeedbackTitle: '🐼 ¡CAE UN PANDA!',
    defaultFeedbackDesc: '¡${user.displayName} soltó un Panda en la partida!',
    bannerColor: '#94a3b8',
  },
  {
    id: 'gift-ice-cream',
    name: 'Ice Cream',
    coins: 30,
    icon: '🍦',
    category: 'popular',
    defaultCommand: 'execute at @p run summon zombie ~ ~ ~ {CustomName:\'"${user.displayName}"\'}',
    defaultFeedbackTitle: '🍦 ¡CEREBROOOS! ALERTA DE HELADO',
    defaultFeedbackDesc: '¡${user.displayName} soltó un Zombi con un helado!',
    bannerColor: '#06b6d4',
  },
  {
    id: 'gift-doughnut',
    name: 'Doughnut',
    coins: 30,
    icon: '🍩',
    category: 'popular',
    defaultCommand:
      'execute at @p run summon skeleton ~ ~ ~ {HandItems:[{id:"minecraft:bow",Count:1b},{}],CustomName:\'"${user.displayName}"\'}',
    defaultFeedbackTitle: '🍩 ¡ESQUELETO FRANCOTIRADOR!',
    defaultFeedbackDesc: '¡${user.displayName} pagó una Dona por un Esqueleto arquero!',
    bannerColor: '#f97316',
  },
  {
    id: 'gift-paper-crane',
    name: 'Paper Crane',
    coins: 99,
    icon: '🕊️',
    category: 'medium',
    defaultCommand: 'effect give @p minecraft:levitation 5 1',
    defaultFeedbackTitle: '🕊️ ¡DESPEGUE!',
    defaultFeedbackDesc: '¡${user.displayName} lanzó al streamer por los aires!',
    bannerColor: '#a855f7',
  },
  {
    id: 'gift-confetti',
    name: 'Confetti',
    coins: 100,
    icon: '🎉',
    category: 'medium',
    defaultCommand: 'execute at @p run particle firework ~ ~1 ~ 0.5 0.5 0.5 0.1 50',
    defaultFeedbackTitle: '🎉 ¡FIESTA DE CONFETI!',
    defaultFeedbackDesc: '¡${user.displayName} lo celebró con una explosión de confeti!',
    bannerColor: '#eab308',
  },
  {
    id: 'gift-sunglasses',
    name: 'Sunglasses',
    coins: 199,
    icon: '🕶️',
    category: 'medium',
    defaultCommand: 'execute at @p run summon phantom ~ ~6 ~ {CustomName:\'"${user.displayName}"\'}',
    defaultFeedbackTitle: '🕶️ ¡ATAQUE PHANTOM CON ESTILO!',
    defaultFeedbackDesc: '¡${user.displayName} se puso las gafas y soltó un Phantom!',
    bannerColor: '#38bdf8',
  },
  {
    id: 'gift-boxing-gloves',
    name: 'Boxing Gloves',
    coins: 299,
    icon: '🥊',
    category: 'medium',
    defaultCommand: 'effect give @p minecraft:strength 20 2',
    defaultFeedbackTitle: '🥊 ¡FUERZA DE NOCAUT!',
    defaultFeedbackDesc: '¡${user.displayName} cargó al streamer con guantes de boxeo!',
    bannerColor: '#ef4444',
  },
  {
    id: 'gift-money-gun',
    name: 'Money Gun',
    coins: 500,
    icon: '💸',
    category: 'popular',
    defaultCommand: 'execute at @p run summon tnt ~ ~2 ~ {Fuse:40}',
    defaultFeedbackTitle: '💸 ¡EXPLOSIÓN DE TNT!',
    defaultFeedbackDesc: '¡${user.displayName} disparó la Money Gun! Cae TNT.',
    bannerColor: '#10b981',
  },
  {
    id: 'gift-galaxy',
    name: 'Galaxy',
    coins: 1000,
    icon: '🪐',
    category: 'luxury',
    defaultCommand: 'execute at @p run summon lightning_bolt ~ ~ ~',
    defaultFeedbackTitle: '🪐 ¡RAYO CÓSMICO!',
    defaultFeedbackDesc: '¡${user.displayName} invocó un rayo galáctico!',
    bannerColor: '#8b5cf6',
  },
  {
    id: 'gift-whale',
    name: 'Whale',
    coins: 2150,
    icon: '🐋',
    category: 'luxury',
    defaultCommand: 'execute at @p run summon elder_guardian ~ ~ ~',
    defaultFeedbackTitle: '🐋 ¡DESPIERTA EL GUARDIÁN ANCIANO!',
    defaultFeedbackDesc: '¡${user.displayName} soltó una Ballena! Guardián Anciano invocado.',
    bannerColor: '#0284c7',
  },
  {
    id: 'gift-dragon',
    name: 'Dragon',
    coins: 26999,
    icon: '🐉',
    category: 'luxury',
    defaultCommand: 'execute at @p run summon ender_dragon ~ ~10 ~',
    defaultFeedbackTitle: '🐉 ¡APOCALIPSIS DEL DRAGÓN!',
    defaultFeedbackDesc: '🐉 PELEA DE JEFE: ¡${user.displayName} invocó al Ender Dragon!',
    bannerColor: '#7c3aed',
  },
  {
    id: 'gift-lion',
    name: 'Lion',
    coins: 29999,
    icon: '🦁',
    category: 'luxury',
    defaultCommand:
      'execute at @p run summon creeper ~ ~ ~ {powered:1b,CustomName:\'"MEGA DONACION: ${user.displayName}"\'}',
    defaultFeedbackTitle: '🦁 ¡EL REY DE LA SELVA: LEÓN!',
    defaultFeedbackDesc: '👑 MEGA DONACIÓN: ¡${user.displayName} invocó un Creeper cargado!',
    bannerColor: '#f59e0b',
  },
  {
    id: 'gift-universe',
    name: 'TikTok Universe',
    coins: 34999,
    icon: '🌌',
    category: 'luxury',
    defaultCommand:
      'execute at @p run summon warden ~ ~ ~ {CustomName:\'"JEFE UNIVERSE: ${user.displayName}"\'}',
    defaultFeedbackTitle: '🌌 ¡TIKTOK UNIVERSE! DONACIÓN DIVINA',
    defaultFeedbackDesc: '🌌 EVENTO SUPREMO: ¡${user.displayName} desató al WARDEN!',
    bannerColor: '#6366f1',
  },
];

/** Índice por nombre normalizado (minúsculas, sin espacios sobrantes). */
const GIFTS_BY_NAME = new Map<string, TikTokGiftPreset>(
  TIKTOK_GIFTS.map((gift) => [gift.name.trim().toLowerCase(), gift]),
);

/**
 * Busca un regalo del catálogo por su nombre de TikTok, sin distinguir
 * mayúsculas ni espacios sobrantes.
 */
export function getGiftByName(giftName: string): TikTokGiftPreset | undefined {
  if (!giftName) return undefined;
  return GIFTS_BY_NAME.get(giftName.trim().toLowerCase());
}

/**
 * Devuelve el precio en monedas de un regalo conocido, o `undefined` si no está
 * en el catálogo. Se usa como respaldo cuando el evento de TikTok llega sin
 * `diamondCount`, para no infravalorar el regalo asignándole 1 moneda.
 */
export function getGiftCoins(giftName: string): number | undefined {
  return getGiftByName(giftName)?.coins;
}
