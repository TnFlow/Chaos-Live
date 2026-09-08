import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

/**
 * Dónde vive lo que es del streamer, y cómo se prepara la primera vez.
 *
 * Instalada, Chaos-Live vive en `Program Files`, que es de solo lectura: la
 * base de datos del directo, el `.env` con el canal, las reglas, los sonidos y
 * los registros no pueden quedarse al lado del ejecutable. Todo eso se muda a
 * `%APPDATA%\Chaos-Live`, y ahí sigue estando después de desinstalar y volver
 * a instalar, que es lo que espera cualquiera que actualice a una versión nueva.
 *
 * El servidor no se entera de nada: resuelve `config/` y `data/` contra el
 * directorio de trabajo, así que basta con arrancarlo con el `cwd` puesto aquí.
 * Es lo mismo que hacía el lanzador de PowerShell.
 */

/** Carpeta de datos del streamer. */
export function getDataDir(): string {
  return app.getPath('userData');
}

/** Carpeta de registros, la que abre el menú de la bandeja. */
export function getLogDir(): string {
  return path.join(getDataDir(), 'logs');
}

/** Ruta del `.env`. */
export function getEnvPath(): string {
  return path.join(getDataDir(), '.env');
}

/** Ruta de la base de datos del directo. */
export function getDbPath(): string {
  return path.join(getDataDir(), 'data', 'chaos-live.db');
}

/**
 * Carpeta de recursos que viajan con la app: el servidor empaquetado, el
 * overlay compilado, las plantillas de configuración y el mod compilado.
 *
 * Instalada es `resources/` dentro de la carpeta del programa. Sin empaquetar
 * es la carpeta que deja el empaquetador, para poder probar la app de verdad
 * sin tener que instalarla en cada cambio.
 */
export function getResourcesDir(): string {
  if (app.isPackaged) return process.resourcesPath;
  return path.resolve(app.getAppPath(), '../../release/electron-resources');
}

/** Lo que hay que sembrar la primera vez: de dónde sale y dónde acaba. */
const SEMILLAS: { origen: string; destino: string }[] = [
  { origen: '.env.example', destino: '.env' },
  { origen: 'config/rules.json', destino: 'config/rules.json' },
  { origen: 'config/database-template.db', destino: 'data/chaos-live.db' },
];

export interface ResultadoPreparacion {
  /** Primera vez que se abre en este equipo. */
  primeraVez: boolean;
  /** Lo que no se pudo dejar listo, para poder decirlo en vez de fallar mudo. */
  problemas: string[];
}

/**
 * Deja `%APPDATA%\Chaos-Live` listo para arrancar.
 *
 * Solo copia lo que falta: si el streamer ya tiene su `.env` con el canal
 * puesto y su base de datos con el historial de veinte directos, actualizar la
 * app no puede pisárselos.
 *
 * La base de datos se **copia de una plantilla**, nunca se crea vacía. La
 * distribución no lleva la herramienta de Prisma, así que el esquema no se
 * puede crear aquí, y un fichero de cero bytes no es una base de datos sin
 * tablas: es nada. Como los errores de escritura se tragan a propósito para no
 * tumbar un directo, el síntoma era un historial siempre vacío y las metas a
 * cero en cada reinicio, sin un solo mensaje.
 */
export function prepararDatos(): ResultadoPreparacion {
  const datos = getDataDir();
  const recursos = getResourcesDir();
  const problemas: string[] = [];

  const primeraVez = !fs.existsSync(getEnvPath());

  for (const dir of ['config', path.join('config', 'sounds'), 'data', 'logs']) {
    fs.mkdirSync(path.join(datos, dir), { recursive: true });
  }

  for (const semilla of SEMILLAS) {
    const destino = path.join(datos, semilla.destino);
    const origen = path.join(recursos, semilla.origen);

    // Un fichero de cero bytes cuenta como ausente: es el rastro que dejaba la
    // version anterior cuando creaba la base de datos en vez de copiarla.
    const falta = !fs.existsSync(destino) || fs.statSync(destino).size === 0;
    if (!falta) continue;

    if (!fs.existsSync(origen)) {
      problemas.push(`Falta ${semilla.origen} en la instalación.`);
      continue;
    }

    try {
      fs.copyFileSync(origen, destino);
    } catch (err) {
      problemas.push(
        `No se pudo preparar ${semilla.destino}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { primeraVez, problemas };
}

/** Lee una clave del `.env`. Cadena vacía si no está. */
export function leerClaveEnv(clave: string): string {
  const file = getEnvPath();
  if (!fs.existsSync(file)) return '';

  const linea = fs
    .readFileSync(file, 'utf-8')
    .split(/\r?\n/)
    .find((l) => new RegExp(`^\\s*${clave}\\s*=`).test(l));

  return linea ? (linea.split('=').slice(1).join('=').trim() ?? '') : '';
}

/**
 * Escribe una clave del `.env` **sin destruir el resto**.
 *
 * Reescribir el fichero entero se llevaba por delante cualquier ajuste que el
 * streamer hubiera puesto a mano —otro puerto, la ruta de la base de datos, el
 * nivel de registro— cada vez que volvía a configurar su canal.
 */
export function escribirClaveEnv(clave: string, valor: string): void {
  const file = getEnvPath();
  const lineas = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8').split(/\r?\n/) : [];

  let encontrada = false;
  const salida = lineas.map((linea) => {
    if (!new RegExp(`^\\s*${clave}\\s*=`).test(linea)) return linea;
    encontrada = true;
    return `${clave}=${valor}`;
  });

  if (!encontrada) salida.push(`${clave}=${valor}`);

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, salida.join('\r\n'), 'utf-8');
}

/** Puerto configurado, o el de siempre si no hay nada escrito. */
export function leerPuerto(clave: 'WS_PORT' | 'OVERLAY_PORT', pordefecto: number): number {
  const valor = Number(leerClaveEnv(clave));
  return Number.isInteger(valor) && valor > 0 && valor < 65536 ? valor : pordefecto;
}

/**
 * Si el streamer todavía no ha dicho a qué cuenta de TikTok conectarse.
 *
 * El `.env.example` trae el marcador `your_tiktok_username`, y el servidor lo
 * trata como "no configurado" y arranca en modo simulación. Sin preguntar, el
 * streamer veía eventos inventados y creía que su directo no llegaba.
 */
export function faltaCanal(): boolean {
  const usuario = leerClaveEnv('TIKTOK_USERNAME').replace(/^@/, '');
  return !usuario || usuario === 'your_tiktok_username';
}
