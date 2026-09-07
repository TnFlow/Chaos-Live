import type { ChaosEvent } from '@chaos-live/shared-protocol';

export interface LikeAccumulatorOptions {
  /**
   * Silencio, en ms, tras el último toque antes de dar la tanda por cerrada.
   * Por defecto 2.000: un espectador que sigue tocando la pantalla no cierra
   * su tanda hasta que para.
   */
  readonly quietMs?: number;
  /**
   * Tope de espera, en ms, por muy seguido que siga tocando. Por defecto
   * 8.000. Sin él, quien no para nunca no aparecería jamás en el overlay.
   */
  readonly maxWindowMs?: number;
}

interface Tanda {
  evento: ChaosEvent<'like'>;
  total: number;
  abiertaEn: number;
  temporizador?: ReturnType<typeof setTimeout>;
}

/**
 * Junta los "me gusta" de cada espectador en una sola cifra, como hace TikTok.
 *
 * TikTok no manda un mensaje por toque: manda tandas, cada una con los toques
 * que ha juntado en ese momento. Emitiendo cada tanda por separado, el overlay
 * enseñaba una ristra de líneas de la misma persona y ningún número se parecía
 * al que ve el streamer en su móvil.
 *
 * Aquí se acumulan por espectador y se emite una sola vez, con el total de
 * verdad, cuando deja de tocar (o al llegar al tope de espera, para que quien
 * no para tampoco desaparezca del overlay).
 */
export class LikeAccumulator {
  private readonly quietMs: number;
  private readonly maxWindowMs: number;
  private readonly tandas = new Map<string, Tanda>();

  constructor(
    private readonly onFlush: (event: ChaosEvent<'like'>) => void,
    options: LikeAccumulatorOptions = {},
  ) {
    this.quietMs = options.quietMs ?? 2000;
    this.maxWindowMs = options.maxWindowMs ?? 8000;
  }

  /** Suma un evento ya normalizado a la tanda de su espectador. */
  public add(event: ChaosEvent<'like'>): void {
    const userId = event.user?.id ?? 'unknown_user';
    const cuantos = Math.max(1, Number(event.metadata?.likeCount ?? event.value ?? 1));

    const abierta = this.tandas.get(userId);
    const ahora = Date.now();

    if (!abierta) {
      const tanda: Tanda = { evento: event, total: cuantos, abiertaEn: ahora };
      this.tandas.set(userId, tanda);
      this.rearmar(userId, tanda, this.quietMs);
      return;
    }

    abierta.total += cuantos;
    // Quedarse con el último evento: trae el nombre más reciente por si lo cambió.
    abierta.evento = event;

    // Si lleva tocando desde hace mucho, se cierra ya y se abre otra tanda: es
    // preferible enseñar un número parcial a no enseñar nada mientras siga.
    const esperaRestante = this.maxWindowMs - (ahora - abierta.abiertaEn);
    this.rearmar(userId, abierta, Math.max(0, Math.min(this.quietMs, esperaRestante)));
  }

  /** Cierra y emite todas las tandas abiertas. */
  public flushAll(): void {
    for (const userId of Array.from(this.tandas.keys())) {
      this.flush(userId);
    }
  }

  /** Descarta lo acumulado sin emitir. Para un cierre en el que ya no importa. */
  public clear(): void {
    for (const tanda of this.tandas.values()) {
      if (tanda.temporizador) clearTimeout(tanda.temporizador);
    }
    this.tandas.clear();
  }

  private rearmar(userId: string, tanda: Tanda, retardo: number): void {
    if (tanda.temporizador) clearTimeout(tanda.temporizador);

    tanda.temporizador = setTimeout(() => this.flush(userId), retardo);
    // Una tanda pendiente no puede ser lo único que mantenga vivo el proceso.
    tanda.temporizador.unref?.();
  }

  private flush(userId: string): void {
    const tanda = this.tandas.get(userId);
    if (!tanda) return;

    if (tanda.temporizador) clearTimeout(tanda.temporizador);
    this.tandas.delete(userId);

    this.onFlush({
      ...tanda.evento,
      value: tanda.total,
      metadata: { ...tanda.evento.metadata, likeCount: tanda.total },
      timestamp: Date.now(),
    });
  }
}
