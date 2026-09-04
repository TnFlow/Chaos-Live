/**
 * Tipos y valores por defecto del overlay.
 *
 * La forma de los ajustes y sus valores por defecto viven en
 * `@chaos-live/shared-protocol`, porque son contrato con el backend que los
 * persiste y los sirve. Aquí solo se reexportan por comodidad, junto con las
 * paletas de tema, que son puramente presentación del cliente.
 */
export { DEFAULT_OVERLAY_SETTINGS } from '@chaos-live/shared-protocol';
export type {
  OverlaySettings,
  OverlaySettings as OverlayCustomSettings,
  OverlayLayout,
  OverlayTheme,
  RewardsDisplayMode,
  WidgetPosition,
} from '@chaos-live/shared-protocol';

export const THEME_PALETTES = {
  cyberpunk: {
    name: '⚡ Cyberpunk Neon',
    accent1: '#00f0ff',
    accent2: '#f43f5e',
    accent3: '#10b981',
    bgGlass: 'rgba(10, 15, 30, 0.75)',
    borderGlow: 'rgba(0, 240, 255, 0.3)',
  },
  streamtoearn: {
    name: '💎 StreamToEarn Pro',
    accent1: '#10b981',
    accent2: '#f59e0b',
    accent3: '#06b6d4',
    bgGlass: 'rgba(6, 26, 20, 0.82)',
    borderGlow: 'rgba(16, 185, 129, 0.4)',
  },
  obsidian: {
    name: '🖤 Obsidian Dark',
    accent1: '#38bdf8',
    accent2: '#a855f7',
    accent3: '#e2e8f0',
    bgGlass: 'rgba(15, 17, 23, 0.92)',
    borderGlow: 'rgba(255, 255, 255, 0.15)',
  },
  'tiktok-rose': {
    name: '🌹 TikTok Vibrant',
    accent1: '#fe2c55',
    accent2: '#25f4ee',
    accent3: '#fcd34d',
    bgGlass: 'rgba(20, 10, 18, 0.85)',
    borderGlow: 'rgba(254, 44, 85, 0.35)',
  },
  'amber-sunset': {
    name: '🔥 Amber Sunset',
    accent1: '#f59e0b',
    accent2: '#ef4444',
    accent3: '#eab308',
    bgGlass: 'rgba(28, 18, 10, 0.84)',
    borderGlow: 'rgba(245, 158, 11, 0.4)',
  },
};
