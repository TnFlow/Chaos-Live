---
name: overlay-preview
description: Levanta Chaos-Live en modo mock y captura el overlay o un widget suelto con Chrome headless, para VER el cambio renderizado. Úsalo siempre que toques packages/overlay (componentes Mc*, overlay-minecraft.css, App.svelte) o cuando alguien pregunte cómo se ve el overlay o un widget. Compilar no demuestra que se vea nada.
---

# Previsualizar el overlay

Compilar y pasar los tests **no** demuestra que el overlay se vea. Ya ha pasado: el HUD
compilaba, los tests pasaban, y la página seguía pintando el overlay antiguo porque tres
sitios distintos pisaban el tema de la URL. Solo se detectó al mirar un PNG.

## 1. Arranca la app en puertos libres

Nunca uses 8080/8081: es habitual que el streamer tenga ya una instancia corriendo, y el
choque se manifiesta como `EADDRINUSE` en el log, no como un error visible.

```bash
WS_PORT=8099 OVERLAY_PORT=8098 USE_MOCK=true MOCK_INTERVAL_MS=800 \
  npm run dev --workspace=packages/app > /tmp/app.log 2>&1 &
sleep 12
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:8098/?view=overlay&theme=minecraft"
```

Espera un `200` antes de capturar. Sin `USE_MOCK=true` no hay eventos y todo sale vacío.

## 2. Captura

Chrome está en `C:\Program Files\Google\Chrome\Application\chrome.exe` (también hay Edge). No
hace falta puppeteer ni añadir dependencias.

```bash
CH="/c/Program Files/Google/Chrome/Application/chrome.exe"
"$CH" --headless=new --disable-gpu --hide-scrollbars \
  --virtual-time-budget=9000 --window-size=<ancho>,<alto> \
  --screenshot=/tmp/w.png \
  "http://127.0.0.1:8098/?view=overlay&theme=minecraft&widget=<nombre>"
```

Luego **lee el PNG** con la herramienta Read. Que el fichero exista no es la verificación; la
verificación es mirarlo.

Anchos y altos de cada widget: `packages/overlay/src/lib/widgets.ts`. Hay dos juegos de
medidas, uno por familia visual, y `widgetSize(name, theme)` devuelve el que toca.
Sin `&widget=` sale la vista de conjunto (el HUD pixel va a 1080x1920).

**Prueba siempre las dos familias.** El tema `minecraft` usa `McWidget` y los componentes
pixel; el resto usan `GlassWidget` y los de cristal. Un cambio en el escenario compartido
(`.widget-stage`, en overlay.css) toca a las dos, asi que captura una de cada.

## 3. Medir el alto real de un panel

Las alturas de `widgets.ts` se le documentan al streamer, así que no se estiman a ojo: una capa
corta recorta el panel en directo. Captura con una ventana alta y recorta el fondo con PIL
(disponible en el Python del sistema):

```python
from PIL import Image
im = Image.open(p).convert("RGBA"); w, h = im.size; px = im.load()
bg = px[w - 2, h - 2]          # el fondo de la página es uniforme
last = max(y for y in range(h) for x in range(0, w, 4) if px[x, y] != bg)
print(last + 1)
```

Captura varias veces con `--virtual-time-budget` creciente y quédate con el máximo: el menú de
regalos pasa de 431 a 546 px según cuántas filas traiga la página del carrusel.

## 4. Al terminar

```bash
netstat -ano | grep -E ":8099|:8098" | grep LISTENING | tr -s ' ' | cut -d' ' -f6 | head -1   | xargs -r -I{} taskkill //PID {} //T //F
```

Mata **solo** tu instancia. Si hay algo escuchando en 8080, es del usuario: no lo toques.

## Si el widget sale vacío o no es el que esperabas

- **Sale el overlay de cristal en vez del HUD pixel:** el tema no llegó. Los parámetros de URL
  se guardan en `urlSettingsOverrides` y se reaplican en los tres puntos que sobrescriben
  `overlaySettings` (fetch de ajustes, `INITIAL_OVERLAY_SETTINGS` y `OVERLAY_SETTINGS_UPDATED`).
  Si añades un cuarto, reaplícalos ahí también.
- **La capa de alertas sale vacía:** es lo correcto. Solo se pinta cuando hay una alerta viva.
- **Aparece un engranaje encima:** los mandos de prueba se están colando; deben estar detrás de
  `!widgetMode`.
- **Sale texto sin fondo y cortado por arriba:** el componente se diseñó para ir dentro de otro
  panel, que era quien le ponía fondo y margen. Suelto necesita un envoltorio
  `.glass-panel .widget-panel`, como se le hizo a la barra de meta.
- **Sale el aviso «el widget X no existe en el tema Y»:** es correcto. Las dos familias no
  cubren lo mismo (`queue` solo en pixel, `feed` solo en cristal); lo decide `widgetsForTheme`.

## Cuidado con `--virtual-time-budget`

Adelanta los temporizadores de la página, pero **no** hace que lleguen antes los eventos por
WebSocket. Lo que viene en el handshake (reglas, metas, clasificación) sí se ve; lo que depende
de eventos en vivo (el feed, las alertas, el contador de eventos) sale vacío en una captura
corta. No es un fallo del widget.

## Capturar lo que depende de eventos en vivo (alertas, feed)

Para esos hay que esperar en tiempo **real**, y `--screenshot` no sabe: dispara en cuanto se
agota el tiempo virtual. Se abre la pestaña por CDP, se espera de verdad y se captura. No hacen
falta dependencias: `WebSocket` es global desde Node 22.

```bash
chrome --headless=new --disable-gpu --hide-scrollbars \
  --remote-debugging-port=9222 --user-data-dir="$TEMP/chrome-shot" about:blank &
```

Luego, por CDP: `PUT /json/new?<url>` para abrir la pestaña, conectar a su
`webSocketDebuggerUrl`, `Emulation.setDeviceMetricsOverride` con el tamaño del widget,
`Page.navigate`, **esperar 12-16 s reales** (el mock manda un evento cada 800 ms) y
`Page.captureScreenshot`.

Truco para que la alerta no se apague antes de la captura: subir su duración por la API de
gestión, que no la limita como sí hace el panel.

```bash
curl -X PUT http://127.0.0.1:8099/api/overlay-settings \
  -H "Content-Type: application/json" -d '{"bannerDurationSeconds":600}'
```

Devuélvela a `4.8` al terminar: se persiste en `config/overlay-settings.json`.
