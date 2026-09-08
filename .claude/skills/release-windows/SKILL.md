---
name: release-windows
description: Empaqueta la aplicación de Windows de Chaos-Live (instalador NSIS y portable, con servidor, overlay y mod dentro) y verifica que arranca de verdad. Úsalo cuando se pida preparar, cortar o construir una release, subir de versión, o generar el instalador para el streamer.
---

# Empaquetar la aplicación de Windows

Desde v2.0.0 la distribución es una app de Electron, no un ZIP con `.bat`. Salen dos
ejecutables de `release/`: `Chaos-Live-Setup-X.Y.Z.exe` (instalador NSIS) y
`Chaos-Live-X.Y.Z-portable.exe`.

## Convención de ramas

El trabajo va a `develop` y las versiones a `release/vX.Y.Z`. **Nunca** se hace push a `main`.
No crees la rama de release por tu cuenta si el usuario ha dicho que hará él el merge.

## Subir la versión

El nombre de los ejecutables sale del `package.json` raíz, así que la versión hay que subirla en
los **10** `package.json` del monorepo (raíz + `packages/*` + `packages/adapters/*`, incluido
`packages/desktop`) **y** en el lockfile:

```bash
npm install --package-lock-only --ignore-scripts   # sincroniza package-lock.json
```

No edites `package-lock.json` a mano.

## Construir

```bash
npm run package:windows
```

Hace falta un **JDK 17 en el PATH**: el empaquetador compila el mod de Fabric para que la app lo
instale en un botón. Si no lo encuentra, **falla a propósito**; `-SinMod` lo salta, pero eso
devuelve al streamer a compilarse el mod, que es justo lo que vino a quitar v2.

`-SoloPayload` se queda en `release/electron-resources` sin llamar a electron-builder. Es lo que
hace falta para probar la app sin instalarla:

```bash
powershell -File ./scripts/package-windows.ps1 -SoloPayload
npm run dev --workspace=packages/desktop
```

## Trampas conocidas

**1. `ELECTRON_RUN_AS_NODE` en tu propio entorno.** Si la sesión desde la que lanzas Electron la
tiene puesta (pasa cuando el agente corre dentro de Electron), `electron .` arranca como Node
pelado: `require('electron')` devuelve una ruta y todo revienta con `Cannot read properties of
undefined (reading 'setName')`. No es un fallo del código. Lánzalo con `env -u
ELECTRON_RUN_AS_NODE`.

**2. El proceso principal es CommonJS.** `packages/desktop` es el único paquete del monorepo que
no es ESM, porque el cargador de Electron 33 no puede con un entry en módulos ES. Está explicado
en su `package.json`; no lo "arregles" pasándolo a ESM.

**3. electron-builder se borra su propio binario.** Al instalar dependencias de producción dentro
de un workspace reescribe el `node_modules` de la raíz y se lleva `app-builder-bin`. Por eso
`electron-builder.yml` lleva `npmRebuild: false`.

**4. La caja de firma trae symlinks de macOS.** Extraer `winCodeSign` falla en Windows sin
privilegios ("Cannot create symbolic link"). El script la precarga en su caché saltándose la
carpeta `darwin`. Si borras `%LOCALAPPDATA%\electron-builder\Cache`, se rehace sola.

**5. Versiones de Electron sin rango.** `packages/desktop` fija `electron` y `electron-builder` a
versión exacta: con un rango, electron-builder no encuentra Electron (npm lo eleva a la raíz) y
se planta con "Cannot compute electron version".

**6. `NativeCommandError` en PowerShell 5.1.** Ya no debería aparecer: todas las llamadas externas
pasan por `Invoke-Nativo`, que mira el código de salida en vez de fiarse de stderr. Si añades una
herramienta nueva al script, métela ahí también.

## Verificar que arranca (no basta con que se construya)

Prueba el binario empaquetado, no solo el instalador. **Usa puertos y carpeta de datos aparte**:
es muy habitual que el streamer tenga su Chaos-Live corriendo en 8080/8081, y no se toca.

```bash
T="$TEMP/chaos-pack-test"
rm -rf "$T"; mkdir -p "$T"
printf 'WS_PORT=8092\r\nOVERLAY_PORT=8093\r\nUSE_MOCK=true\r\nTIKTOK_USERNAME=probador\r\n' > "$T/.env"
env -u ELECTRON_RUN_AS_NODE ./release/win-unpacked/Chaos-Live.exe \
  --user-data-dir="$T" --remote-debugging-port=9224 &
```

Y comprueba las cuatro cosas:

```bash
curl -s http://127.0.0.1:8092/api/health                       # el servidor arrancó
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8092/dashboard
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:8093/?view=overlay"
# y la que de verdad se rompe: que la base de datos guarde
curl -s -X POST http://127.0.0.1:8092/api/test/event -H "Content-Type: application/json" \
  -d '{"type":"gift","value":30,"metadata":{"giftName":"Rose"}}'
sleep 4; curl -s "http://127.0.0.1:8092/api/history?limit=3"    # total > 0
```

Se apaga con `curl -X POST http://127.0.0.1:8092/api/shutdown` (apagado ordenado; en Windows no
hay señales, por eso existe esa ruta).

Para mirar la ventana por dentro, engánchate por CDP al puerto de depuración y evalúa
`document.body.innerText`. **`Page.captureScreenshot` no vuelve** si la ventana no está
compuesta en pantalla; para ver el overlay renderizado, usa la skill `overlay-preview`.

## La trampa de la base de datos

`config/database-template.db` la genera el empaquetador con `prisma db push` y viaja dentro de la
app: la distribución no lleva la herramienta de Prisma, así que el esquema no se puede crear en el
PC del streamer. La app la copia a `%APPDATA%\Chaos-Live\data\` la primera vez.

Y el `DATABASE_URL` **tiene que ser absoluto**. Prisma resuelve un `file:./x.db` contra la carpeta
del esquema, que queda grabada dentro del cliente generado al compilar y en el PC del streamer no
existe. Con una ruta relativa la app arranca sin quejarse y no guarda una sola fila: los errores
de escritura se tragan a propósito para no tumbar un directo. Lo pone `server-process.ts`; si
tocas eso, comprueba el historial después.

## Antes de dar la release por buena

- `npm test` en verde (22 suites).
- El overlay empaquetado es el build actual, no uno anterior.
- Los dos `.exe` rondan los 105 MB.
- `resources/mod/` trae el `.jar` (si no, empaquetaste con `-SinMod`).
- Los datos del streamer siguen en `%APPDATA%\Chaos-Live` después de reinstalar.
