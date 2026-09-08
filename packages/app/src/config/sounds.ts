import fs from 'node:fs';
import path from 'node:path';
import { OVERLAY_SOUND_EVENTS } from '@chaos-live/shared-protocol';
import type { OverlaySoundEvent } from '@chaos-live/shared-protocol';
import { getOverlaySettingsPath } from './overlay-settings.js';
import { logger } from '../logger.js';

/**
 * Sonidos que sube el streamer, guardados junto al resto de la configuración.
 *
 * Viven en disco y no dentro de los ajustes porque un MP3 no cabe en un JSON
 * que se reescribe en cada cambio de un deslizador. Los ajustes solo guardan
 * la URL que devuelve este módulo.
 */

/** Formatos que acepta el elemento <audio> de cualquier navegador moderno. */
const EXTENSIONES: Record<string, string> = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/wave': '.wav',
  'audio/ogg': '.ogg',
  'audio/webm': '.webm',
  'audio/aac': '.aac',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
};

const TIPOS_POR_EXTENSION: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.webm': 'audio/webm',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
};

/**
 * Tope por archivo. Son avisos de un par de segundos, no canciones: con más de
 * esto el navegador tarda en cargarlo y la alerta llega tarde al directo.
 */
export const MAX_BYTES_SONIDO = 3 * 1024 * 1024;

export interface CustomSound {
  /** Nombre del archivo en disco. Es también su identificador. */
  readonly id: string;
  /** Nombre que puso el streamer, para la lista del panel. */
  readonly name: string;
  /** Ruta con la que el overlay lo reproduce. */
  readonly url: string;
  readonly sizeBytes: number;
  /**
   * Cuánto suena este sonido en concreto, de 0 a 1, sobre el volumen general.
   *
   * Un audio de moda descargado de cualquier sitio viene al volumen que venga:
   * sin esto, el streamer tenía que reeditar el archivo o bajar el volumen de
   * todo el overlay para que un sonido no reventase la transmisión.
   */
  readonly volume: number;
  /**
   * Dónde se está usando, para poder avisar antes de borrarlo. Son
   * identificadores, no texto para enseñar: `event:gift`, `rule:<nombre>`. Los
   * traduce el panel, que ya tiene las etiquetas de cada momento.
   */
  readonly inUse?: readonly string[];
}

/** Volumen de un sonido recién subido: el mismo que el general. */
const VOLUMEN_POR_DEFECTO = 1;

/** Carpeta de sonidos, al lado de `overlay-settings.json`. */
export function getSoundsDir(): string {
  return path.join(path.dirname(getOverlaySettingsPath()), 'sounds');
}

/**
 * Lo que no cabe en el nombre de un archivo.
 *
 * El identificador de un sonido es su nombre en disco, que tiene que ser seguro
 * para una URL y para una ruta. Todo lo demás —cómo lo llama el streamer, a qué
 * volumen suena, cuándo se subió— vive en este índice, al lado de los archivos.
 *
 * El disco sigue mandando sobre **qué sonidos existen**: el índice solo decora.
 * Un archivo sin entrada se comporta como antes de que esto existiera, y una
 * entrada sin archivo se ignora. Así, borrar un mp3 a mano desde el explorador
 * no deja la biblioteca en un estado imposible.
 */
interface SoundMetadata {
  name: string;
  volume: number;
  addedAt: number;
}

type SoundsIndex = Record<string, SoundMetadata>;

const INDEX_FILENAME = 'sonidos.json';

function getIndexPath(): string {
  return path.join(getSoundsDir(), INDEX_FILENAME);
}

/** Lee el índice. Nunca lanza: sin índice, los sonidos siguen sonando. */
function readIndex(): SoundsIndex {
  const file = getIndexPath();
  if (!fs.existsSync(file)) return {};

  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as SoundsIndex;
  } catch (err) {
    logger.error({ err, file }, 'El índice de sonidos está corrupto; se ignora');
    return {};
  }
}

