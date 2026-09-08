/**
 * Puente entre las dos ventanas propias de la app (la de arranque y la de
 * primeros pasos) y el proceso principal.
 *
 * Es CommonJS a propósito: un preload en modulos ES solo funciona con el
 * aislamiento del renderizador desactivado, y desactivarlo para ahorrarse una
 * extension de fichero seria un mal negocio.
 *
 * Se expone lo justo. El panel de Chaos-Live, que se sirve por HTTP, no ve nada
 * de esto: se carga con `loadURL` en la misma ventana, pero solo estas dos
 * paginas locales usan el puente.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chaos', {
  /** Las lineas que ya ha escrito el servidor, para no empezar en blanco. */
  registro: () => ipcRenderer.invoke('chaos:registro'),

  /** Se llama con cada linea nueva del servidor. */
  alRegistrar: (callback) => {
    ipcRenderer.on('chaos:log', (_evento, linea) => callback(linea));
  },

  estadoInicial: () => ipcRenderer.invoke('chaos:estado-inicial'),
  guardarCanal: (canal) => ipcRenderer.invoke('chaos:guardar-canal', canal),
  instalarMod: () => ipcRenderer.invoke('chaos:instalar-mod'),
  modoSimulacion: () => ipcRenderer.invoke('chaos:modo-simulacion'),
});
