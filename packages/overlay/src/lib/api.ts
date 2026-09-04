/**
 * Cliente de la API REST de Chaos-Live.
 *
 * Antes cada vista del panel hacía su propio `fetch('/api/...')` a mano, unas
 * veinte veces, cada una con su propio manejo de errores (o sin ninguno). Al
 * centralizarlo aquí, los mensajes de error del servidor llegan de verdad a la
 * interfaz en lugar de perderse en un `catch {}` vacío.
 */
import type {
  Diagnostics,
  Goal,
  HistoryEvent,
  RuleDefinition,
  SystemStatus,
} from './types';
import type { OverlaySettings, TikTokGiftPreset } from '@chaos-live/shared-protocol';

/** Error de la API que conserva el mensaje explicativo del servidor. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Mensaje listo para enseñar al usuario, con el detalle si lo hay. */
  get userMessage(): string {
    return this.details.length > 0 ? this.details.join(' ') : this.message;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers:
        init?.body !== undefined
          ? { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
          : init?.headers,
    });
  } catch (err) {
    throw new ApiError(
      'No se pudo contactar con Chaos-Live. ¿Sigue abierta la ventana del servidor?',
      0,
      [err instanceof Error ? err.message : String(err)],
    );
  }

  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }

  if (!res.ok) {
    const parsed = body as { error?: string; message?: string; details?: string[] } | undefined;
    throw new ApiError(
      parsed?.error || parsed?.message || `La petición falló (${res.status})`,
      res.status,
      Array.isArray(parsed?.details) ? parsed.details : [],
    );
  }

  return body as T;
}

export const api = {
  getStatus: () => request<SystemStatus>('/api/status'),

  getDiagnostics: () => request<Diagnostics>('/api/diagnostics'),

  getRules: () => request<RuleDefinition[]>('/api/rules'),

  createRule: (rule: Partial<RuleDefinition>) =>
    request<{ success: boolean; rule: RuleDefinition }>('/api/rules', {
      method: 'POST',
      body: JSON.stringify(rule),
    }),

  updateRule: (id: string, updates: Partial<RuleDefinition>) =>
    request<{ success: boolean; rule: RuleDefinition }>(`/api/rules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  deleteRule: (id: string) =>
    request<{ success: boolean }>(`/api/rules/${id}`, { method: 'DELETE' }),

  testRule: (id: string) =>
    request<{ success: boolean; message: string }>(`/api/rules/${id}/test`, { method: 'POST' }),

  getGiftPresets: () => request<TikTokGiftPreset[]>('/api/gifts/presets'),

  getGoals: () => request<Goal[]>('/api/goals'),

  createGoal: (goal: Partial<Goal>) =>
    request<{ success: boolean; goal: Goal }>('/api/goals', {
      method: 'POST',
      body: JSON.stringify(goal),
    }),

  updateGoal: (id: string, updates: Partial<Goal>) =>
    request<{ success: boolean; goal: Goal }>(`/api/goals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  deleteGoal: (id: string) =>
    request<{ success: boolean }>(`/api/goals/${id}`, { method: 'DELETE' }),

  resetGoal: (id: string) =>
    request<{ success: boolean; goal: Goal }>(`/api/goals/${id}/reset`, { method: 'POST' }),

  getOverlaySettings: () => request<OverlaySettings>('/api/overlay-settings'),

  updateOverlaySettings: (updates: Partial<OverlaySettings>) =>
    request<{ success: boolean; settings: OverlaySettings }>('/api/overlay-settings', {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  /**
   * Historial de eventos procesados.
   *
   * Traduce los nombres de columna de Prisma a los que usa la interfaz. Sin esta
   * traducción el panel mostraba el usuario en blanco y un guion en cada
   * comando, porque leía campos que la API nunca envió con ese nombre.
   */
  async getHistory(limit = 30): Promise<HistoryEvent[]> {
    const data = await request<{ events: Record<string, unknown>[] }>(`/api/history?limit=${limit}`);
    return (data.events ?? []).map((row) => ({
      id: String(row['id'] ?? ''),
      platform: String(row['platform'] ?? ''),
      eventType: String(row['eventType'] ?? ''),
      userName: String(row['userDisplayName'] ?? 'Desconocido'),
      value: Number(row['value'] ?? 0),
      actionDispatched: Boolean(row['actionDispatched']),
      actionCommand: (row['command'] as string | null) ?? undefined,
      success: Boolean(row['success']),
      error: (row['error'] as string | null) ?? undefined,
      executionTimeMs: (row['durationMs'] as number | null) ?? undefined,
      createdAt: String(row['createdAt'] ?? new Date().toISOString()),
    }));
  },

  injectTestEvent: (event: Record<string, unknown>) =>
    request<{ success: boolean }>('/api/test/event', {
      method: 'POST',
      body: JSON.stringify(event),
    }),

  pauseQueue: () => request<{ isPaused: boolean }>('/api/queue/pause', { method: 'POST' }),

  resumeQueue: () => request<{ isPaused: boolean }>('/api/queue/resume', { method: 'POST' }),

  clearQueue: () => request<{ success: boolean }>('/api/queue/clear', { method: 'POST' }),
};
