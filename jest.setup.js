import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Da a cada worker de jest su propia base de datos.
 *
 * Se ejecuta en `setupFiles`, es decir antes de que el test importe nada, que
 * es la unica ventana valida: `getPrismaClient()` es un singleton y PrismaClient
 * lee `DATABASE_URL` al construirse, asi que cambiarlo despues no tendria
 * efecto.
 *
 * La copia es por worker y no por fichero de test porque los tests de un mismo
 * worker corren en serie: no pueden pisarse entre ellos.
 */
const template = process.env.CHAOS_TEST_DB_TEMPLATE;

if (template && fs.existsSync(template)) {
  const workerId = process.env.JEST_WORKER_ID || '1';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `chaos-live-w${workerId}-`));
  const dbPath = path.join(dir, 'test.db');

  fs.copyFileSync(template, dbPath);
  process.env.DATABASE_URL = `file:${dbPath}`;

  // El worker es un proceso propio y muere al terminar la tanda, asi que este
  // es el momento de recoger: si no, cada `npm test` deja copias en el temporal.
  process.on('exit', () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Que no se pueda borrar el temporal no debe tumbar la suite.
    }
  });
}
