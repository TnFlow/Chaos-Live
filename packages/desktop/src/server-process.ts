import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getDataDir, getDbPath, getLogDir, getResourcesDir } from './user-data.js';

/**
 * Arranque y supervisión del servidor de Chaos-Live.
 *
 * El servidor corre como **proceso hijo**, no dentro de Electron. No es por
 * aislamiento teórico: `packages/app/src/main.ts` llama a `process.exit`,
 * instala manejadores de `SIGINT` y `uncaughtException` y un vigilante que
 * fuerza la salida a los 5 segundos. Todo eso, dentro del proceso de Electron,
 * mataría la ventana. Como hijo, ese endurecimiento —que existe porque tumbar
 * un directo es lo peor que puede pasar— sigue funcionando tal cual, y una
 * excepción del motor no se lleva por delante el panel.
 *
 * La supervisión es la misma que hacía `Iniciar-Chaos-Live.ps1`.
 */

/**
 * El servidor avisa con este código de que reintentar no arregla nada (puerto
 * ocupado, permisos). Ya ha explicado qué pasa; insistir solo taparía ese
 * mensaje con diez copias del mismo error.
 */
export const CODIGO_FALLO_DEFINITIVO = 78;

/** Cuántas veces se reintenta antes de rendirse. */
const MAX_REINICIOS = 10;

/** Esperas entre reintentos, en segundos. */
const ESPERAS = [2, 5, 10, 20, 30];

/**
 * Cuánto tiene que aguantar para considerar que la caída fue puntual.
 *
 * Si el servidor estuvo un buen rato en pie, la caída es un accidente y se
 * reinicia rápido. Si muere enseguida, algo está mal de verdad y hay que
 * espaciar los intentos en vez de machacar.
 */
const SEGUNDOS_PARA_OLVIDAR = 60;

export interface OpcionesServidor {
  wsPort: number;
  overlayPort: number;
  /** Cada línea que escupe el servidor, para la pantalla de arranque. */
  onLinea: (linea: string) => void;
  /** El servidor no va a volver: hay que decírselo al streamer y parar. */
  onFalloDefinitivo: (motivo: string) => void;
}

export class ServidorChaosLive {
  private proceso?: ChildProcess;
  private reinicios = 0;
  private parando = false;

  constructor(private readonly opciones: OpcionesServidor) {}

  /** Ruta del bundle del servidor dentro de los recursos de la app. */
  private get rutaBundle(): string {
    return path.join(getResourcesDir(), 'server', 'app', 'bundle.mjs');
  }

  get estaVivo(): boolean {
    return Boolean(this.proceso && this.proceso.exitCode === null && !this.proceso.killed);
  }

  arrancar(): void {
    if (this.parando) return;

    const bundle = this.rutaBundle;
    if (!fs.existsSync(bundle)) {
      this.opciones.onFalloDefinitivo(
        `No se encontró el servidor en ${bundle}. La instalación está incompleta: vuelve a instalar Chaos-Live.`,
      );
      return;
    }

    this.proceso = spawn(process.execPath, [bundle], {
      cwd: getDataDir(),
      windowsHide: true,
      env: {
        ...process.env,
        // Ejecuta el Node que ya trae Electron. Gracias a esto la distribucion
        // no necesita llevar su propio `node.exe`, que era justo lo que se
        // olvidaba al empaquetar y dejaba el ZIP sin forma de arrancar.
        ELECTRON_RUN_AS_NODE: '1',
        // Sin esto el bundle revienta con "__dirname is not defined in ES
        // module scope": pino-pretty acaba dentro de un bundle ESM.
        NODE_ENV: 'production',
        STATIC_DIR: path.join(getResourcesDir(), 'overlay'),
        LOG_DIR: getLogDir(),
        // Absoluta, siempre. Prisma resuelve un `file:./x.db` contra la carpeta
        // del esquema, que queda grabada dentro del cliente al compilar y en el
        // PC del streamer no existe: con una ruta relativa la app arranca sin
        // quejarse y no guarda una sola fila.
        DATABASE_URL: `file:${getDbPath().replace(/\\/g, '/')}`,
        WS_PORT: String(this.opciones.wsPort),
        OVERLAY_PORT: String(this.opciones.overlayPort),
      },
    });

    const arrancadoEn = Date.now();

    const leer = (buffer: Buffer): void => {
      for (const linea of buffer.toString().split(/\r?\n/)) {
        if (linea.trim()) this.opciones.onLinea(linea);
      }
    };

    this.proceso.stdout?.on('data', leer);
    this.proceso.stderr?.on('data', leer);

    this.proceso.on('exit', (codigo) => {
      if (this.parando) return;
      this.alMorir(codigo ?? 1, (Date.now() - arrancadoEn) / 1000);
    });

    this.proceso.on('error', (err) => {
      this.opciones.onFalloDefinitivo(`No se pudo arrancar el servidor: ${err.message}`);
    });
  }

