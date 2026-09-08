import path from 'node:path';
import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron';
import { ServidorChaosLive } from './server-process.js';
import { buscarParejaLibre, comprobarPuerto, esperarASalud } from './ports.js';
import { instalarMod, rutaDelJar } from './mod-installer.js';
import { avisarDeLaBandeja, crearBandeja, destruirBandeja } from './tray.js';
import {
  escribirClaveEnv,
  faltaCanal,
  getResourcesDir,
  leerClaveEnv,
  leerPuerto,
  prepararDatos,
} from './user-data.js';

/**
 * Chaos-Live como aplicación de Windows.
 *
 * Este proceso no ejecuta el motor: lo arranca, lo vigila y le pone una ventana
 * (ver `server-process.ts` para el porqué). Todo lo que hacía el lanzador de
 * PowerShell —preparar la carpeta del streamer, mirar los puertos, esperar a
 * que el servidor conteste, reintentar si se cae— sigue estando; lo que
 * desaparece es la ventana de consola y el `.bat`.
 */

// Antes que nada: `app.getPath('userData')` sale del nombre de la app, y sin
// esto la carpeta de datos se llamaria "@chaos-live/desktop".
app.setName('Chaos-Live');

/** Puertos de siempre, si el `.env` no dice otra cosa. */
const WS_PORT_POR_DEFECTO = 8080;
const OVERLAY_PORT_POR_DEFECTO = 8081;

let ventana: BrowserWindow | undefined;
let servidor: ServidorChaosLive | undefined;
let wsPort = WS_PORT_POR_DEFECTO;
let overlayPort = OVERLAY_PORT_POR_DEFECTO;
let saliendo = false;
let yaSeAviso = false;

/** Las últimas líneas del servidor, para la pantalla de arranque. */
const registro: string[] = [];

const urlPanel = (): string => `http://127.0.0.1:${wsPort}/dashboard`;
const urlOverlay = (): string => `http://127.0.0.1:${overlayPort}/?view=overlay`;

function anotar(linea: string): void {
  registro.push(linea);
  if (registro.length > 200) registro.shift();
  ventana?.webContents.send('chaos:log', linea);
}

function paginaPropia(nombre: string): string {
  return path.join(__dirname, '..', 'windows', nombre);
}

function crearVentana(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    show: false,
    backgroundColor: '#0b0f1a',
    autoHideMenuBar: true,
    icon: path.join(getResourcesDir(), 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  // El panel abre el overlay con `window.open`, y una ventana de Electron sin
  // barra de direcciones no es sitio para eso: va al navegador del sistema, que
  // es donde el streamer puede copiar la URL para OBS.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url.startsWith('/') ? `http://127.0.0.1:${wsPort}${url}` : url);
    return { action: 'deny' };
  });

  // Cerrar la ventana esconde el panel, no apaga el directo. Salir de verdad
  // es "Salir de Chaos-Live" en la bandeja.
  win.on('close', (evento) => {
    if (saliendo) return;
    evento.preventDefault();
    win.hide();
    if (!yaSeAviso) {
      yaSeAviso = true;
      avisarDeLaBandeja();
    }
  });

  return win;
}

function mostrarPanel(): void {
  if (!ventana || ventana.isDestroyed()) {
    ventana = crearVentana();
    void ventana.loadURL(urlPanel());
    return;
  }

  if (!ventana.isVisible()) ventana.show();
  if (ventana.isMinimized()) ventana.restore();
  ventana.focus();
}

/**
 * Resuelve los puertos antes de arrancar.
 *
 * Devuelve `false` si no hay forma de seguir, ya habiéndoselo explicado al
 * streamer: es mejor una ventana que dice qué pasa que diez reintentos y un
 * panel que no carga.
 */
async function resolverPuertos(): Promise<boolean> {
  wsPort = leerPuerto('WS_PORT', WS_PORT_POR_DEFECTO);
  overlayPort = leerPuerto('OVERLAY_PORT', OVERLAY_PORT_POR_DEFECTO);

  const estados = await Promise.all([comprobarPuerto(wsPort), comprobarPuerto(overlayPort)]);
  const tomados = estados.filter((e) => e.estado !== 'libre');
  if (tomados.length === 0) return true;

  const puertos = tomados.map((e) => e.puerto).join(' y ');

  // Que conteste un Chaos-Live sano no significa que sea el nuestro: el bloqueo
  // de instancia unica ya impide abrir la app dos veces, asi que esto es otro
  // servidor —la distribucion antigua, o un `npm run dev`—. Se distingue del
  // "lo tiene otro programa" porque lo que hay que hacer es distinto, pero en
  // ninguno de los dos casos se puede arrancar encima: seria un EADDRINUSE y
  // una salida con codigo 78 a los pocos segundos.
  const esOtroChaosLive = tomados.some((e) => e.estado === 'chaos-live');
  const mensaje = esOtroChaosLive
    ? `Ya hay un Chaos-Live funcionando en el puerto ${puertos}.`
    : `El puerto ${puertos} lo está usando otro programa.`;
  const pista = esOtroChaosLive
    ? 'Puede ser la versión anterior, la que se abría con el archivo .bat. Ciérrala y vuelve a ' +
      'abrir esta, o deja que esta use otros puertos.'
    : 'Cierra ese programa y vuelve a abrir Chaos-Live, o deja que use otros puertos.';

  const libres = await buscarParejaLibre(Math.max(wsPort, overlayPort) + 1);

  if (!libres) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Chaos-Live',
      message: mensaje,
      detail: `${pista}\n\nNo se ha encontrado ningún otro par de puertos libres.`,
    });
    return false;
  }

  const respuesta = await dialog.showMessageBox({
    type: 'warning',
    title: 'Chaos-Live',
    message: mensaje,
    detail:
      `${pista}\n\nSi usa el ${libres[0]} y el ${libres[1]}, se guardan como tuyos y tendrás ` +
      'que actualizar los enlaces del overlay en OBS o TikTok LIVE Studio, porque cambian de ' +
      'puerto.',
    buttons: [`Usar ${libres[0]} y ${libres[1]}`, 'Salir'],
    defaultId: 0,
    cancelId: 1,
  });

  if (respuesta.response !== 0) return false;

  [wsPort, overlayPort] = libres;
  escribirClaveEnv('WS_PORT', String(wsPort));
  escribirClaveEnv('OVERLAY_PORT', String(overlayPort));
  anotar(`Puertos cambiados a ${wsPort} y ${overlayPort}.`);
  return true;
}

