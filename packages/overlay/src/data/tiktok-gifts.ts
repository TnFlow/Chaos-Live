/**
 * Plantillas del editor de reglas del panel.
 *
 * El catálogo de regalos de TikTok vive en `@chaos-live/shared-protocol`, que es
 * la fuente única compartida con el adapter y con la API. Aquí solo se reexporta
 * junto con las plantillas que son exclusivas del panel.
 */
export { TIKTOK_GIFTS } from '@chaos-live/shared-protocol';
export type { TikTokGiftPreset, GiftCategory } from '@chaos-live/shared-protocol';

export interface CommandPreset {
  id: string;
  label: string;
  icon: string;
  command: string;
  defaultFeedbackTitle: string;
  defaultFeedbackDesc: string;
  bannerColor: string;
}

export const MINECRAFT_COMMAND_PRESETS: CommandPreset[] = [
  {
    id: 'cmd-zombie',
    label: '🧟 Summon Named Zombie',
    icon: '🧟',
    command: 'execute at @p run summon zombie ~ ~ ~ {CustomName:\'"${user.displayName}"\'}',
    defaultFeedbackTitle: '🧟 ZOMBIE INVASION!',
    defaultFeedbackDesc: '${user.displayName} spawned a Zombie on the streamer!',
    bannerColor: '#10b981',
  },
  {
    id: 'cmd-tnt',
    label: '💣 Drop Primed TNT',
    icon: '💣',
    command: 'execute at @p run summon tnt ~ ~2 ~ {Fuse:40}',
    defaultFeedbackTitle: '💣 TNT DROPPED!',
    defaultFeedbackDesc: '${user.displayName} ignited a TNT explosive above the player!',
    bannerColor: '#ef4444',
  },
  {
    id: 'cmd-lightning',
    label: '⚡ Lightning Strike',
    icon: '⚡',
    command: 'execute at @p run summon lightning_bolt ~ ~ ~',
    defaultFeedbackTitle: '⚡ LIGHTNING STRIKE!',
    defaultFeedbackDesc: '${user.displayName} zapped the streamer with divine lightning!',
    bannerColor: '#06b6d4',
  },
  {
    id: 'cmd-creeper-charged',
    label: '💥 Summon Charged Creeper',
    icon: '💥',
    command: 'execute at @p run summon creeper ~ ~ ~ {powered:1b,CustomName:\'"${user.displayName}"\'}',
    defaultFeedbackTitle: '💥 CHARGED CREEPER RUN!',
    defaultFeedbackDesc: '${user.displayName} summoned a supercharged Creeper!',
    bannerColor: '#eab308',
  },
  {
    id: 'cmd-skeleton',
    label: '🏹 Skeleton Sniper',
    icon: '🏹',
    command: 'execute at @p run summon skeleton ~ ~ ~ {HandItems:[{id:"minecraft:bow",Count:1b},{}],CustomName:\'"${user.displayName}"\'}',
    defaultFeedbackTitle: '🏹 SKELETON SNIPER!',
    defaultFeedbackDesc: '${user.displayName} placed a Skeleton Archer on the battlefield!',
    bannerColor: '#94a3b8',
  },
  {
    id: 'cmd-warden',
    label: '👹 Summon Warden Boss',
    icon: '👹',
    command: 'execute at @p run summon warden ~ ~ ~ {CustomName:\'"COMMUNITY BOSS: ${user.displayName}"\'}',
    defaultFeedbackTitle: '👹 WARDEN BOSS BATTLE!',
    defaultFeedbackDesc: '${user.displayName} unleashed the Warden from the Deep Dark!',
    bannerColor: '#3b82f6',
  },
  {
    id: 'cmd-diamonds',
    label: '💎 Give 5 Diamonds',
    icon: '💎',
    command: 'give @p minecraft:diamond 5',
    defaultFeedbackTitle: '💎 DIAMOND REWARD!',
    defaultFeedbackDesc: '${user.displayName} rewarded the streamer with 5 Diamonds!',
    bannerColor: '#38bdf8',
  },
  {
    id: 'cmd-levitation',
    label: '🌀 Launch into the Sky',
    icon: '🌀',
    command: 'effect give @p minecraft:levitation 5 2',
    defaultFeedbackTitle: '🌀 SKY LAUNCH!',
    defaultFeedbackDesc: '${user.displayName} sent the streamer floating high up!',
    bannerColor: '#a855f7',
  },
  {
    id: 'cmd-blindness',
    label: '👁️ Blindness Curse (10s)',
    icon: '👁️',
    command: 'effect give @p minecraft:blindness 10 1',
    defaultFeedbackTitle: '👁️ DARKNESS CURSE!',
    defaultFeedbackDesc: '${user.displayName} blinded the streamer for 10 seconds!',
    bannerColor: '#64748b',
  },
  {
    id: 'cmd-lava',
    label: '🔥 Lava Hazard Warning',
    icon: '🔥',
    command: 'execute at @p run setblock ~ ~ ~ minecraft:lava[level=7] keep',
    defaultFeedbackTitle: '🔥 LAVA AT YOUR FEET!',
    defaultFeedbackDesc: '${user.displayName} spawned a lava leak!',
    bannerColor: '#f97316',
  },
  {
    id: 'cmd-speed',
    label: '⚡ Sonic Speed (20s)',
    icon: '🏃',
    command: 'effect give @p minecraft:speed 20 2',
    defaultFeedbackTitle: '🏃 SUPER SONIC SPEED!',
    defaultFeedbackDesc: '${user.displayName} supercharged the streamer with Swiftness!',
    bannerColor: '#00f0ff',
  },
  {
    id: 'cmd-hearts',
    label: '❤️ Heart Particle Burst',
    icon: '❤️',
    command: 'execute at @p run particle heart ~ ~1 ~ 0.8 0.8 0.8 0.1 25',
    defaultFeedbackTitle: '❤️ LOVE OVERFLOW!',
    defaultFeedbackDesc: '${user.displayName} filled the screen with hearts!',
    bannerColor: '#f43f5e',
  },
];

