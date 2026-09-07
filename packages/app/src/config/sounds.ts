import fs from 'node:fs';
import path from 'node:path';
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
}

/** Carpeta de sonidos, al lado de `overlay-settings.json`. */
export function getSoundsDir(): string {
  return path.join(path.dirname(getOverlaySettingsPath()), 'sounds');
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
    return fs
      .readdirSync(dir)
      .filter((f) => TIPOS_POR_EXTENSION[path.extname(f).toLowerCase()])
      .map((f) => ({
        id: f,
        name: f.replace(/-[a-z0-9]+(\.[a-z0-9]+)$/, '$1'),
        url: `/sounds/${f}`,
        sizeBytes: fs.statSync(path.join(dir, f)).size,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    logger.error({ err, dir }, 'No se pudo leer la carpeta de sonidos');
    return [];
  }
}

/** Error de un sonido que el streamer puede corregir (formato, tamaño). */
export class SoundValidationError extends Error {}

/**
 * Guarda un sonido subido desde el panel.
 *
 * Llega como data URL porque el panel lo lee con FileReader: así no hace falta
 * un analizador de multipart en un servidor que, por lo demás, solo habla JSON.
 */
export function saveSound(name: string, dataUrl: string): CustomSound {
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

  const dir = getSoundsDir();
  fs.mkdirSync(dir, { recursive: true });

  const id = nombreSeguro(name || 'sonido', extension);
  fs.writeFileSync(path.join(dir, id), datos);
  logger.info({ id, sizeBytes: datos.length }, 'Sonido personalizado guardado');

  return { id, name: name || id, url: `/sounds/${id}`, sizeBytes: datos.length };
}

/** Borra un sonido. Devuelve `false` si no existía. */
export function deleteSound(id: string): boolean {
  const file = resolveSoundFile(id);
  if (!file) return false;

  fs.unlinkSync(file);
  logger.info({ id }, 'Sonido personalizado borrado');
  return true;
}
