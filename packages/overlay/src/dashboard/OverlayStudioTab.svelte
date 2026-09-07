<script lang="ts">

  import { DEFAULT_OVERLAY_SETTINGS, THEME_PALETTES } from '../types/overlay-config';
  import { SOUND_PRESETS, playSound, setMasterVolume, setMuted } from '../utils/sound-engine';
  import type { OverlaySettings, OverlaySoundEvent } from '@chaos-live/shared-protocol';
  import { api, ApiError, type CustomSound } from '../lib/api';
  import {
    WIDGET_LABEL,
    widgetSize,
    widgetsForTheme,
    type WidgetName,
  } from '../lib/widgets';

  /**
   * Base de las URLs del overlay.
   *
   * Estaban fijadas a `localhost:8080`, asi que si el streamer cambiaba
   * `WS_PORT` los botones de copiar entregaban un enlace roto para OBS.
   */
  const overlayBase = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080';

  /**
   * Base publica de los widgets.
   *
   * Llega del servidor (`/api/status`) porque el panel se sirve desde el puerto
   * de gestion y no puede adivinar el puerto publico. Si aun no ha llegado, se
   * cae al origen actual, que al menos da un enlace utilizable en local.
   */
  const widgetUrl = (name: WidgetName): string =>
    `${overlayBaseUrl || overlayBase}/?view=overlay&theme=${overlaySettings.theme}&widget=${name}`;

  /**
   * Sonidos propios del streamer, servidos por el propio Chaos-Live.
   *
   * Se cargan al abrir la pestaña y se refrescan tras cada subida o borrado,
   * porque la lista la manda el servidor: es el unico que sabe que hay de
   * verdad en la carpeta.
   */
  let sonidosPropios = $state<CustomSound[]>([]);
  let subiendo = $state(false);
  let avisoSonido = $state('');

  const MOMENTOS: { id: OverlaySoundEvent; etiqueta: string }[] = [
    { id: 'gift', etiqueta: '🎁 Regalo recibido' },
    { id: 'like', etiqueta: '❤️ Me gusta' },
    { id: 'follow', etiqueta: '⭐ Nuevo seguidor' },
    { id: 'share', etiqueta: '🚀 Comparten el directo' },
    { id: 'comment', etiqueta: '💬 Comentario' },
    { id: 'goal', etiqueta: '🏆 Meta completada' },
  ];

  async function cargarSonidos() {
    try {
      sonidosPropios = await api.getSounds();
    } catch (err) {
      avisoSonido = err instanceof ApiError ? err.userMessage : String(err);
    }
  }

  $effect(() => {
    void cargarSonidos();
  });

  /** Sonido que suena ahora mismo para un momento dado. */
  function sonidoDe(momento: OverlaySoundEvent): string {
    return overlaySettings.eventSounds?.[momento] ?? 'none';
  }

  function elegirSonido(momento: OverlaySoundEvent, valor: string) {
    overlaySettings.eventSounds = { ...overlaySettings.eventSounds, [momento]: valor };
    saveOverlaySettings();
  }

  async function subirSonido(evento: Event) {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (!archivo) return;

    subiendo = true;
    avisoSonido = '';
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const lector = new FileReader();
        lector.onload = () => resolve(String(lector.result));
        lector.onerror = () => reject(new Error('No se pudo leer el archivo.'));
        lector.readAsDataURL(archivo);
      });

      const sonido = await api.uploadSound(archivo.name, dataUrl);
      await cargarSonidos();
      avisoSonido = `✅ "${sonido.name}" listo para usar.`;
      playSound(sonido.url);
    } catch (err) {
      avisoSonido = `⚠️ ${err instanceof ApiError ? err.userMessage : String(err)}`;
    } finally {
      subiendo = false;
      // Permite volver a elegir el mismo archivo si hizo falta reintentar.
      input.value = '';
    }
  }

  async function borrarSonido(sonido: CustomSound) {
    // Un sonido borrado que siguiera elegido dejaria ese evento mudo sin
    // explicacion, asi que los momentos que lo usaban vuelven a "sin sonido".
    try {
      await api.deleteSound(sonido.id);
      const limpio = { ...overlaySettings.eventSounds };
      for (const [momento, valor] of Object.entries(limpio)) {
        if (valor === sonido.url) limpio[momento as OverlaySoundEvent] = 'none';
      }
      overlaySettings.eventSounds = limpio;
      saveOverlaySettings();
      await cargarSonidos();
      avisoSonido = `🗑️ "${sonido.name}" borrado.`;
    } catch (err) {
      avisoSonido = `⚠️ ${err instanceof ApiError ? err.userMessage : String(err)}`;
    }
  }

  let {
    overlaySettings = $bindable(),
    overlayBaseUrl = '',
    copiedUrlType,
    saveOverlaySettings,
    copyToClipboard,
  }: {
    overlaySettings: OverlaySettings;
    overlayBaseUrl?: string;
    copiedUrlType: string;
    saveOverlaySettings: () => void;
    copyToClipboard: (text: string, type: string) => void;
  } = $props();
