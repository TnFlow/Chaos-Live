import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(rootDir, 'packages/core/prisma/schema.prisma');

/**
 * Prepara una base de datos plantilla para los tests.
 *
 * Sin esto los tests corrian contra `packages/core/prisma/chaos-live.db`, que
 * es la base de datos de desarrollo: el DATABASE_URL del `.env` es el mismo
 * para todo. Eso tenia dos consecuencias. La suite ensuciaba datos reales, y
 * como jest lanza los proyectos en paralelo, varios workers escribian a la vez
 * en el mismo fichero SQLite y la suite fallaba de forma intermitente.
 *
 * Aqui se crea UNA plantilla con el esquema aplicado y sin filas. Cada worker
 * se hace su copia en `jest.setup.js`, que es mucho mas barato que aplicar el
 * esquema una vez por worker.
 *
 * La plantilla se cachea por hash del esquema: aplicarlo cuesta unos 12s casi
 * todos de arranque de `npx`, y seria absurdo pagarlo en cada `npm test`
 * cuando el esquema casi nunca cambia. Si cambia, el hash cambia y se
 * reconstruye sola.
 */
export default function globalSetup() {
  const schemaHash = crypto
    .createHash('sha256')
    .update(fs.readFileSync(schemaPath))
    .digest('hex')
    .slice(0, 16);

  const cacheDir = path.join(os.tmpdir(), 'chaos-live-jest-db');
  const templatePath = path.join(cacheDir, `template-${schemaHash}.db`);

  if (!fs.existsSync(templatePath)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    // Se construye sobre un nombre temporal y se renombra al final, para que un
    // `npm test` interrumpido a medias no deje una plantilla incompleta que las
    // siguientes ejecuciones darian por buena.
    const building = `${templatePath}.${process.pid}.building`;
    // Se invoca el CLI de Prisma por su entrada JS con el propio node, y no por
    // `npx`: en Windows, Node se niega a lanzar un `.cmd` sin shell (EINVAL), y
    // ademas esto ahorra los segundos de arranque de npx.
    execFileSync(
      process.execPath,
      [
        path.join(rootDir, 'node_modules/prisma/build/index.js'),
        'db',
        'push',
        '--skip-generate',
        '--accept-data-loss',
        `--schema=${schemaPath}`,
      ],
      {
        cwd: rootDir,
        stdio: 'ignore',
        env: { ...process.env, DATABASE_URL: `file:${building}` },
      }
    );
    fs.renameSync(building, templatePath);
  }

  // Los workers leen esta ruta para copiarsela; jest propaga el env a los hijos.
  process.env.CHAOS_TEST_DB_TEMPLATE = templatePath;
}
