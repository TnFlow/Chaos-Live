/**
 * Copia a `dist/` lo que `tsc` no toca.
 *
 * De momento es solo el preload, que es CommonJS a mano (ver el comentario en
 * `src/preload.cjs`). Las paginas de `windows/` se cargan desde su carpeta, sin
 * copiar, porque no pasan por ninguna compilacion.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(raiz, 'dist');

fs.mkdirSync(dist, { recursive: true });
fs.copyFileSync(path.join(raiz, 'src', 'preload.cjs'), path.join(dist, 'preload.cjs'));

console.log('Copiado preload.cjs a dist/');
