/**
 * Estado derivado del HUD pixel (layout `minecraft`).
 *
 * El backend no manda ni una cola de efectos ni cooldowns por regla: solo
 * `CHAOS_EVENT` cuando alguien interactúa y `ACTION_DISPATCHED` cuando el
 * comando ya salió hacia la partida. El HUD del diseño sí enseña ambas cosas,
 * así que se reconstruyen aquí, en el cliente, a partir de esos dos paquetes.
 *
 * Son estimaciones de presentación, no verdad del servidor: la ETA se calcula
 * por posición en la cola y el cooldown mide "cuánto hace que se disparó",
 * porque no hay un cooldown real configurable en las reglas todavía.
 */

/** Un efecto que la audiencia pagó y que aún no se ha visto en la partida. */
export interface QueuedEffect {
  /** `id` del evento de origen, que es el `correlationId` de la acción. */
  id: string;
  emoji: string;
  label: string;
  /** Regla que disparó el efecto, para marcarle el cooldown a su tarjeta. */
  rewardId?: string;
  /** `pending`: el motor aún no lo ha despachado. `running`: ya está en la partida. */
  status: 'pending' | 'running';
  queuedAt: number;
}

/** Cómo se pinta el cooldown de una tarjeta de regalo. */
export interface CooldownView {
  ready: boolean;
  label: string;
  color: string;
  /** Porcentaje de barra roja restante, de 0 (listo) a 100 (recién disparado). */
  pct: number;
}

/** Cuántos efectos se guardan en la cola antes de descartar los más viejos. */
export const MAX_QUEUE_LENGTH = 6;

/** Segundos que se le estiman a cada efecto por delante para calcular la ETA. */
export const SECONDS_PER_EFFECT = 3;

/**
 * Cuánto espera un efecto pendiente antes de darse por perdido.
 *
 * Es holgado a propósito: con la cola del motor llena, un efecto legítimo
 * puede tardar bastante en despacharse y no debe desaparecer del HUD antes de
 * verse en la partida.
 */
export const PENDING_TTL_MS = 15_000;

/** Cuánto sigue visible un efecto en la cola después de dispararse. */
export const RUNNING_TTL_MS = 2_600;

/** Cuánto dura, en segundos, el cooldown visual de una tarjeta de regalo. */
export const REWARD_COOLDOWN_SECONDS = 23;

const READY_COLOR = '#8fd694';
const COOLING_COLOR = '#f0526a';

/** Añade un efecto pendiente, sin duplicar si el evento ya estaba en la cola. */
export function enqueueEffect(queue: QueuedEffect[], entry: QueuedEffect): QueuedEffect[] {
  if (queue.some((q) => q.id === entry.id)) return queue;
  return [...queue, entry].slice(-MAX_QUEUE_LENGTH);
}

/**
 * Marca como `running` el efecto que el motor acaba de despachar.
 *
 * Si la acción llega sin un evento previo en la cola (por ejemplo tras recargar
 * la fuente de OBS a mitad de racha) se inserta igualmente, para que la cola no
 * se quede muda.
 */
export function markEffectRunning(
  queue: QueuedEffect[],
  id: string,
  fallback: Omit<QueuedEffect, 'id' | 'status'>
): QueuedEffect[] {
  const found = queue.some((q) => q.id === id);
  if (!found) {
    return [...queue, { ...fallback, id, status: 'running' as const }].slice(-MAX_QUEUE_LENGTH);
  }
  // `queuedAt` pasa a contar desde el despacho: a partir de aquí es lo que
  // mide cuánto le queda al efecto en pantalla, no cuánto llevaba esperando.
  return queue.map((q) =>
    q.id === id ? { ...q, status: 'running' as const, queuedAt: fallback.queuedAt } : q
  );
}

/**
 * Descarta los efectos que ya no tienen nada que contar.
 *
 * Un `pending` caduca porque puede no llegar nunca su `ACTION_DISPATCHED`: el
 * regalo puede no casar con ninguna regla, o casar con una en cooldown, o que
 * la cola del motor lo rechace por capacidad. Nada de eso se retransmite al
 * overlay, así que sin caducidad la cola se quedaria con regalos fantasma y
 * ETAs que no van a cumplirse. Un `running` caduca simplemente porque ya se
 * vio en la partida.
 *
 * Devuelve la misma referencia si no sobra nada, para no repintar la cola en
 * cada tick del reloj.
 */
export function pruneEffects(queue: QueuedEffect[], now: number): QueuedEffect[] {
  const kept = queue.filter(
    (q) => now - q.queuedAt < (q.status === 'running' ? RUNNING_TTL_MS : PENDING_TTL_MS)
  );
  return kept.length === queue.length ? queue : kept;
}

/** Texto de la columna derecha de la cola: lo que ya corre pone "AHORA". */
export function etaLabel(effect: QueuedEffect, index: number): string {
  if (effect.status === 'running') return 'AHORA';
  return `${Math.max(1, index) * SECONDS_PER_EFFECT}s`;
}

