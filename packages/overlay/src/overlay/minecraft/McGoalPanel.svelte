<script lang="ts">
  /**
   * Panel grande de la meta activa: el elemento con más peso del HUD.
   *
   * El nombre de la meta ya trae dentro el emoji y la recompensa
   * ("🌹 50 Rosas ➜ Invocar al Warden"), así que se reparte en los tres huecos
   * del diseño en lugar de pintarlo como una sola línea.
   */
  import type { GoalView } from '../../lib/overlay-types';
  import { splitGoalName } from '../../lib/mc-live-state';

  let { goal }: { goal: GoalView } = $props();

  let parts = $derived(splitGoalName(goal.name));
</script>

<div class="mc-goal mc-panel--strong">
  <div class="mc-goal__head">
    <div class="mc-goal__ident">
      <div class="mc-slot mc-slot--goal mc-goal__emoji">{parts.emoji}</div>
      <div style="min-width:0">
        <div class="mc-goal__kicker mc-mono">META ACTIVA</div>
        <div class="mc-goal__name">{parts.title}</div>
      </div>
    </div>
    <div class="mc-goal__figures">
      <div class="mc-goal__pct mc-mono">{goal.percent}%</div>
      <div class="mc-goal__counts mc-mono">{goal.currentValue} / {goal.targetValue}</div>
    </div>
  </div>

  <div class="mc-track">
    <div class="mc-track__fill" style="width: {Math.min(100, goal.percent)}%"></div>
    <div class="mc-track__notches"></div>
  </div>

  {#if parts.reward}
    <div class="mc-goal__foot">
      <span class="mc-goal__foot-label mc-mono">DESBLOQUEA</span>
      <span class="mc-goal__reward">{parts.reward}</span>
    </div>
  {/if}
</div>
