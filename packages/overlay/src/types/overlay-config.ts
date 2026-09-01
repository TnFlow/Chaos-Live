export type OverlayLayout = 'landscape' | 'vertical' | 'compact' | 'modular';
export type OverlayTheme = 'cyberpunk' | 'streamtoearn' | 'obsidian' | 'tiktok-rose' | 'amber-sunset';
export type RewardsDisplayMode = 'both' | 'ticker' | 'menu' | 'off';
export type WidgetPosition = 'top' | 'bottom' | 'left' | 'right' | 'hidden';

export interface OverlayCustomSettings {
  layout: OverlayLayout;
  theme: OverlayTheme;
  scale: number; // 0.7 to 1.5
  masterVolume: number; // 0.0 to 1.0
  soundEnabled: boolean;
  
  // Widget Visibility & Positions
  goalPosition: 'top' | 'bottom' | 'hidden';
  feedPosition: 'left' | 'right' | 'hidden';
  leaderboardPosition: 'right' | 'left' | 'hidden';
  rewardsMode: RewardsDisplayMode;
  marqueeSpeedSeconds: number; // 15 to 45
  
  // Visual Aesthetics
  glassIntensity: number; // 0.4 to 0.95
  glowIntensity: number; // 0.2 to 1.0
  fontFamily: 'Outfit' | 'Inter' | 'Plus Jakarta Sans' | 'JetBrains Mono';
  bannerDurationSeconds: number; // 3 to 10
}

export const DEFAULT_OVERLAY_SETTINGS: OverlayCustomSettings = {
  layout: 'landscape',
  theme: 'cyberpunk',
  scale: 1.0,
  masterVolume: 0.8,
  soundEnabled: true,
  goalPosition: 'top',
  feedPosition: 'left',
  leaderboardPosition: 'right',
  rewardsMode: 'both',
  marqueeSpeedSeconds: 28,
  glassIntensity: 0.75,
  glowIntensity: 0.8,
  fontFamily: 'Outfit',
  bannerDurationSeconds: 4.8,
};

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
