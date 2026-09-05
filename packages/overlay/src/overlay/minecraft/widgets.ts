/**
 * Catalogo de widgets del HUD pixel.
 *
 * TikTok LIVE Studio no tiene Browser Source: tiene fuentes `Link`, y el patron
 * del ecosistema es una URL por widget, para poder colocar cada pieza por
 * separado en la escena vertical. Esta lista es la que decide que URLs existen,
 * y la comparte quien las sirve (`McWidget`) con quien las ensena al streamer.
 */

export const WIDGET_NAMES = [
  'status',
  'goal',
  'goal2',
  'rewards',
  'leaderboard',
  'queue',
  'alert',
  'ticker',
] as const;

export type WidgetName = (typeof WIDGET_NAMES)[number];

/**
 * Ancho de cada widget dentro del diseno original, en columnas.
 *
 * `full` es la fila entera, `main` la columna del menu de regalos y `side` la
 * de clasificacion y cola. Las medidas exactas viven en `overlay-minecraft.css`,
 * junto a la explicacion de como salen del lienzo de 1080.
 */
export const WIDGET_COLUMN: Record<WidgetName, 'full' | 'main' | 'side'> = {
  status: 'full',
  goal: 'full',
  goal2: 'full',
  rewards: 'main',
  leaderboard: 'side',
  queue: 'side',
  alert: 'full',
  ticker: 'full',
};

/**
 * Alto que hay que darle a la capa en TikTok LIVE Studio, en pixeles.
 *
 * Son maximos medidos en el navegador con el panel lleno, mas un margen: una
 * capa corta recorta el panel (el menu de regalos pasa de 431 a 546 px cuando
 * la pagina del carrusel trae cuatro filas en vez de tres), mientras que
 * pasarse no cuesta nada, porque la pagina es transparente y el widget se
 * ancla arriba a la izquierda.
 */
export const WIDGET_HEIGHT: Record<WidgetName, number> = {
  status: 70,
  goal: 250,
  goal2: 100,
  rewards: 570,
  leaderboard: 350,
  queue: 300,
  alert: 280,
  ticker: 80,
};

/** Ancho de la capa, en pixeles. Sale de `WIDGET_COLUMN`. */
export const WIDGET_WIDTH: Record<'full' | 'main' | 'side', number> = {
  full: 1024,
  main: 593,
  side: 409,
};

/** Etiqueta legible, para la lista de enlaces del panel. */
export const WIDGET_LABEL: Record<WidgetName, string> = {
  status: 'Barra de estado',
  goal: 'Meta activa',
  goal2: 'Meta secundaria',
  rewards: 'Regalos y eventos',
  leaderboard: 'Top apoyos',
  queue: 'Cola de efectos',
  alert: 'Alertas y celebraciones',
  ticker: 'Marquesina',
};

/** `true` si el texto pedido por `?widget=` es un widget que existe. */
export function isWidgetName(value: string | null | undefined): value is WidgetName {
  return !!value && (WIDGET_NAMES as readonly string[]).includes(value);
}
