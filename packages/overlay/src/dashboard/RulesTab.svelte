<script lang="ts">

  import type { RuleDefinition } from '../lib/types';

  let {
    rules,
    filteredRules,
    ruleFilterPlatform = $bindable('all'),
    testingRuleId,
    openNewRule,
    openEditRule,
    toggleRule,
    testRule,
    deleteRule,
  }: {
    rules: RuleDefinition[];
    filteredRules: RuleDefinition[];
    ruleFilterPlatform?: string;
    testingRuleId: string;
    openNewRule: () => void;
    openEditRule: (rule: RuleDefinition) => void;
    toggleRule: (rule: RuleDefinition) => void;
    testRule: (rule: RuleDefinition) => void;
    deleteRule: (id: string) => void;
  } = $props();
</script>

  <div class="rules-view">
    <div class="rules-toolbar">
      <div class="toolbar-left">
        <button id="btn-add-rule" class="action-btn btn-primary" onclick={openNewRule}>
          ➕ Crear regla nueva
        </button>

        <div class="filter-group">
          <span>Plataforma:</span>
          <select bind:value={ruleFilterPlatform} class="styled-select">
            <option value="all">Todas</option>
            <option value="tiktok">TikTok</option>
            <option value="twitch">Twitch</option>
            <option value="mock">Simulador</option>
          </select>
        </div>
      </div>

      <span class="rules-counter">{filteredRules.length} regla(s)</span>
    </div>

    <div class="rules-grid">
      {#each filteredRules as rule (rule.id)}
        <div class="rule-card glass-card {rule.enabled ? '' : 'rule-disabled'}">
          <div class="rule-header">
            <div class="rule-title-area">
              <button
                class="toggle-btn {rule.enabled ? 'toggle-on' : 'toggle-off'}"
                onclick={() => toggleRule(rule)}
                title={rule.enabled ? 'Pulsa para desactivar' : 'Pulsa para activar'}
              >
                {rule.enabled ? 'ON' : 'OFF'}
              </button>
              <div class="rule-icon-box">
                {#if rule.imageUrl}
                  <img src={rule.imageUrl} alt={rule.name} class="rule-custom-img" />
                {:else}
                  <span class="rule-emoji">{rule.icon || '🎁'}</span>
                {/if}
              </div>
              <div>
                <h4 class="rule-name">{rule.name}</h4>
                {#if rule.matcher.metadataMatch?.giftName}
                  <span class="gift-subtag">Regalo de TikTok: {rule.matcher.metadataMatch.giftName}</span>
                {/if}
              </div>
            </div>

            <div class="rule-badges">
              <span class="badge badge-priority">P: {rule.priority}</span>
              {#if rule.matcher.platforms}
                {#each rule.matcher.platforms as p}
                  <span class="badge badge-platform">{p}</span>
                {/each}
              {:else}
                <span class="badge badge-platform">todas</span>
              {/if}
            </div>
          </div>

          <div class="rule-criteria">
            <span class="criteria-label">Se activa con:</span>
            <span class="criteria-val">
              {(rule.matcher.eventTypes || ['cualquiera']).join(', ')}
              {#if rule.matcher.metadataMatch?.giftName}
                ({rule.matcher.metadataMatch.giftName})
              {/if}
              {#if rule.matcher.minValue}
                (≥ {rule.matcher.minValue} 💎)
              {/if}
            </span>
          </div>

          <div class="rule-action">
            <span class="action-label">Comando de Minecraft:</span>
            <code class="cmd-code">{rule.action.command}</code>
          </div>

          <!-- Viewer Feedback Preview Pill -->
          {#if rule.viewerFeedback}
            <div class="viewer-feedback-preview" style="border-left-color: {rule.viewerFeedback.bannerColor || '#00f0ff'}">
              <span class="feedback-label">👁️ Alerta en el overlay:</span>
              <div class="feedback-title" style="color: {rule.viewerFeedback.bannerColor || '#00f0ff'}">
                {rule.viewerFeedback.title || 'Evento en la partida'}
              </div>
              <div class="feedback-desc">{rule.viewerFeedback.description || ''}</div>
            </div>
          {/if}

          <div class="rule-footer">
            <span class="cooldown-tag">⏱️ Espera: {rule.cooldownSeconds || 0}s</span>
            <div class="card-actions">
              <button
                class="btn-sm btn-test {testingRuleId === rule.id ? 'btn-testing' : ''}"
                onclick={() => testRule(rule)}
                disabled={testingRuleId === rule.id}
                title="Lanza un evento de prueba para verlo en Minecraft y en el overlay"
              >
                {testingRuleId === rule.id ? '⏳ Probando...' : '🧪 Probar'}
              </button>
              <button class="btn-sm btn-edit" onclick={() => openEditRule(rule)}>Editar</button>
              <button class="btn-sm btn-del" onclick={() => deleteRule(rule.id)}>Borrar</button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  </div>
