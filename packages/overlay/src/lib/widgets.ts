/**
 * Catalogo de widgets del overlay.
 *
 * TikTok LIVE Studio no tiene Browser Source: tiene fuentes `Link`, y el patron
 * del ecosistema es una URL por widget, para poder colocar cada pieza por
 * separado en la escena vertical. Esta lista es la que decide que URLs existen,
 * y la comparte quien las sirve con quien las ensena al streamer.
 *
 * Hay dos familias visuales y no cubren lo mismo. El HUD pixel (tema
 * `minecraft`) tiene cola de efectos y el de cristal no; el de cristal tiene
 * feed de interacciones y el pixel no. En vez de inventar paneles que el diseno
 * de cada familia no tiene, el catalogo declara que existe en cada una y el
 * panel solo ofrece los enlaces que el tema elegido sabe pintar.
 */

import type { OverlayTheme } from '../types/overlay-config';

export const WIDGET_NAMES = [
  'status',
  'goal',
  'goal2',
  'rewards',
  'leaderboard',
  'queue',
  'alert',
  'ticker',
  'feed',
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
  feed: 'side',
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
export const PIXEL_WIDGET_HEIGHT: Record<WidgetName, number> = {
  status: 70,
  goal: 250,
  goal2: 100,
  rewards: 570,
  leaderboard: 350,
  queue: 300,
  alert: 280,
  ticker: 80,
  feed: 420,
};

/** Ancho de la capa, en pixeles. Sale de `WIDGET_COLUMN`. */
export const PIXEL_WIDGET_WIDTH: Record<'full' | 'main' | 'side', number> = {
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
  feed: 'Interacciones recientes',
};

/** `true` si el texto pedido por `?widget=` es un widget que existe. */
export function isWidgetName(value: string | null | undefined): value is WidgetName {
  return !!value && (WIDGET_NAMES as readonly string[]).includes(value);
}

/**
 * Que sabe pintar cada familia visual.
 *
 * El tema `minecraft` trae el HUD pixel; el resto comparten el overlay de
 * cristal. `queue` solo existe en pixel y `feed` solo en cristal, asi que pedir
 * uno que el tema no tiene no debe dar una capa en blanco en pleno directo:
 * `widgetsForTheme` es lo que decide, y el panel solo lista lo aplicable.
 */
const PIXEL_ONLY: readonly WidgetName[] = ['queue'];
const GLASS_ONLY: readonly WidgetName[] = ['feed'];

/** `true` si el tema usa el HUD pixel en vez del overlay de cristal. */
export function isPixelTheme(theme: OverlayTheme): boolean {
  return theme === 'minecraft';
}

/** Los widgets que el tema dado sabe pintar, en orden de catalogo. */
export function widgetsForTheme(theme: OverlayTheme): WidgetName[] {
  const excluded = isPixelTheme(theme) ? GLASS_ONLY : PIXEL_ONLY;
  return WIDGET_NAMES.filter((name) => !excluded.includes(name));
}

/** `true` si ese widget se puede pintar con ese tema. */
export function widgetExistsInTheme(name: WidgetName, theme: OverlayTheme): boolean {
  return widgetsForTheme(theme).includes(name);
}

/**
 * Medidas de la familia de cristal, en pixeles.
 *
 * Los anchos salen de la rejilla del overlay (`.overlay-root`, en overlay.css):
 * la columna del feed mide 340px y la lateral 320.
 *
 * Los altos estan medidos en el navegador con el panel lleno, mas margen, igual
 * que los del HUD pixel. Dos son estimados y se marcan como tales: `alert` y
 * `feed` solo se pintan cuando llegan eventos en vivo, y una captura corta no
 * los alcanza. `feed` se calcula sobre las 8 tarjetas como maximo que guarda
 * App.svelte.
 */
export const GLASS_WIDGET_SIZE: Partial<Record<WidgetName, { width: number; height: number }>> = {
  status: { width: 560, height: 110 },
  goal: { width: 720, height: 120 },
  goal2: { width: 720, height: 120 },
  rewards: { width: 320, height: 520 },
  leaderboard: { width: 320, height: 320 },
  alert: { width: 760, height: 420 },
  ticker: { width: 1200, height: 100 },
  feed: { width: 340, height: 500 },
};

/** Tamano de capa de un widget con el tema dado, para documentar y para TLS. */
export function widgetSize(name: WidgetName, theme: OverlayTheme): { width: number; height: number } {
  if (isPixelTheme(theme)) {
    return {
      width: PIXEL_WIDGET_WIDTH[WIDGET_COLUMN[name]],
      height: PIXEL_WIDGET_HEIGHT[name],
    };
  }
  return GLASS_WIDGET_SIZE[name] ?? { width: 340, height: 300 };
}
