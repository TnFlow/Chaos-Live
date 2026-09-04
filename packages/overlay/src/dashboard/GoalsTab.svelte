<script lang="ts">

  import type { Goal } from '../lib/types';

  let {
    goals,
    openNewGoal,
    openEditGoal,
    deleteGoal,
    resetGoal,
  }: {
    goals: Goal[];
    openNewGoal: () => void;
    openEditGoal: (goal: Goal) => void;
    deleteGoal: (id: string) => void;
    resetGoal: (id: string) => void;
  } = $props();
</script>

  <div class="goals-view">
    <div class="goals-header-bar">
      <div>
        <h2>🎯 Metas comunitarias</h2>
        <span class="desc">Las metas suman las aportaciones de toda la audiencia hasta desencadenar un evento grande en la partida.</span>
      </div>
      <button id="btn-add-goal" class="action-btn btn-primary" onclick={openNewGoal}>
        ➕ Crear meta nueva
      </button>
    </div>

    <div class="goals-grid">
      {#if goals.length === 0}
        <div class="empty-feed full-width">No active community goals. Click "➕ Crear meta nueva" to start one!</div>
      {:else}
        {#each goals as goal (goal.id)}
          <div class="goal-card glass-card {goal.completed ? 'goal-card-completed' : ''}">
            <div class="goal-top">
              <div class="goal-info">
                <h3 class="goal-name">{goal.name}</h3>
                <span class="goal-reward">🏆 Recompensa: {goal.rewardDescription || 'Evento de jefe'}</span>
              </div>
              <div class="goal-percentage">
                {Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100))}%
              </div>
            </div>

            <div class="progress-track">
              <div
                class="progress-fill"
                style="width: {Math.min(100, (goal.currentValue / goal.targetValue) * 100)}%"
              ></div>
            </div>

            <div class="goal-command-pill">
              <span class="cmd-label">Comando:</span>
              <code>{goal.actionCommand}</code>
            </div>

            <div class="goal-bottom">
              <span class="goal-counter">
                <strong>{goal.currentValue}</strong> / {goal.targetValue} {goal.unit || 'puntos'}
                {#if goal.repeatable}
                  <span class="repeat-tag" title="Se reinicia sola al completarse">🔄 Repetible</span>
                {/if}
              </span>

              <div class="card-actions">
                <button class="btn-sm btn-reset" onclick={() => resetGoal(goal.id)} title="Volver el progreso a 0">
                  🔄 Reiniciar
                </button>
                <button class="btn-sm btn-edit" onclick={() => openEditGoal(goal)}>Editar</button>
                <button class="btn-sm btn-del" onclick={() => deleteGoal(goal.id)}>Borrar</button>
              </div>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </div>
