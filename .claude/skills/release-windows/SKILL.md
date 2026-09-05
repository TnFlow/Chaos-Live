---
name: release-windows
description: Empaqueta la distribución de Windows de Chaos-Live (ZIP con runtime, bundle, overlay y mod) y verifica que arranca de verdad. Úsalo cuando se pida preparar, cortar o construir una release, subir de versión, o generar el ZIP para el streamer.
---

# Empaquetar la release de Windows

## Convención de ramas

El trabajo va a `develop` y las versiones a `release/vX.Y.Z`. **Nunca** se hace push a `main`.
No crees la rama de release por tu cuenta si el usuario ha dicho que hará él el merge.

## Subir la versión

El nombre del ZIP sale del `package.json` raíz, así que la versión hay que subirla en los 9
`package.json` del monorepo **y** en el lockfile:

```bash
# los 9 package.json (raíz + packages/* + packages/adapters/*)
npm install --package-lock-only --ignore-scripts   # sincroniza package-lock.json
```

No edites `package-lock.json` a mano.

## Construir

```bash
npm run package:windows
```

Sale `release/Chaos-Live-vX.Y.Z-Windows.zip`.

Verás un `NativeCommandError` de `node.exe` en PowerShell 5.1: es esbuild escribiendo su resumen
por stderr, no un fallo. Lo que importa es la línea `[SUCCESS] Package created`.

## Las dos trampas conocidas

**1. El ZIP sale sin el runtime de Node.** El script solo *conserva* `bin/` si ya existe; nunca
lo rellena. Como cada versión estrena carpeta, el ZIP sale sin `bin/node.exe` y exige que el
streamer tenga Node instalado. Se detecta porque el ZIP pesa ~38 MB en vez de ~69 MB, y porque
el script avisa con `[AVISO] No hay bin\node.exe`. Solución: copiar el runtime de la release
anterior y reempaquetar.

```bash
cp release/Chaos-Live-v<anterior>-Windows/bin/node.exe release/Chaos-Live-vX.Y.Z-Windows/bin/
npm run package:windows
```

**2. El bundle solo arranca con `NODE_ENV=production`.** Sin esa variable revienta con
`__dirname is not defined in ES module scope` (pino-pretty acaba dentro de un bundle ESM). El
lanzador la pone; si pruebas a mano, ponla tú. No es un fallo de la release.

## Verificar que arranca (no basta con que compile)

```bash
cd release/Chaos-Live-vX.Y.Z-Windows
NODE_ENV=production WS_PORT=8099 OVERLAY_PORT=8098 USE_MOCK=true \
  ./bin/node.exe app/bundle.mjs > /tmp/rel.log 2>&1 &
sleep 12
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:8098/?view=overlay&theme=minecraft"
```

Comprueba además, con Python y `zipfile`, que el ZIP trae `bin/node.exe`, `app/bundle.mjs`,
`overlay/index.html` y `config/rules.json`, y que el JS del overlay dentro del ZIP coincide con
el de `packages/overlay/dist/assets/` — si no coincide, has empaquetado un build viejo.

Para ver el HUD renderizado desde el paquete, usa la skill `overlay-preview`.

## Antes de dar la release por buena

- `npm test` en verde (17 suites).
- El overlay empaquetado es el build actual, no uno anterior.
- El ZIP ronda los 69 MB.
