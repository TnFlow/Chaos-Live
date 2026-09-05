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

Anchos y altos de cada widget: `packages/overlay/src/overlay/minecraft/widgets.ts`.
Sin `&widget=` sale el HUD completo, que va a 1080x1920.

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
PID=$(netstat -ano | grep -E ":8099|:8098" | grep LISTENING | awk '{print $5}' | head -1)
taskkill //PID $PID //T //F
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
