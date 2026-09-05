/**
 * Tipos de vista del overlay.
 *
 * Son las formas que consumen los widgets, ya preparadas para pintar: el
 * overlay traduce cada paquete del servidor a estas estructuras una sola vez,
 * en lugar de que cada widget tenga que interpretar el evento crudo.
 */
import type { StreamUser } from '@chaos-live/shared-protocol';

export type { LeaderboardEntry } from './types';

/** Una línea del feed de interacciones recientes. */
export interface FeedItem {
  id: string;
  type: 'gift' | 'like' | 'follow' | 'comment' | 'share';
  user: StreamUser;
  value: number;
  title: string;
  subtitle: string;
  timestamp: number;
  icon: string;
  accentColor: string;
}

/** La alerta grande que aparece en el centro de la pantalla. */
export interface AlertView {
  id: string;
  title: string;
  sender: string;
  giftName?: string;
  value: number;
  command?: string;
  icon: string;
  imageUrl?: string;
  color: string;
  viewerFeedback?: {
    title?: string;
    description?: string;
    bannerColor?: string;
    soundEffect?: string;
  };
}

/** Un comando ya ejecutado, para la marquesina inferior. */
export interface ActionView {
  id: string;
  actionType: string;
  command: string;
  timestamp: number;
}

/** Progreso de una meta comunitaria tal y como se dibuja. */
export interface GoalView {
  id: string;
  name: string;
  eventType: string;
  targetValue: number;
  currentValue: number;
  percent: number;
  completed?: boolean;
}

/**
 * Una recompensa del menú que ve la audiencia: qué regalo la activa, cuánto
 * cuesta y qué pasa en la partida.
 */
export interface RewardView {
  id: string;
  giftName: string;
  cost: number;
  rewardText: string;
  icon: string;
  imageUrl?: string;
  color: string;
  /** Comando que ejecuta la regla, para etiquetar el item en el HUD pixel. */
  command?: string;
  /** Tipo de evento que la dispara (`gift`, `like`, ...). */
  eventType?: string;
}

/** Una regla, tal y como la recibe el overlay para construir el menú. */
export interface RuleView {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  icon?: string;
  imageUrl?: string;
  matcher: {
    platforms?: string[];
    eventTypes?: string[];
    minValue?: number;
    metadataMatch?: { giftName?: string };
  };
  action: {
    actionType: string;
    command: string;
  };
  viewerFeedback?: {
    title?: string;
    description?: string;
    bannerColor?: string;
    soundEffect?: string;
  };
}