</script>

  <div class="studio-view glass-card">
    <div class="studio-header">
      <div>
        <h2>🎨 Estudio de Overlay</h2>
        <p class="panel-desc">
          Personaliza lo que ve tu audiencia en pantalla, para <strong>OBS Studio</strong> o <strong>TikTok Live Studio</strong>.
        </p>
      </div>
      <div class="studio-header-actions">
        <button class="action-btn btn-secondary" onclick={() => window.open('/overlay', '_blank')}>
          📺 Abrir el overlay
        </button>
        <button class="action-btn btn-primary" onclick={saveOverlaySettings}>
          💾 Guardar y aplicar
        </button>
      </div>
    </div>

    <!-- Section 1: One-Click OBS & TikTok Live Studio URLs -->
    <div class="studio-section">
      <h3 class="section-title">📋 Enlaces para tu programa de streaming</h3>
      <p class="section-subtitle">
        En TikTok LIVE Studio, cada widget es su propia fuente <em>Link</em>: pega un enlace por
        capa y dale a la capa el tamaño indicado. El tamaño es un máximo con margen — pasarse no
        rompe nada, quedarse corto recorta el panel. Los enlaces llevan el tema que tengas
        elegido arriba, y la lista cambia con él: cada tema pinta los paneles que tiene.
      </p>

      <div class="url-cards-grid">
        <div class="url-card">
          <div class="url-card-header">
            <span class="url-type-badge landscape-badge">🖥️ OBS Studio (horizontal 16:9)</span>
            <span class="res-tag">1920 x 1080</span>
          </div>
          <div class="url-input-row">
            <input type="text" readonly value={`${overlayBase}/overlay`} class="styled-input url-input" />
            <button
              class="action-btn btn-copy {copiedUrlType === 'Landscape' ? 'btn-copied' : ''}"
              onclick={() => copyToClipboard(`${overlayBase}/overlay`, 'Landscape')}
            >
              {copiedUrlType === 'Landscape' ? '✓ ¡Copiado!' : '📋 Copiar enlace'}
            </button>
          </div>
        </div>

        <div class="url-card">
          <div class="url-card-header">
            <span class="url-type-badge vertical-badge">📱 TikTok Live Studio (vertical 9:16)</span>
            <span class="res-tag">1080 x 1920</span>
          </div>
          <div class="url-input-row">
            <input type="text" readonly value={`${overlayBase}/overlay?layout=vertical`} class="styled-input url-input" />
            <button
              class="action-btn btn-copy {copiedUrlType === 'Vertical' ? 'btn-copied' : ''}"
              onclick={() => copyToClipboard(`${overlayBase}/overlay?layout=vertical`, 'Vertical')}
            >
              {copiedUrlType === 'Vertical' ? '✓ ¡Copiado!' : '📋 Copiar enlace'}
            </button>
          </div>
        </div>

        {#each widgetsForTheme(overlaySettings.theme) as name (name)}
          {@const url = widgetUrl(name)}
          {@const size = widgetSize(name, overlaySettings.theme)}
          <div class="url-card">
            <div class="url-card-header">
              <span class="url-type-badge modular-badge">🧩 {WIDGET_LABEL[name]}</span>
              <span class="res-tag">{size.width} x {size.height}</span>
            </div>
            <div class="url-input-row">
              <input type="text" readonly value={url} class="styled-input url-input" />
              <button
                class="action-btn btn-copy {copiedUrlType === name ? 'btn-copied' : ''}"
                onclick={() => copyToClipboard(url, name)}
              >
                {copiedUrlType === name ? '✓ ¡Copiado!' : '📋 Copiar enlace'}
              </button>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <div class="studio-settings-grid">
      <!-- Column 1: Layout & Themes -->
      <div class="studio-col glass-card">
        <h4>📐 Diseño y estética</h4>

        <div class="form-row">
          <label for="studio-layout-select">Orientación del diseño</label>
          <select id="studio-layout-select" bind:value={overlaySettings.layout} class="styled-select">
            <option value="landscape">🖥️ Horizontal 16:9 (OBS / Twitch / YouTube)</option>
            <option value="vertical">📱 Vertical 9:16 (TikTok Live Studio)</option>
            <option value="compact">🧩 Compacto en una esquina</option>
          </select>
        </div>

        <div class="form-row">
          <label for="studio-theme-select">Paleta de colores</label>
          <select id="studio-theme-select" bind:value={overlaySettings.theme} class="styled-select">
            {#each Object.entries(THEME_PALETTES) as [id, theme]}
              <option value={id}>{theme.name}</option>
            {/each}
          </select>
        </div>

        <div class="form-row">
          <label for="studio-scale-slider">
            Escala general: <strong>{Math.round(overlaySettings.scale * 100)}%</strong>
          </label>
          <input
            id="studio-scale-slider"
            type="range"
            min="0.7"
            max="1.4"
            step="0.05"
            bind:value={overlaySettings.scale}
            class="styled-range"
          />
        </div>

        <div class="form-row">
          <label for="studio-glass-slider">
            Intensidad del efecto cristal: <strong>{Math.round(overlaySettings.glassIntensity * 100)}%</strong>
          </label>
          <input
            id="studio-glass-slider"
            type="range"
            min="0.4"
            max="0.95"
            step="0.05"
            bind:value={overlaySettings.glassIntensity}
            class="styled-range"
          />
        </div>

        <div class="form-row">
          <label for="studio-glow-slider">
            Intensidad del brillo neón: <strong>{Math.round(overlaySettings.glowIntensity * 100)}%</strong>
          </label>
          <input
            id="studio-glow-slider"
            type="range"
            min="0.2"
            max="1.0"
            step="0.1"
            bind:value={overlaySettings.glowIntensity}
            class="styled-range"
          />
        </div>
      </div>

      <!-- Column 2: Sound & Audio Effects Studio -->
      <div class="studio-col glass-card">
        <h4>🔊 Sonido</h4>

        <div class="form-row checkbox-row">
          <label class="checkbox-label">
            <input
              type="checkbox"
              bind:checked={overlaySettings.soundEnabled}
              onchange={() => setMuted(!overlaySettings.soundEnabled)}
            />
            <span><strong>Activar efectos de sonido</strong> (suenan al recibir regalos y eventos)</span>
          </label>
        </div>

        <div class="form-row">
          <label for="studio-volume-slider">
            Volumen general: <strong>{Math.round(overlaySettings.masterVolume * 100)}%</strong>
          </label>
          <input
            id="studio-volume-slider"
            type="range"
            min="0.0"
            max="1.0"
            step="0.05"
            bind:value={overlaySettings.masterVolume}
            oninput={() => setMasterVolume(overlaySettings.masterVolume)}
            class="styled-range"
          />
        </div>

        <div class="sound-events">
          <span class="pad-title">🔔 Sonido de cada momento del directo</span>
          <p class="sound-hint">
            Elige uno de los incluidos o sube el tuyo. Se guarda solo.
          </p>

          {#each MOMENTOS as momento}
            <div class="sound-event-row">
              <label class="sound-event-label" for="sonido-{momento.id}">{momento.etiqueta}</label>
              <select
                id="sonido-{momento.id}"
                class="styled-select"
                value={sonidoDe(momento.id)}
                onchange={(e) => elegirSonido(momento.id, (e.target as HTMLSelectElement).value)}
              >
                <option value="none">🔇 Sin sonido</option>
                <optgroup label="Incluidos">
                  {#each SOUND_PRESETS as preset}
                    <option value={preset.id}>{preset.name}</option>
                  {/each}
                </optgroup>
                {#if sonidosPropios.length > 0}
                  <optgroup label="Los tuyos">
                    {#each sonidosPropios as propio}
                      <option value={propio.url}>🎵 {propio.name}</option>
                    {/each}
                  </optgroup>
                {/if}
              </select>
              <button
                type="button"
                class="sound-try-btn"
                title="Escuchar"
                onclick={() => playSound(sonidoDe(momento.id))}
              >▶</button>
            </div>
          {/each}
        </div>

        <div class="sound-upload">
          <span class="pad-title">📤 Tus sonidos</span>
          <p class="sound-hint">
            MP3, WAV, OGG, M4A o AAC. Máximo 3 MB: son avisos de un par de
            segundos, no canciones.
          </p>

          <label class="sound-upload-btn" class:is-busy={subiendo}>
            {subiendo ? 'Subiendo…' : '➕ Subir un sonido'}
            <input
              type="file"
              accept="audio/*"
              disabled={subiendo}
              onchange={subirSonido}
              hidden
            />
          </label>

          {#if avisoSonido}
            <p class="sound-aviso">{avisoSonido}</p>
          {/if}

          {#if sonidosPropios.length > 0}
            <ul class="sound-list">
              {#each sonidosPropios as propio}
                <li class="sound-list-row">
                  <button
                    type="button"
                    class="sound-try-btn"
                    title="Escuchar"
                    onclick={() => playSound(propio.url)}
                  >▶</button>
                  <span class="sound-list-name">{propio.name}</span>
                  <span class="sound-list-size">{Math.round(propio.sizeBytes / 1024)} KB</span>
                  <button
                    type="button"
                    class="sound-del-btn"
                    title="Borrar"
                    onclick={() => borrarSonido(propio)}
                  >🗑️</button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        <div class="sound-test-pad">
          <span class="pad-title">🎵 Probar sonidos (pulsa para escuchar):</span>
          <div class="sound-buttons-grid">
            {#each SOUND_PRESETS as sound}
              <button
                type="button"
                class="sound-preset-btn"
                onclick={() => playSound(sound.id)}
              >
                <span class="sound-btn-icon">{sound.icon}</span>
                <span class="sound-btn-name">{sound.name}</span>
              </button>
            {/each}
          </div>
        </div>
      </div>

      <!-- Column 3: Widget Positions & Display -->
      <div class="studio-col glass-card">
        <h4>🧩 Colocación de los widgets</h4>

        <div class="form-row">
          <label for="studio-rewards-mode">Menú de recompensas</label>
          <select id="studio-rewards-mode" bind:value={overlaySettings.rewardsMode} class="styled-select">
            <option value="both">🎁 Panel lateral y marquesina inferior</option>
            <option value="ticker">⚡ Solo la marquesina inferior</option>
            <option value="menu">📋 Solo el panel lateral</option>
            <option value="off">🚫 Ocultar el menú</option>
          </select>
        </div>

        <div class="form-row">
          <label for="studio-goal-pos">Posición de la barra de meta</label>
          <select id="studio-goal-pos" bind:value={overlaySettings.goalPosition} class="styled-select">
            <option value="top">⬆️ Franja superior</option>
            <option value="bottom">⬇️ Zona inferior</option>
            <option value="hidden">🚫 Oculto</option>
          </select>
        </div>

        <div class="form-row">
          <label for="studio-feed-pos">Posición del feed de interacciones</label>
          <select id="studio-feed-pos" bind:value={overlaySettings.feedPosition} class="styled-select">
            <option value="left">⬅️ Columna izquierda</option>
            <option value="right">➡️ Columna derecha</option>
            <option value="hidden">🚫 Oculto</option>
          </select>
        </div>

        <div class="form-row">
          <label for="studio-leaderboard-pos">Posición de la clasificación</label>
          <select id="studio-leaderboard-pos" bind:value={overlaySettings.leaderboardPosition} class="styled-select">
            <option value="right">➡️ Columna derecha</option>
            <option value="left">⬅️ Columna izquierda</option>
            <option value="hidden">🚫 Oculto</option>
          </select>
        </div>

        <div class="form-row">
          <label for="studio-marquee-speed">
            Velocidad de la marquesina: <strong>{overlaySettings.marqueeSpeedSeconds}s</strong>
          </label>
          <input
            id="studio-marquee-speed"
            type="range"
            min="15"
            max="45"
            step="1"
            bind:value={overlaySettings.marqueeSpeedSeconds}
            class="styled-range"
          />
        </div>

        <div class="form-row">
          <label for="studio-banner-duration">
            Duración de las alertas: <strong>{overlaySettings.bannerDurationSeconds}s</strong>
          </label>
          <input
            id="studio-banner-duration"
            type="range"
            min="3"
            max="10"
            step="0.5"
            bind:value={overlaySettings.bannerDurationSeconds}
            class="styled-range"
          />
        </div>
      </div>
    </div>

    <div class="studio-footer">
      <button class="action-btn btn-secondary" onclick={() => (overlaySettings = { ...DEFAULT_OVERLAY_SETTINGS })}>
        🔄 Volver a los valores por defecto
      </button>
      <button class="action-btn btn-primary btn-save-studio" onclick={saveOverlaySettings}>
        💾 Guardar y aplicar al overlay
      </button>
    </div>
  </div>
