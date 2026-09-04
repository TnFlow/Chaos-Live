<script lang="ts">

  import { COMMUNITY_GOAL_PRESETS } from '../data/tiktok-gifts';
  import type { CommunityGoalPreset } from '../data/tiktok-gifts';
  import type { Goal } from '../lib/types';

  let {
    editingGoal = $bindable(),
    selectedGoalPresetId = $bindable(''),
    goalCommandPreview,
    applyGoalPreset,
    insertGoalVariable,
    saveGoal,
    closeEditor,
  }: {
    editingGoal: Goal;
    selectedGoalPresetId?: string;
    goalCommandPreview: string;
    applyGoalPreset: (preset: CommunityGoalPreset) => void;
    insertGoalVariable: (token: string) => void;
    saveGoal: () => void;
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
          <span class="modal-icon-badge">🎯</span>
          <div>
            <h3>{editingGoal.id ? 'Editar meta comunitaria' : 'Crear meta comunitaria'}</h3>
            <span class="modal-subtitle">Objetivos colectivos que desencadenan un evento grande</span>
          </div>
        </div>
        <button class="close-btn" onclick={() => (closeEditor())}>✕</button>
      </div>

      <div class="modal-form-scrollable">
        <!-- Step 1: Goal Presets Quick Bar -->
        <div class="preset-section">
          <div class="section-label">⚡ Quick Community Goal Presets (Click to Auto-Fill):</div>
          <div class="preset-pills-wrap">
            {#each COMMUNITY_GOAL_PRESETS as preset (preset.id)}
              <button
                type="button"
                class="gift-preset-pill {selectedGoalPresetId === preset.id ? 'preset-selected' : ''}"
                onclick={() => applyGoalPreset(preset)}
              >
                <span class="preset-emoji">{preset.icon}</span>
                <span class="preset-name">{preset.name}</span>
                <span class="preset-coins">{preset.targetValue} {preset.unit}</span>
              </button>
            {/each}
          </div>
        </div>

        <div class="form-columns">
          <div class="form-col">
            <label for="goal-name-input">Título de la meta</label>
            <input
              id="goal-name-input"
              type="text"
              bind:value={editingGoal.name}
              placeholder="ej. 🌹 50 Rosas ➜ Invocar al Warden"
              class="styled-input"
            />
          </div>

          <div class="form-col">
            <label for="goal-reward-input">Recompensa (lo que verá la audiencia)</label>
            <input
              id="goal-reward-input"
              type="text"
              bind:value={editingGoal.rewardDescription}
              placeholder="ej. Invocar al jefe Warden"
              class="styled-input"
            />
          </div>
        </div>

        <div class="form-columns">
          <div class="form-col">
            <label for="goal-eventtype-select">Tipo de evento que suma</label>
            <select id="goal-eventtype-select" bind:value={editingGoal.eventType} class="styled-select">
              <option value="gift">Regalos (rosas, helados, diamantes...)</option>
              <option value="like">Me gusta</option>
              <option value="follow">Seguidores</option>
              <option value="comment">Comentarios</option>
            </select>
          </div>

          {#if editingGoal.eventType === 'gift'}
            <div class="form-col">
              <label for="goal-giftname-input">Regalo concreto de TikTok (opcional)</label>
              <input
                id="goal-giftname-input"
                type="text"
                bind:value={editingGoal.giftName}
                placeholder="ej. Rose, Ice Cream, Lion (vacío = cualquier regalo)"
                class="styled-input"
              />
            </div>
          {/if}
        </div>

        <div class="form-columns">
          <div class="form-col">
            <label for="goal-target-input">Objetivo a alcanzar</label>
            <input id="goal-target-input" type="number" min="1" bind:value={editingGoal.targetValue} class="styled-input" />
          </div>

          <div class="form-col">
            <label for="goal-current-input">Progreso actual</label>
            <input id="goal-current-input" type="number" min="0" bind:value={editingGoal.currentValue} class="styled-input" />
          </div>

          <div class="form-col">
            <label for="goal-unit-input">Nombre de la unidad</label>
            <input id="goal-unit-input" type="text" bind:value={editingGoal.unit} placeholder="Rosas, Me gusta, Puntos" class="styled-input" />
          </div>
        </div>

        <!-- Goal Minecraft Command -->
        <div class="form-row">
          <label for="goal-command-input">Comando de Minecraft al completarse</label>
          <input
            id="goal-command-input"
            type="text"
            bind:value={editingGoal.actionCommand}
            placeholder="summon warden ~ ~ ~"
            class="styled-input"
          />
          <div class="token-helpers">
            <span>Atajos:</span>
            <button
              type="button"
              class="token-pill"
              onclick={() => {
                if (!editingGoal.actionCommand.startsWith('execute at @p run')) {
                  editingGoal.actionCommand = `execute at @p run ${editingGoal.actionCommand}`.trim();
                }
              }}
              title="Ejecuta el comando justo donde está el jugador"
            >
              📍 execute at @p run
            </button>
            <button type="button" class="token-pill" onclick={() => insertGoalVariable('${goal.name}')}>
              $&#123;goal.name&#125;
            </button>
            <button type="button" class="token-pill" onclick={() => insertGoalVariable('${user.displayName}')}>
              $&#123;user.displayName&#125;
            </button>
          </div>
        </div>

        <div class="form-row checkbox-row">
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={editingGoal.repeatable} />
            <span><strong>Meta repetible:</strong> al completarse vuelve a 0 sola, para que la comunidad pueda conseguirla otra vez</span>
          </label>
        </div>

        <!-- Live Goal Progress Preview Box -->
        <div class="goal-preview-card">
          <div class="goal-top">
            <div class="goal-info">
              <h4 class="goal-name">{editingGoal.name || 'Meta comunitaria'}</h4>
              <span class="goal-reward">🏆 Recompensa: {editingGoal.rewardDescription || 'Evento de jefe'}</span>
            </div>
            <div class="goal-percentage">
              {Math.min(100, Math.round(((editingGoal.currentValue || 0) / (editingGoal.targetValue || 1)) * 100))}%
            </div>
          </div>
          <div class="progress-track">
            <div
              class="progress-fill"
              style="width: {Math.min(100, ((editingGoal.currentValue || 0) / (editingGoal.targetValue || 1)) * 100)}%"
            ></div>
          </div>
          <div class="goal-bottom">
            <span class="goal-counter">
              <strong>{editingGoal.currentValue || 0}</strong> / {editingGoal.targetValue || 50} {editingGoal.unit || 'puntos'}
            </span>
            <span class="preview-tag">VISTA PREVIA</span>
          </div>
        </div>

        <div class="preview-box">
          <span class="preview-label">Comando de la recompensa:</span>
          <code class="preview-code">{goalCommandPreview}</code>
        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="action-btn btn-secondary" onclick={() => (closeEditor())}>Cancelar</button>
        <button type="button" class="action-btn btn-primary" onclick={saveGoal}>
          💾 Guardar meta
        </button>
      </div>
    </div>
  </div>