export interface CommunityGoalPreset {
  id: string;
  name: string;
  eventType: 'gift' | 'like' | 'follow' | 'comment';
  giftName?: string;
  targetValue: number;
  unit: string;
  rewardDescription: string;
  actionCommand: string;
  icon: string;
  bannerColor: string;
}

export const COMMUNITY_GOAL_PRESETS: CommunityGoalPreset[] = [
  {
    id: 'goal-warden-50-roses',
    name: '🌹 50 Roses ➜ Summon Warden Boss',
    eventType: 'gift',
    giftName: 'Rose',
    targetValue: 50,
    unit: 'Roses',
    rewardDescription: 'Summon Warden Boss Battle',
    actionCommand: 'execute at @p run summon warden ~ ~ ~ {CustomName:\'"COMMUNITY BOSS: WARDEN"\'}',
    icon: '🌹',
    bannerColor: '#f43f5e',
  },
  {
    id: 'goal-likes-150',
    name: '❤️ 150 Likes ➜ Diamond Party',
    eventType: 'like',
    targetValue: 150,
    unit: 'Likes',
    rewardDescription: 'Give 5 Diamonds to Everyone',
    actionCommand: 'give @a minecraft:diamond 5',
    icon: '❤️',
    bannerColor: '#f59e0b',
  },
  {
    id: 'goal-icecream-30',
    name: '🍦 30 Ice Creams ➜ Zombie Apocalypse',
    eventType: 'gift',
    giftName: 'Ice Cream',
    targetValue: 30,
    unit: 'Ice Creams',
    rewardDescription: 'Summon Zombie Horde Raid',
    actionCommand: 'execute at @p run summon zombie ~ ~ ~',
    icon: '🍦',
    bannerColor: '#06b6d4',
  },
  {
    id: 'goal-moneygun-10',
    name: '💸 10 Money Guns ➜ Mega TNT Detonation',
    eventType: 'gift',
    giftName: 'Money Gun',
    targetValue: 10,
    unit: 'Money Guns',
    rewardDescription: 'Spawn TNT Explosion Cluster',
    actionCommand: 'execute at @p run summon tnt ~ ~2 ~ {Fuse:40}',
    icon: '💸',
    bannerColor: '#10b981',
  },
  {
    id: 'goal-lion-1',
    name: '🦁 1 Lion ➜ Charged Creeper Boss',
    eventType: 'gift',
    giftName: 'Lion',
    targetValue: 1,
    unit: 'Lions',
    rewardDescription: 'Summon Charged Creeper Boss',
    actionCommand: 'execute at @p run summon creeper ~ ~ ~ {powered:1b,CustomName:\'"COMMUNITY BOSS: CHARGED CREEPER"\'}',
    icon: '🦁',
    bannerColor: '#f59e0b',
  },
  {
    id: 'goal-follows-20',
    name: '⭐ 20 Follows ➜ Streamer Speed Boost',
    eventType: 'follow',
    targetValue: 20,
    unit: 'Follows',
    rewardDescription: 'Speed Buff (30s)',
    actionCommand: 'effect give @p minecraft:speed 30 2',
    icon: '⭐',
    bannerColor: '#eab308',
  },
];