async function arrancar(): Promise<void> {
  const preparacion = prepararDatos();

  ventana = crearVentana();
  await ventana.loadFile(paginaPropia('starting.html'));

  for (const problema of preparacion.problemas) anotar(`[!] ${problema}`);

  if (!(await resolverPuertos())) {
    saliendo = true;
    app.quit();
    return;
  }

  crearBandeja({
    abrirPanel: mostrarPanel,
    urlOverlay,
    salir: () => {
      saliendo = true;
      app.quit();
    },
  });

  // Primera vez: hay que saber a qué cuenta conectarse antes de nada. Sin esto
  // el servidor arranca en modo simulación y el streamer ve eventos inventados
  // creyendo que su directo no llega.
  if (preparacion.primeraVez || faltaCanal()) {
    await ventana.loadFile(paginaPropia('first-run.html'));
    return;
  }

  await arrancarServidorYMostrarPanel();
}

async function arrancarServidorYMostrarPanel(): Promise<void> {
  anotar('Arrancando Chaos-Live...');

  servidor = new ServidorChaosLive({
    wsPort,
    overlayPort,
    onLinea: anotar,
    onFalloDefinitivo: (motivo) => {
      anotar(`[X] ${motivo}`);
      void dialog.showMessageBox({
        type: 'error',
        title: 'Chaos-Live no puede arrancar',
        message: motivo,
      });
    },
  });

  servidor.arrancar();

  if (await esperarASalud(wsPort)) {
    anotar('Listo.');
    await ventana?.loadURL(urlPanel());
    return;
  }

  anotar('[X] El servidor no respondió a tiempo.');
  await dialog.showMessageBox({
    type: 'error',
    title: 'Chaos-Live',
    message: 'El servidor no ha respondido a tiempo.',
    detail: 'Puedes ver qué ha pasado en el registro, desde el icono de la bandeja.',
  });
}

/** Lo que las dos ventanas propias pueden pedirle al proceso principal. */
function registrarPuente(): void {
  ipcMain.handle('chaos:registro', () => registro);

  ipcMain.handle('chaos:estado-inicial', () => ({
    canal: leerClaveEnv('TIKTOK_USERNAME').replace(/^@/, ''),
    hayMod: Boolean(rutaDelJar()),
  }));

  ipcMain.handle('chaos:guardar-canal', async (_evento, canal: string) => {
    const limpio = String(canal ?? '').trim().replace(/^@/, '');
    if (!limpio) return { ok: false, mensaje: 'Escribe tu nombre de usuario de TikTok.' };

    escribirClaveEnv('TIKTOK_USERNAME', limpio);
    await arrancarServidorYMostrarPanel();
    return { ok: true, mensaje: '' };
  });

  ipcMain.handle('chaos:instalar-mod', () => instalarMod());

  ipcMain.handle('chaos:modo-simulacion', async () => {
    await arrancarServidorYMostrarPanel();
    return { ok: true };
  });
}

// Una sola instancia. Abrirla dos veces enseña la que ya estaba en vez de
// pelearse por el puerto y morir con EADDRINUSE.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', mostrarPanel);

  app.on('window-all-closed', () => {
    // A propósito, nada: se vive en la bandeja hasta que se pida salir.
  });

  // El manejador tiene que ser sincrono: Electron no espera a una promesa, y
  // `preventDefault()` solo cuenta si se llama antes de devolver. Se para el
  // servidor aparte y se vuelve a pedir la salida cuando ya se ha despedido.
  app.on('before-quit', (evento) => {
    const enMarcha = servidor;
    if (!enMarcha || !enMarcha.estaVivo) return;

    evento.preventDefault();
    saliendo = true;
    anotar('Apagando Chaos-Live...');

    void enMarcha.parar().then(() => {
      servidor = undefined;
      destruirBandeja();
      app.quit();
    });
  });

  void app.whenReady().then(async () => {
    registrarPuente();
    await arrancar();
  });
}
