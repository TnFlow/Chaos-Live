import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_OVERLAY_SETTINGS, type OverlaySettings } from '@chaos-live/shared-protocol';
import { logger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SETTINGS_FILENAME = 'overlay-settings.json';

/**
 * Resuelve dónde vive `overlay-settings.json`, con la misma estrategia
 * multi-ruta que `getRulesPath` para funcionar tanto en el monorepo como en la
 * distribución portable de Windows.
 */
export function getOverlaySettingsPath(settingsFilePath?: string): string {
  if (settingsFilePath) {
    return path.isAbsolute(settingsFilePath)
      ? settingsFilePath
      : path.resolve(process.cwd(), settingsFilePath);
  }

  const possiblePaths = [
    path.resolve(process.cwd(), `packages/app/config/${SETTINGS_FILENAME}`),
    path.resolve(process.cwd(), `config/${SETTINGS_FILENAME}`),
    path.resolve(__dirname, `../../config/${SETTINGS_FILENAME}`),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // Todavia no hay fichero guardado. Elegir siempre el primer candidato dejaria
  // los ajustes en `packages/app/config/`, ruta que no existe en la distribucion
  // portable: al guardar desde el Overlay Studio se creaba ese arbol suelto
  // dentro de la carpeta del streamer, separado del `config/` real. Se escribe
  // en el primer candidato cuyo directorio ya exista.
  for (const p of possiblePaths) {
    if (fs.existsSync(path.dirname(p))) {
      return p;
    }
  }
  return possiblePaths[0]!;
}

/**
 * Carga los ajustes persistidos, completando con los valores por defecto
 * cualquier campo ausente. Nunca lanza: si el fichero está corrupto se registra
 * el error y se devuelven los valores por defecto, porque un overlay con la
 * estética equivocada es mucho menos grave que un directo que no arranca.
 */
export function loadOverlaySettings(settingsFilePath?: string): OverlaySettings {
  const targetPath = getOverlaySettingsPath(settingsFilePath);

  if (!fs.existsSync(targetPath)) {
    logger.info({ targetPath }, 'No hay ajustes de overlay guardados, se usan los valores por defecto.');
    return { ...DEFAULT_OVERLAY_SETTINGS };
  }

  try {
    const raw = fs.readFileSync(targetPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<OverlaySettings>;
    logger.info({ path: targetPath }, 'Ajustes de overlay cargados');
    return { ...DEFAULT_OVERLAY_SETTINGS, ...parsed };
  } catch (err) {
    logger.error({ err, targetPath }, 'No se pudieron leer los ajustes de overlay, se usan los valores por defecto');
    return { ...DEFAULT_OVERLAY_SETTINGS };
  }
}

/**
 * Persiste los ajustes en disco para que sobrevivan a un reinicio.
 */
export function saveOverlaySettings(settings: OverlaySettings, settingsFilePath?: string): void {
  const targetPath = getOverlaySettingsPath(settingsFilePath);
  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, JSON.stringify(settings, null, 2), 'utf-8');
    logger.info({ path: targetPath }, 'Ajustes de overlay guardados');
  } catch (err) {
    logger.error({ err, targetPath }, 'No se pudieron guardar los ajustes de overlay');
    throw err;
  }
}
