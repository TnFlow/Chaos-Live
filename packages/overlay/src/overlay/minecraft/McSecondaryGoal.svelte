<script lang="ts">
  /** Meta secundaria: una sola línea con barra fina, en cian para no competir
   * con la meta principal. */
  import type { GoalView } from '../../lib/overlay-types';
  import { splitGoalName } from '../../lib/mc-live-state';

  let { goal }: { goal: GoalView } = $props();

  let parts = $derived(splitGoalName(goal.name));
</script>

<div class="mc-goal2 mc-panel">
  <div class="mc-goal2__head">
    <span class="mc-goal2__name mc-truncate">{parts.emoji} {parts.title}</span>
    <span class="mc-goal2__counts mc-mono">{goal.currentValue} / {goal.targetValue}</span>
  </div>
  <div class="mc-track mc-track--slim">
    <div
      class="mc-track__fill mc-track__fill--cyan"
      style="width: {Math.min(100, goal.percent)}%"
    ></div>
  </div>
</div>
