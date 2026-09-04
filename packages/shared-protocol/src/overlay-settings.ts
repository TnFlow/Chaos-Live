/**
 * Ajustes del overlay de OBS.
 *
 * Es contrato entre el backend (que los persiste y los sirve en
 * `/api/overlay-settings`) y el cliente del overlay (que los aplica), así que
 * vive aquí y no en ninguno de los dos lados. Antes estaban duplicados en tres
 * sitios y se desincronizaban.
 */

export type OverlayLayout = 'landscape' | 'vertical' | 'compact' | 'modular';
export type OverlayTheme =
  | 'cyberpunk'
  | 'streamtoearn'
  | 'obsidian'
  | 'tiktok-rose'
  | 'amber-sunset';
export type RewardsDisplayMode = 'both' | 'ticker' | 'menu' | 'off';
export type WidgetPosition = 'top' | 'bottom' | 'left' | 'right' | 'hidden';

export interface OverlaySettings {
  layout: OverlayLayout;
  theme: OverlayTheme;
  /** Escala global del overlay, de 0.7 a 1.5. */
  scale: number;
  /** Volumen maestro, de 0.0 a 1.0. */
  masterVolume: number;
  soundEnabled: boolean;

  // Visibilidad y posición de cada widget
  goalPosition: 'top' | 'bottom' | 'hidden';
  feedPosition: 'left' | 'right' | 'hidden';
  leaderboardPosition: 'right' | 'left' | 'hidden';
  rewardsMode: RewardsDisplayMode;
  /** Duración de una vuelta completa del marquesina, de 15 a 45 segundos. */
  marqueeSpeedSeconds: number;

  // Estética
  /** Opacidad del efecto cristal, de 0.4 a 0.95. */
  glassIntensity: number;
  /** Intensidad del brillo, de 0.2 a 1.0. */
  glowIntensity: number;
  fontFamily: 'Outfit' | 'Inter' | 'Plus Jakarta Sans' | 'JetBrains Mono';
  /** Cuánto permanece en pantalla una alerta, de 3 a 10 segundos. */
  bannerDurationSeconds: number;
}

export const DEFAULT_OVERLAY_SETTINGS: OverlaySettings = {
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
