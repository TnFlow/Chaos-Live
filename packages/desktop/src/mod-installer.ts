import fs from 'node:fs';
import path from 'node:path';
import { getResourcesDir } from './user-data.js';

/**
 * Instalación del mod de Fabric, en un botón.
 *
 * Antes esto eran dos pasos manuales: compilar el mod con un JDK 17 y ejecutar
 * un `.bat` que lo copiaba. Ahora el `.jar` viaja ya compilado dentro de la
 * app, así que aquí solo queda encontrar dónde tiene el streamer su Minecraft
 * y dejarlo ahí.
 */

export interface CarpetaDeMods {
  ruta: string;
  lanzador: string;
}

/** Carpetas candidatas, con el nombre del lanzador al que pertenecen. */
interface Candidata {
  raiz: string;
  lanzador: (nombre: string) => string;
  subruta: string;
}

/**
 * Se miran todos los lanzadores habituales, no solo el de siempre.
 *
 * Mucha gente juega con CurseForge, Prism o Modrinth, donde cada instancia
 * tiene su propia carpeta de mods. Mirando solo `%APPDATA%\.minecraft` se le
 * decía "no se ve Minecraft" a alguien que lo tenía perfectamente instalado, y
 * se le mandaba a copiar el mod a mano sin decirle a dónde.
 */
function candidatas(): Candidata[] {
  const appData = process.env['APPDATA'] ?? '';
  const perfil = process.env['USERPROFILE'] ?? '';

  return [
    { raiz: path.join(perfil, 'curseforge', 'minecraft', 'Instances'), lanzador: (n) => `CurseForge — ${n}`, subruta: 'mods' },
    { raiz: path.join(perfil, 'Documents', 'curseforge', 'minecraft', 'Instances'), lanzador: (n) => `CurseForge — ${n}`, subruta: 'mods' },
    { raiz: path.join(appData, 'PrismLauncher', 'instances'), lanzador: (n) => `Prism — ${n}`, subruta: path.join('.minecraft', 'mods') },
    { raiz: path.join(appData, 'ModrinthApp', 'profiles'), lanzador: (n) => `Modrinth — ${n}`, subruta: 'mods' },
  ];
}

export function buscarCarpetasDeMods(): CarpetaDeMods[] {
  const encontradas: CarpetaDeMods[] = [];

  const vanilla = path.join(process.env['APPDATA'] ?? '', '.minecraft', 'mods');
  if (fs.existsSync(vanilla)) {
    encontradas.push({ ruta: vanilla, lanzador: 'Minecraft (vanilla/Fabric)' });
  }

  for (const candidata of candidatas()) {
    if (!fs.existsSync(candidata.raiz)) continue;

    let instancias: fs.Dirent[];
    try {
      instancias = fs.readdirSync(candidata.raiz, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const instancia of instancias) {
      if (!instancia.isDirectory()) continue;
      const ruta = path.join(candidata.raiz, instancia.name, candidata.subruta);
      if (fs.existsSync(ruta)) {
        encontradas.push({ ruta, lanzador: candidata.lanzador(instancia.name) });
      }
    }
  }

  return encontradas;
}

/** El `.jar` del mod que viaja con la app, o `undefined` si no se empaquetó. */
export function rutaDelJar(): string | undefined {
  const dir = path.join(getResourcesDir(), 'mod');
  if (!fs.existsSync(dir)) return undefined;

  const jar = fs
    .readdirSync(dir)
    .find((f) => f.endsWith('.jar') && !f.includes('sources') && !f.includes('dev'));

  return jar ? path.join(dir, jar) : undefined;
}

export interface ResultadoInstalacion {
  ok: boolean;
  /** Qué contarle al streamer, ya redactado. */
  mensaje: string;
  /** Dónde ha quedado instalado. */
  destinos: string[];
  /** Instancias sin Fabric API: el mod no cargará ahí. */
  sinFabricApi: string[];
}

/**
 * Copia el mod a todas las carpetas de mods encontradas.
 *
 * Se borran antes las versiones anteriores del propio mod: dos copias distintas
 * en la misma carpeta hacen que Fabric no arranque, y el streamer se encuentra
 * con un Minecraft que se cierra al abrir sin decir por qué.
 */
export function instalarMod(): ResultadoInstalacion {
  const jar = rutaDelJar();
  if (!jar) {
    return {
      ok: false,
      mensaje:
        'Esta instalación no trae el mod compilado. Descarga Chaos-Live otra vez, ' +
        'o juega con RCON en un servidor y olvídate del mod.',
      destinos: [],
      sinFabricApi: [],
    };
  }

  const carpetas = buscarCarpetasDeMods();
  if (carpetas.length === 0) {
    return {
      ok: false,
      mensaje:
        'No se ha encontrado ninguna carpeta de mods. Se han mirado Minecraft normal, ' +
        `CurseForge, Prism y Modrinth. Puedes copiar este archivo a mano en la carpeta ` +
        `"mods" de tu instancia:\n\n${jar}`,
      destinos: [],
      sinFabricApi: [],
    };
  }

  const nombreJar = path.basename(jar);
  const destinos: string[] = [];
  const sinFabricApi: string[] = [];
  const fallos: string[] = [];

  for (const carpeta of carpetas) {
    try {
      for (const existente of fs.readdirSync(carpeta.ruta)) {
        if (/chaos-?live/i.test(existente) && existente.endsWith('.jar') && existente !== nombreJar) {
          fs.rmSync(path.join(carpeta.ruta, existente), { force: true });
        }
      }

      fs.copyFileSync(jar, path.join(carpeta.ruta, nombreJar));
      destinos.push(carpeta.lanzador);

      const tieneFabricApi = fs
        .readdirSync(carpeta.ruta)
        .some((f) => /fabric-api/i.test(f) && f.endsWith('.jar'));
      if (!tieneFabricApi) sinFabricApi.push(carpeta.lanzador);
    } catch (err) {
      fallos.push(`${carpeta.lanzador}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (destinos.length === 0) {
    return {
      ok: false,
      mensaje: `No se pudo copiar el mod a ninguna carpeta.\n\n${fallos.join('\n')}`,
      destinos,
      sinFabricApi,
    };
  }

  let mensaje = `Mod instalado en: ${destinos.join(', ')}.\n\nAbre Minecraft 1.20.1 con Fabric y entra a tu mundo; el mod se conecta solo a Chaos-Live.`;
  if (sinFabricApi.length > 0) {
    mensaje += `\n\nOjo: falta Fabric API en ${sinFabricApi.join(', ')}. Sin ella el mod no carga. Descárgala de modrinth.com/mod/fabric-api (versión 1.20.1).`;
  }
  if (fallos.length > 0) {
    mensaje += `\n\nNo se pudo copiar a: ${fallos.join('; ')}.`;
  }

  return { ok: true, mensaje, destinos, sinFabricApi };
}
