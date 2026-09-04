import type { ChaosEvent } from '@chaos-live/shared-protocol';

export interface LeaderboardEntry {
  /** Identificador del espectador en la plataforma. */
  readonly userId: string;
  /** Nombre visible, siempre el más reciente que haya usado. */
  readonly name: string;
  /** Valor acumulado durante la sesión (diamantes en TikTok). */
  readonly totalValue: number;
  /** Cuántas contribuciones ha hecho. */
  readonly contributions: number;
}

export interface SessionLeaderboardOptions {
  /** Cuántas posiciones devuelve `getTop`. Por defecto 5. */
  readonly topSize?: number;
  /**
   * Tipos de evento que puntúan. Por defecto solo los regalos: los "me gusta"
   * son gratis y ahogarían la clasificación de quien de verdad aporta.
   */
  readonly scoringEventTypes?: readonly ChaosEvent['type'][];
}

/**
 * Clasificación de la sesión, acumulada en el servidor.
 *
 * Antes se calculaba dentro del overlay, así que recargar la fuente de OBS —o
 * un cierre inesperado a mitad del directo— borraba los mayores contribuyentes.
 * Manteniéndola aquí, el overlay solo dibuja lo que recibe y puede reconectarse
 * las veces que haga falta.
 *
 * Se acumula por `userId` y no por nombre visible, porque en TikTok dos
 * espectadores pueden compartir apodo y una misma persona puede cambiárselo a
 * mitad de la sesión.
 */
export class SessionLeaderboard {
  private readonly entries = new Map<string, { name: string; totalValue: number; contributions: number }>();
  private readonly topSize: number;
  private readonly scoringEventTypes: ReadonlySet<string>;
  private startedAt = Date.now();

  constructor(options: SessionLeaderboardOptions = {}) {
    this.topSize = options.topSize ?? 5;
    this.scoringEventTypes = new Set(options.scoringEventTypes ?? ['gift']);
  }

  /**
   * Suma la aportación de un evento. Devuelve `true` si la clasificación cambió,
   * para que quien llame solo difunda cuando haya algo nuevo que mostrar.
   */
  public record(event: ChaosEvent): boolean {
    if (!this.scoringEventTypes.has(event.type)) {
      return false;
    }

    const value = Number(event.value);
    if (!Number.isFinite(value) || value <= 0) {
      return false;
    }

    const userId = event.user?.id;
    if (!userId) {
      return false;
    }

    const existing = this.entries.get(userId);
    if (existing) {
      existing.totalValue += value;
      existing.contributions += 1;
      // Quedarse con el nombre más reciente por si lo cambió.
      existing.name = event.user.displayName || existing.name;
    } else {
      this.entries.set(userId, {
        name: event.user.displayName || 'Anónimo',
        totalValue: value,
        contributions: 1,
      });
    }

    return true;
  }

  /** Devuelve las primeras posiciones, de mayor a menor aportación. */
  public getTop(limit = this.topSize): LeaderboardEntry[] {
    return Array.from(this.entries.entries())
      .map(([userId, entry]) => ({ userId, ...entry }))
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, limit);
  }

  /** Número de contribuyentes distintos en la sesión. */
  public size(): number {
    return this.entries.size;
  }

  /** Suma total aportada en la sesión. */
  public getTotalValue(): number {
    let total = 0;
    for (const entry of this.entries.values()) {
      total += entry.totalValue;
    }
    return total;
  }

  /** Momento en el que empezó la sesión actual. */
  public getStartedAt(): number {
    return this.startedAt;
  }

  /** Vacía la clasificación y arranca una sesión nueva. */
  public reset(): void {
    this.entries.clear();
    this.startedAt = Date.now();
  }
}
