/**
 * Tipos compartidos entre el panel y el overlay.
 *
 * Reflejan lo que devuelve la API de Chaos-Live. Los tipos del dominio
 * (`OverlaySettings`, catálogo de regalos) viven en `@chaos-live/shared-protocol`;
 * aquí solo están las formas propias de la interfaz.
 */

export interface RuleMatcher {
  platforms?: string[];
  eventTypes?: string[];
  minValue?: number;
  maxValue?: number;
  metadataMatch?: Record<string, unknown>;
}

export interface RuleDefinition {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  cooldownSeconds?: number;
  cooldownMs?: number;
  icon?: string;
  imageUrl?: string;
  matcher: RuleMatcher;
  action: {
    actionType: string;
    command: string;
    payload?: Record<string, unknown>;
  };
  viewerFeedback?: {
    title?: string;
    description?: string;
    bannerColor?: string;
    soundEffect?: string;
  };
}

export interface Goal {
  id: string;
  name: string;
  eventType: string;
  giftName?: string;
  currentValue: number;
  targetValue: number;
  unit: string;
  rewardDescription: string;
  actionCommand: string;
  actionType?: string;
  completed: boolean;
  repeatable?: boolean;
}

/** Estado de un adapter de plataforma, tal y como lo publica `/api/status`. */
export interface PlatformStatus {
  name: string;
  connected: boolean;
  circuitState?: string;
}

export interface SystemStatus {
  status: string;
  uptime: number;
  /** Base de las URLs de widget para TikTok LIVE Studio (puerto publico). */
  overlayBaseUrl?: string;
  isPaused: boolean;
  queue: {
    size: number;
    isEmpty: boolean;
  };
  adapters: {
    game: string;
    gameConnected: boolean;
    platforms: PlatformStatus[];
    clients: {
      total: number;
      overlay: number;
      mod: number;
    };
  };
  rulesCount: number;
  goalsCount: number;
}

/**
 * Fila del historial ya normalizada para la interfaz.
 *
 * La API devuelve el registro de Prisma tal cual (`userDisplayName`, `command`,
 * `durationMs`), con nombres distintos de los que usaba el panel. El cliente de
 * la API traduce una sola vez, en lugar de que cada vista tenga que acordarse.
 */
export interface HistoryEvent {
  id: string;
  platform: string;
  eventType: string;
  userName: string;
  value: number;
  actionDispatched: boolean;
  actionCommand?: string;
  success: boolean;
  error?: string;
  executionTimeMs?: number;
  createdAt: string;
}

export type DiagnosticStatus = 'ok' | 'warn' | 'error';

export interface DiagnosticCheck {
  id: string;
  label: string;
  status: DiagnosticStatus;
  detail: string;
  hint?: string;
}

export interface Diagnostics {
  status: DiagnosticStatus;
  checks: DiagnosticCheck[];
}

/** Una entrada de la clasificación de la sesión, emitida por el servidor. */
export interface LeaderboardEntry {
  userId?: string;
  name: string;
  totalValue: number;
  contributions?: number;
}
