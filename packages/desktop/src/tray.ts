import path from 'node:path';
import { Menu, Tray, app, clipboard, nativeImage, shell } from 'electron';
import { getDataDir, getLogDir, getResourcesDir } from './user-data.js';

/**
 * Icono de la bandeja.
 *
 * Existe porque cerrar la ventana **no** cierra Chaos-Live: durante un directo,
 * cerrar el panel sin querer no puede dejar a la audiencia sin efectos. La
 * bandeja es la forma de volver, y de salir de verdad cuando toca.
 */

export interface AccionesBandeja {
  abrirPanel: () => void;
  urlOverlay: () => string;
  salir: () => void;
}

let bandeja: Tray | undefined;

export function crearBandeja(acciones: AccionesBandeja): Tray {
  const icono = nativeImage.createFromPath(path.join(getResourcesDir(), 'icon.ico'));
  bandeja = new Tray(icono.isEmpty() ? nativeImage.createEmpty() : icono);

  const menu = Menu.buildFromTemplate([
    { label: 'Abrir el panel', click: acciones.abrirPanel },
    {
      label: 'Copiar el enlace del overlay',
      click: () => clipboard.writeText(acciones.urlOverlay()),
    },
    { type: 'separator' },
    { label: 'Abrir la carpeta de datos', click: () => void shell.openPath(getDataDir()) },
    { label: 'Ver el registro', click: () => void shell.openPath(getLogDir()) },
    { type: 'separator' },
    { label: 'Salir de Chaos-Live', click: acciones.salir },
  ]);

  bandeja.setToolTip('Chaos-Live');
  bandeja.setContextMenu(menu);
  bandeja.on('double-click', acciones.abrirPanel);

  return bandeja;
}

export function destruirBandeja(): void {
  bandeja?.destroy();
  bandeja = undefined;
}

/** Aviso, una sola vez, de que cerrar la ventana no apaga el directo. */
export function avisarDeLaBandeja(): void {
  bandeja?.displayBalloon({
    title: 'Chaos-Live sigue funcionando',
    content:
      'El panel se ha cerrado, pero los efectos siguen llegando a tu partida. ' +
      'Para apagarlo del todo, usa "Salir de Chaos-Live" en este icono.',
    iconType: 'info',
  });
}

/** Cierra la app de verdad. Se expone para que el menú y la ventana coincidan. */
export function prepararSalida(): void {
  app.quit();
}