  private alMorir(codigo: number, segundosVivo: number): void {
    if (codigo === 0) {
      this.opciones.onLinea('El servidor se cerró correctamente.');
      return;
    }

    if (codigo === CODIGO_FALLO_DEFINITIVO) {
      this.opciones.onFalloDefinitivo(
        'Chaos-Live no puede arrancar con la configuración actual. ' +
          `El motivo está en el registro: ${getLogDir()}`,
      );
      return;
    }

    // Aguantó un buen rato: la caída es puntual, se empieza a contar de nuevo.
    if (segundosVivo > SEGUNDOS_PARA_OLVIDAR) this.reinicios = 0;

    this.reinicios++;
    if (this.reinicios > MAX_REINICIOS) {
      this.opciones.onFalloDefinitivo(
        `Chaos-Live se ha detenido ${MAX_REINICIOS} veces seguidas. ` +
          `Revisa el detalle en: ${getLogDir()}`,
      );
      return;
    }

    const espera = ESPERAS[Math.min(this.reinicios - 1, ESPERAS.length - 1)] ?? 30;
    this.opciones.onLinea(
      `Se detuvo inesperadamente (código ${codigo}). Reintentando en ${espera} s ` +
        `(intento ${this.reinicios} de ${MAX_REINICIOS}). El overlay se reconecta solo.`,
    );

    setTimeout(() => this.arrancar(), espera * 1000);
  }

  /**
   * Apagado limpio.
   *
   * Se le pide por su API que se apague, porque en Windows **no hay señales de
   * verdad**: `kill('SIGTERM')` acaba en un `TerminateProcess` que no ejecuta
   * el manejador del servidor, así que no se vacía la cola, no se despide de la
   * partida y la base de datos se queda a medias. La petición hace lo mismo que
   * hacía Ctrl+C en la ventana de consola del lanzador antiguo.
   *
   * Si no contesta —está colgado, o es una versión anterior sin esa ruta— se le
   * mata igualmente: un apagado que no termina es peor que uno brusco.
   */
  async parar(timeoutMs = 8000): Promise<void> {
    this.parando = true;
    const proceso = this.proceso;
    if (!proceso || proceso.exitCode !== null) return;

    try {
      const controlador = new AbortController();
      const reloj = setTimeout(() => controlador.abort(), 2000);
      await fetch(`http://127.0.0.1:${this.opciones.wsPort}/api/shutdown`, {
        method: 'POST',
        signal: controlador.signal,
      });
      clearTimeout(reloj);
    } catch {
      // No contesta: se sigue adelante y se le fuerza abajo.
    }

    await new Promise<void>((resolve) => {
      const forzar = setTimeout(() => {
        proceso.kill();
        resolve();
      }, timeoutMs);

      proceso.once('exit', () => {
        clearTimeout(forzar);
        resolve();
      });
    });
  }
}