/** Escribe el índice. Tampoco lanza: perder un nombre no puede tumbar un directo. */
function writeIndex(index: SoundsIndex): void {
  try {
    fs.mkdirSync(getSoundsDir(), { recursive: true });
    fs.writeFileSync(getIndexPath(), JSON.stringify(index, null, 2), 'utf-8');
  } catch (err) {
    logger.error({ err }, 'No se pudo guardar el índice de sonidos');
  }
}

/** Nombre legible de un archivo que no tiene entrada en el índice. */
function nombreDeArchivo(file: string): string {
  return file.replace(/-[a-z0-9]+(\.[a-z0-9]+)$/, '$1');
}

/**
 * Convierte lo que escribió el streamer en un nombre de archivo seguro.
 *
 * Se queda solo con letras, números, guiones y puntos: el identificador acaba
 * en una URL y en una ruta de disco, así que no puede llevar barras ni `..`.
 */
function nombreSeguro(nombre: string, extension: string): string {
  const base = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60)
    .toLowerCase();

  const raiz = base.replace(/\.[a-z0-9]+$/, '') || 'sonido';
  return `${raiz}-${Date.now().toString(36)}${extension}`;
}

/** Ruta absoluta de un sonido, o `undefined` si el id no es válido o no existe. */
export function resolveSoundFile(id: string): string | undefined {
  // `path.basename` corta cualquier intento de salir de la carpeta con `../`.
  const seguro = path.basename(id);
  if (!seguro || seguro !== id) return undefined;

  const completo = path.join(getSoundsDir(), seguro);
  if (!fs.existsSync(completo) || !fs.statSync(completo).isFile()) return undefined;
  return completo;
}