/**
 * Traduce el momento del último disparo a la barrita de cooldown de la tarjeta.
 *
 * Sin disparo previo la recompensa se considera lista, que es lo que quiere ver
 * la audiencia al abrir el directo.
 */
export function cooldownView(lastFiredAt: number | undefined, now: number): CooldownView {
  if (!lastFiredAt) return { ready: true, label: 'LISTO', color: READY_COLOR, pct: 0 };
  const elapsed = (now - lastFiredAt) / 1000;
  const left = REWARD_COOLDOWN_SECONDS - elapsed;
  if (left <= 0) return { ready: true, label: 'LISTO', color: READY_COLOR, pct: 0 };
  return {
    ready: false,
    label: `${Math.ceil(left)}s`,
    color: COOLING_COLOR,
    pct: Math.round((left / REWARD_COOLDOWN_SECONDS) * 100),
  };
}

/** Número de páginas del carrusel de regalos. */
export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, perPage)));
}

/** La página `page` (base 0) de una lista, recortada al final si sobra. */
export function pageOf<T>(list: T[], page: number, perPage: number): T[] {
  const size = Math.max(1, perPage);
  const start = (page % pageCount(list.length, size)) * size;
  return list.slice(start, start + size);
}

/** Las tres piezas que el HUD saca del nombre de una meta. */
export interface GoalParts {
  emoji: string;
  title: string;
  reward: string;
}

const GOAL_SEPARATORS = /\s*(?:➜|→|->|=>)\s*/;
const LEADING_EMOJI = /^(\p{Extended_Pictographic}(?:\uFE0F)?)\s*/u;

/**
 * Parte el nombre de una meta en emoji, título y recompensa.
 *
 * Las metas se nombran "🌹 50 Rosas ➜ Invocar al Warden", que en el diseño son
 * tres huecos distintos: la casilla de inventario, el titular y la línea
 * "DESBLOQUEA". Si el nombre no trae flecha, la recompensa queda vacía y el
 * pie simplemente no se pinta.
 */
export function splitGoalName(name: string | undefined): GoalParts {
  const raw = (name ?? '').trim();
  const emojiMatch = raw.match(LEADING_EMOJI);
  const emoji = emojiMatch?.[1] ?? '🎯';
  const rest = emojiMatch ? raw.slice(emojiMatch[0].length) : raw;
  const [title, ...tail] = rest.split(GOAL_SEPARATORS);
  return { emoji, title: (title ?? '').trim(), reward: tail.join(' ').trim() };
}

const ITEM_PATTERNS: [RegExp, string][] = [
  [/summon\s+creeper[^]*powered/i, 'charged creeper'],
  [/summon\s+lightning_bolt/i, 'lightning'],
  [/summon\s+elder_guardian/i, 'elder guardian'],
  [/summon\s+(\w+)/i, '$1'],
  [/effect\s+give\s+\S+\s+(?:minecraft:)?(\w+)/i, '$1'],
  [/particle\s+(\w+)/i, '$1'],
  [/give\s+\S+\s+(?:minecraft:)?(\w+)/i, '$1'],
  [/(?:weather|time)\s+(\w+)/i, '$1'],
];

/**
 * Nombre corto del item o entidad que invoca un comando.
 *
 * Es lo que va dentro de la casilla pequeña de cada tarjeta de regalo: el
 * comando completo no cabe, pero "charged creeper" o "tnt" se lee de un vistazo
 * y le dice a la audiencia qué va a aparecer en la partida.
 */
export function itemLabelFromCommand(command: string | undefined): string {
  const raw = (command ?? '').trim();
  if (!raw) return '???';
  for (const [pattern, replacement] of ITEM_PATTERNS) {
    const match = raw.match(pattern);
    if (match) {
      return replacement.startsWith('$')
        ? (match[Number(replacement.slice(1))] ?? '???').replace(/_/g, ' ')
        : replacement;
    }
  }
  return raw.split(/\s+/).slice(-1)[0]?.replace(/_/g, ' ') ?? '???';
}

/**
 * Decide si un comando ya ejecutado salió de una plantilla de regla.
 *
 * El motor interpola la plantilla antes de despachar (`summon lightning_bolt
 * ${user.displayName}` sale como `summon lightning_bolt ana_88`), así que
 * comparar los dos textos tal cual solo acierta en las reglas sin
 * marcadores. Aquí la plantilla se convierte en un patrón donde cada `${...}`
 * acepta cualquier cosa, incluida la cadena vacía: un marcador puede
 * interpolarse a nada si el evento no traía ese dato.
 */
export function matchesCommandTemplate(
  template: string | undefined,
  command: string | undefined
): boolean {
  if (!template || !command) return false;
  if (template === command) return true;
  const pattern = template
    .split(/\$\{[^}]*\}/)
    .map((chunk) => chunk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${pattern}$`).test(command);
}
