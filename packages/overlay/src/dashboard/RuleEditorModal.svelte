<script lang="ts">

  import { TIKTOK_GIFTS, MINECRAFT_COMMAND_PRESETS } from '../data/tiktok-gifts';
  import type { TikTokGiftPreset, CommandPreset } from '../data/tiktok-gifts';
  import { SOUND_PRESETS, playSound } from '../utils/sound-engine';
  import type { RuleDefinition } from '../lib/types';

  let {
    editingRule = $bindable(),
    selectedPresetGiftId = $bindable(''),
    commandPreview,
    testingRuleId,
    applyGiftPreset,
    applyCommandPreset,
    insertVariable,
    saveRule,
    saveAndTestRule,
    testRule,
    closeEditor,
  }: {
    editingRule: RuleDefinition;
    selectedPresetGiftId?: string;
    commandPreview: string;
    testingRuleId: string;
    applyGiftPreset: (preset: TikTokGiftPreset) => void;
    applyCommandPreset: (preset: CommandPreset) => void;
    insertVariable: (token: string) => void;
    saveRule: () => void;
    saveAndTestRule: () => void;
    testRule: (rule: RuleDefinition) => void;
    closeEditor: () => void;
  } = $props();
</script>

  <div
    class="modal-backdrop"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={(e) => {
      if (e.target === e.currentTarget) closeEditor();
    }}
    onkeydown={(e) => {
      if (e.key === 'Escape') closeEditor();
    }}
  >
    <div class="modal-card glass-card modal-card-large">
      <div class="modal-header">
        <div class="modal-title-wrap">
          <span class="modal-icon-badge">{editingRule.icon || '🎁'}</span>
          <div>
            <h3>{editingRule.id ? 'Editar regla' : 'Crear regla nueva'}</h3>
            <span class="modal-subtitle">Convierte un regalo en algo que pasa en la partida</span>
          </div>
        </div>
        <button class="close-btn" onclick={() => (closeEditor())}>✕</button>
      </div>

      <div class="modal-form-scrollable">
        <!-- Step 1: TikTok Gift & Trigger Presets Quick Picker -->
        <div class="preset-section">
          <div class="section-label">⚡ Regalos de TikTok (pulsa para rellenar):</div>
          <div class="preset-pills-wrap">
            {#each TIKTOK_GIFTS as gift (gift.id)}
              <button
                type="button"
                class="gift-preset-pill {selectedPresetGiftId === gift.id ? 'preset-selected' : ''}"
                onclick={() => applyGiftPreset(gift)}
              >
                <span class="preset-emoji">{gift.icon}</span>
                <span class="preset-name">{gift.name}</span>
                <span class="preset-coins">{gift.coins} 💎</span>
              </button>
            {/each}
          </div>
        </div>

        <div class="form-columns">
          <div class="form-col">
            <label for="rule-name-input">Nombre de la regla</label>
            <input
              id="rule-name-input"
              type="text"
              bind:value={editingRule.name}
              placeholder="ej. Regalo: Rosa -> Invocar gallina"
              class="styled-input"
            />
          </div>

          <div class="form-col">
            <label for="rule-giftname-input">Nombre exacto del regalo en TikTok</label>
            <input
              id="rule-giftname-input"
              type="text"
              value={editingRule.matcher.metadataMatch?.giftName || ''}
              oninput={(e) => {
                if (!editingRule.matcher.metadataMatch) editingRule.matcher.metadataMatch = {};
                editingRule.matcher.metadataMatch.giftName = (e.target as HTMLInputElement).value;
              }}
              placeholder="ej. Rose, Ice Cream, Lion (en inglés, como los envía TikTok)"
              class="styled-input"
            />
          </div>
        </div>

        <!-- Icon & Custom Image Personalization -->
        <div class="icon-customizer-box">
          <div class="form-col">
            <label for="rule-icon-input">Icono o emoji</label>
            <div class="emoji-selector-row">
              <input
                id="rule-icon-input"
                type="text"
                bind:value={editingRule.icon}
                placeholder="🌹"
                class="styled-input emoji-input"
                maxlength="4"
              />
              <div class="quick-emojis">
                {#each ['🌹', '🍦', '🍩', '💖', '💸', '🦁', '⭐', '❤️', '💣', '⚡', '🏹', '💎'] as em}
                  <button
                    type="button"
                    class="quick-emoji-btn"
                    onclick={() => (editingRule.icon = em)}
                  >
                    {em}
                  </button>
                {/each}
              </div>
            </div>
          </div>

          <div class="form-col">
            <label for="rule-imgurl-input">Imagen personalizada (opcional)</label>
            <div class="imgurl-input-wrap">
              <input
                id="rule-imgurl-input"
                type="url"
                bind:value={editingRule.imageUrl}
                placeholder="https://... o data:image/png;base64,..."
                class="styled-input"
              />
              {#if editingRule.imageUrl}
                <img src={editingRule.imageUrl} alt="Preview" class="input-preview-thumb" />
              {/if}
            </div>
          </div>
        </div>

        <!-- Command Presets Quick Bar -->
        <div class="preset-section">
          <div class="section-label">🎮 Minecraft Command Presets:</div>
          <div class="command-presets-wrap">
            {#each MINECRAFT_COMMAND_PRESETS as cmd (cmd.id)}
              <button
                type="button"
                class="cmd-preset-pill"
                onclick={() => applyCommandPreset(cmd)}
                title={cmd.command}
              >
                {cmd.label}
              </button>
            {/each}
          </div>
        </div>

        <!-- Minecraft In-Game Command -->
        <div class="form-row">
          <label for="rule-command-input">Comando de Minecraft</label>
          <input
            id="rule-command-input"
            type="text"
            bind:value={editingRule.action.command}
            placeholder="/summon zombie ~ ~ ~"
            class="styled-input"
          />
          <div class="token-helpers">
            <span>Atajos:</span>
            <button
              type="button"
              class="token-pill"
              onclick={() => {
                if (!editingRule.action.command.startsWith('execute at @p run')) {
                  editingRule.action.command = `execute at @p run ${editingRule.action.command}`.trim();
                }
              }}
              title="Ejecuta el comando justo donde está el jugador"
            >
              📍 execute at @p run
            </button>
            <button type="button" class="token-pill" onclick={() => insertVariable('${user.displayName}')}>
              $&#123;user.displayName&#125;
            </button>
            <button type="button" class="token-pill" onclick={() => insertVariable('${metadata.giftName}')}>
              $&#123;metadata.giftName&#125;
            </button>
            <button type="button" class="token-pill" onclick={() => insertVariable('${event.value}')}>
              $&#123;event.value&#125;
            </button>
          </div>
        </div>

        <!-- StreamToEarn Viewer Feedback Section -->
        <div class="viewer-feedback-section">
          <div class="section-header-row">
            <span class="section-title">👁️ Lo que verá la audiencia en pantalla</span>
            <span class="section-hint">Personaliza la alerta que aparece en el overlay</span>
          </div>

          <div class="form-columns">
            <div class="form-col">
              <label for="feedback-title-input">Titular de la alerta</label>
              <input
                id="feedback-title-input"
                type="text"
                bind:value={editingRule.viewerFeedback.title}
                placeholder="ej. 🦁 ¡LLEGÓ EL LEÓN!"
                class="styled-input"
              />
            </div>

            <div class="form-col">
              <label for="feedback-color-input">Color de la alerta</label>
              <div class="color-picker-row">
                <input
                  id="feedback-color-input"
                  type="color"
                  bind:value={editingRule.viewerFeedback.bannerColor}
                  class="styled-color-picker"
                />
                <div class="quick-colors">
                  {#each ['#f43f5e', '#06b6d4', '#10b981', '#f59e0b', '#a855f7', '#ec4899'] as color}
                    <button
                      type="button"
                      class="color-dot"
                      aria-label="Select accent color {color}"
                      style="background-color: {color};"
                      onclick={() => {
                        if (editingRule.viewerFeedback) editingRule.viewerFeedback.bannerColor = color;
                      }}
                    ></button>
                  {/each}
                </div>
              </div>
            </div>
          </div>

          <div class="form-row">
            <label for="feedback-desc-input">Descripción para la audiencia</label>
            <input
              id="feedback-desc-input"
              type="text"
              bind:value={editingRule.viewerFeedback.description}
              placeholder="ej. ¡SuperFan99 invocó un Creeper cargado!"
              class="styled-input"
            />
          </div>

          <!-- Custom Sound Effect Picker -->
          <div class="form-row">
            <label for="rule-sound-select">🔊 Sonido del evento</label>
            <div class="sound-selector-row">
              <select
                id="rule-sound-select"
                bind:value={editingRule.viewerFeedback.soundEffect}
                class="styled-select sound-dropdown"
              >
                <option value="">-- Sin sonido --</option>
                {#each SOUND_PRESETS as sound}
                  <option value={sound.id}>{sound.name} ({sound.description})</option>
                {/each}
              </select>
              <button
                type="button"
                class="action-btn btn-sound-test"
                onclick={() => playSound(editingRule.viewerFeedback.soundEffect || 'chime-diamond')}
                title="Escuchar este sonido"
              >
                🔊 Probar sonido
              </button>
            </div>
          </div>

          <!-- Live Viewer Alert Preview Box -->
          <div class="alert-preview-card" style="--preview-accent: {editingRule.viewerFeedback.bannerColor || '#00f0ff'}">
            <div class="preview-card-icon">
              {#if editingRule.imageUrl}
                <img src={editingRule.imageUrl} alt="Icon" class="preview-img-thumb" />
              {:else}
                <span>{editingRule.icon || '🎁'}</span>
              {/if}
            </div>
            <div class="preview-card-text">
              <div class="preview-card-title">{editingRule.viewerFeedback.title || 'EVENTO ESPECIAL'}</div>
              <div class="preview-card-desc">
                {(editingRule.viewerFeedback.description || '¡${user.displayName} envió un regalo!')
                  .replace(/\$\{user\.displayName\}/g, 'SuperFan99')
                  .replace(/\$\{metadata\.giftName\}/g, editingRule.matcher.metadataMatch?.giftName || 'Rose')
                  .replace(/\$\{event\.value\}/g, String(editingRule.matcher.minValue || 10))}
              </div>
            </div>
            <span class="preview-tag">VISTA PREVIA</span>
          </div>
        </div>

        <div class="form-columns">
          <div class="form-col">
            <label for="rule-priority-input">Prioridad (más alta = se ejecuta antes)</label>
            <input id="rule-priority-input" type="number" bind:value={editingRule.priority} class="styled-input" />
          </div>
          <div class="form-col">
            <label for="rule-cooldown-input">Espera entre disparos (segundos)</label>
            <input id="rule-cooldown-input" type="number" bind:value={editingRule.cooldownSeconds} class="styled-input" />
          </div>
        </div>

        <div class="preview-box">
          <span class="preview-label">Así quedará el comando:</span>
          <code class="preview-code">{commandPreview}</code>
        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="action-btn btn-secondary" onclick={() => (closeEditor())}>Cancelar</button>
        {#if editingRule.id}
          <button
            type="button"
            class="action-btn btn-test {testingRuleId === editingRule.id ? 'btn-testing' : ''}"
            onclick={() => testRule(editingRule)}
            disabled={testingRuleId === editingRule.id}
          >
            {testingRuleId === editingRule.id ? '⏳ Probando...' : '🧪 Probar ahora'}
          </button>
        {/if}
        <button type="button" class="action-btn btn-primary" onclick={saveAndTestRule}>
          💾 Guardar y probar
        </button>
      </div>
    </div>
  </div>