/** Tipo MIME que corresponde a un archivo de sonido, para servirlo. */
export function soundContentType(file: string): string {
  return TIPOS_POR_EXTENSION[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

export function listSounds(): CustomSound[] {
  const dir = getSoundsDir();
  if (!fs.existsSync(dir)) return [];

  try {
    const index = readIndex();

    return fs
      .readdirSync(dir)
      .filter((f) => TIPOS_POR_EXTENSION[path.extname(f).toLowerCase()])
      .map((f) => {
        const meta = index[f];
        return {
          id: f,
          name: meta?.name || nombreDeArchivo(f),
          url: `/sounds/${f}`,
          sizeBytes: fs.statSync(path.join(dir, f)).size,
          volume: clampVolumen(meta?.volume),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    logger.error({ err, dir }, 'No se pudo leer la carpeta de sonidos');
    return [];
  }
}

/** Un sonido suelto, o `undefined` si ya no está. */
export function getSound(id: string): CustomSound | undefined {
  return listSounds().find((s) => s.id === id);
}

/** Volumen válido: fuera de rango o sin valor, suena como el general. */
function clampVolumen(valor: unknown): number {
  const n = Number(valor);
  if (!Number.isFinite(n)) return VOLUMEN_POR_DEFECTO;
  return Math.max(0, Math.min(1, n));
}

/** Error de un sonido que el streamer puede corregir (formato, tamaño). */
export class SoundValidationError extends Error {}

/**
 * Guarda un sonido subido desde el panel.
 *
 * Llega como data URL porque el panel lo lee con FileReader: así no hace falta
 * un analizador de multipart en un servidor que, por lo demás, solo habla JSON.
 */
/**
 * Convierte la data URL del panel en bytes y extensión, validando por el
 * camino. Lo usan igual la subida y el reemplazo.
 */
function decodificarAudio(dataUrl: string): { datos: Buffer; extension: string } {
  const match = /^data:([a-z0-9/+.-]+);base64,(.*)$/i.exec(dataUrl ?? '');
  if (!match) {
    throw new SoundValidationError('El archivo no se pudo leer. Vuelve a elegirlo.');
  }

  const mime = match[1]!.toLowerCase();
  const extension = EXTENSIONES[mime];
  if (!extension) {
    throw new SoundValidationError(
      `Formato no admitido (${mime}). Usa MP3, WAV, OGG, M4A o AAC.`,
    );
  }

  const datos = Buffer.from(match[2]!, 'base64');
  if (datos.length === 0) {
    throw new SoundValidationError('El archivo está vacío.');
  }
  if (datos.length > MAX_BYTES_SONIDO) {
    throw new SoundValidationError(
      `El archivo pesa ${(datos.length / 1024 / 1024).toFixed(1)} MB y el máximo son ${MAX_BYTES_SONIDO / 1024 / 1024} MB. Recorta el sonido a unos segundos.`,
    );
  }

  return { datos, extension };
}

export function saveSound(name: string, dataUrl: string): CustomSound {
  const { datos, extension } = decodificarAudio(dataUrl);

  const dir = getSoundsDir();
  fs.mkdirSync(dir, { recursive: true });

  const id = nombreSeguro(name || 'sonido', extension);
  fs.writeFileSync(path.join(dir, id), datos);

  const index = readIndex();
  index[id] = {
    name: (name || nombreDeArchivo(id)).trim().slice(0, MAX_LARGO_NOMBRE),
    volume: VOLUMEN_POR_DEFECTO,
    addedAt: Date.now(),
  };
  writeIndex(index);

  logger.info({ id, sizeBytes: datos.length }, 'Sonido personalizado guardado');

  return {
    id,
    name: index[id]!.name,
    url: `/sounds/${id}`,
    sizeBytes: datos.length,
    volume: VOLUMEN_POR_DEFECTO,
  };
}

/** Tope del nombre visible. Es una etiqueta para una lista, no una descripción. */
const MAX_LARGO_NOMBRE = 80;

/**
 * Cambia el nombre visible. El archivo en disco no se toca: renombrarlo
 * cambiaría su URL y dejaría mudos los momentos que ya lo tenían asignado.
 */
export function renameSound(id: string, name: string): CustomSound | undefined {
  if (!resolveSoundFile(id)) return undefined;

  const limpio = (name ?? '').trim().slice(0, MAX_LARGO_NOMBRE);
  if (!limpio) {
    throw new SoundValidationError('El nombre no puede quedarse vacío.');
  }

  const index = readIndex();
  index[id] = {
    name: limpio,
    volume: clampVolumen(index[id]?.volume),
    addedAt: index[id]?.addedAt ?? Date.now(),
  };
  writeIndex(index);

  logger.info({ id, name: limpio }, 'Sonido personalizado renombrado');
  return getSound(id);
}

/** Ajusta cuánto suena este sonido en concreto, de 0 a 1. */
export function setSoundVolume(id: string, volume: number): CustomSound | undefined {
  if (!resolveSoundFile(id)) return undefined;

  const index = readIndex();
  index[id] = {
    name: index[id]?.name || nombreDeArchivo(id),
    volume: clampVolumen(volume),
    addedAt: index[id]?.addedAt ?? Date.now(),
  };
  writeIndex(index);

  logger.info({ id, volume: index[id]!.volume }, 'Volumen de sonido ajustado');
  return getSound(id);
}

/**
 * Sustituye el audio conservando su sitio: mismo nombre, mismo volumen, y las
 * asignaciones migradas por quien llama con el `oldUrl` que se devuelve.
 *
 * El archivo nuevo **siempre estrena identificador**, aunque la extensión
 * coincida. Reutilizar la misma URL parece más cómodo, pero el navegador de OBS
 * ya tiene ese audio cacheado: el streamer cambiaría el sonido, seguiría oyendo
 * el anterior y no habría forma de explicárselo.
 */
export function replaceSound(
  id: string,
  dataUrl: string,
): { sound: CustomSound; oldUrl: string } | undefined {
  const anterior = resolveSoundFile(id);
  if (!anterior) return undefined;

  const { datos, extension } = decodificarAudio(dataUrl);

  const index = readIndex();
  const meta = index[id];
  const nombre = meta?.name || nombreDeArchivo(id);

  const dir = getSoundsDir();
  const nuevoId = nombreSeguro(nombre, extension);
  fs.writeFileSync(path.join(dir, nuevoId), datos);

  // El viejo se borra después de escribir el nuevo: si el disco falla a mitad,
  // es preferible quedarse con los dos que sin ninguno.
  try {
    fs.unlinkSync(anterior);
  } catch (err) {
    logger.warn({ err, id }, 'No se pudo borrar el sonido sustituido');
  }

  delete index[id];
  index[nuevoId] = {
    name: nombre,
    volume: clampVolumen(meta?.volume),
    addedAt: meta?.addedAt ?? Date.now(),
  };
  writeIndex(index);

  logger.info({ id, nuevoId, sizeBytes: datos.length }, 'Sonido personalizado reemplazado');

  return {
    sound: {
      id: nuevoId,
      name: nombre,
      url: `/sounds/${nuevoId}`,
      sizeBytes: datos.length,
      volume: index[nuevoId]!.volume,
    },
    oldUrl: `/sounds/${id}`,
  };
}

/** Borra un sonido. Devuelve `false` si no existía. */
export function deleteSound(id: string): boolean {
  const file = resolveSoundFile(id);
  if (!file) return false;

  fs.unlinkSync(file);

  const index = readIndex();
  if (index[id]) {
    delete index[id];
    writeIndex(index);
  }

  logger.info({ id }, 'Sonido personalizado borrado');
  return true;
}

/**
 * Reapunta los momentos del directo que usaban `deUrl`.
 *
 * Se llama al reemplazar un sonido (para que el momento siga sonando, con el
 * audio nuevo) y al borrarlo (con `'none'`, para que quede en silencio a
 * propósito y no apuntando a un archivo que ya no existe).
 *
 * Devuelve `undefined` si no había nada que cambiar, para no reescribir los
 * ajustes ni avisar al overlay sin motivo.
 */
export function remapEventSounds(
  eventSounds: Partial<Record<OverlaySoundEvent, string>> | undefined,
  deUrl: string,
  aUrl: string,
): Partial<Record<OverlaySoundEvent, string>> | undefined {
  if (!eventSounds) return undefined;

  let cambiado = false;
  const salida: Partial<Record<OverlaySoundEvent, string>> = { ...eventSounds };

  for (const momento of OVERLAY_SOUND_EVENTS) {
    if (salida[momento] === deUrl) {
      salida[momento] = aUrl;
      cambiado = true;
    }
  }

  return cambiado ? salida : undefined;
}

/**
 * Dónde se está usando cada sonido, por URL.
 *
 * Sirve para dos cosas en el panel: enseñar "en uso en: Regalo, Meta" en cada
 * fila, y avisar de qué se va a quedar mudo antes de borrar. Devuelve
 * identificadores (`event:gift`, `rule:<nombre>`) y no texto ya traducido: las
 * etiquetas de cada momento las tiene el panel, y duplicarlas aquí seria pedir
 * que se desincronicen.
 */
export function soundUsage(
  eventSounds: Partial<Record<OverlaySoundEvent, string>> | undefined,
  rules: readonly { name?: string; viewerFeedback?: { soundEffect?: string } }[] = [],
): Record<string, string[]> {
  const usos: Record<string, string[]> = {};

  const anotar = (url: string | undefined, quien: string): void => {
    if (!url || url === 'none') return;
    (usos[url] ??= []).push(quien);
  };

  for (const momento of OVERLAY_SOUND_EVENTS) {
    anotar(eventSounds?.[momento], `event:${momento}`);
  }

  for (const rule of rules) {
    anotar(rule.viewerFeedback?.soundEffect, `rule:${rule.name || 'Regla sin nombre'}`);
  }

  return usos;
}
