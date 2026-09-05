<script lang="ts">

  import { DEFAULT_OVERLAY_SETTINGS, THEME_PALETTES } from '../types/overlay-config';
  import { SOUND_PRESETS, playSound, setMasterVolume, setMuted } from '../utils/sound-engine';
  import type { OverlaySettings } from '@chaos-live/shared-protocol';
  import {
    WIDGET_COLUMN,
    WIDGET_HEIGHT,
    WIDGET_LABEL,
    WIDGET_NAMES,
    WIDGET_WIDTH,
    type WidgetName,
  } from '../overlay/minecraft/widgets';

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
    `${overlayBaseUrl || overlayBase}/?view=overlay&theme=minecraft&widget=${name}`;

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
        rompe nada, quedarse corto recorta el panel.
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

        {#each WIDGET_NAMES as name (name)}
          {@const url = widgetUrl(name)}
          <div class="url-card">
            <div class="url-card-header">
              <span class="url-type-badge modular-badge">🧩 {WIDGET_LABEL[name]}</span>
              <span class="res-tag">
                {WIDGET_WIDTH[WIDGET_COLUMN[name]]} x {WIDGET_HEIGHT[name]}
              </span>
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
