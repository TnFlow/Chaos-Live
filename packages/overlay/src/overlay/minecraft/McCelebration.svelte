<script lang="ts">
  /** Cartel de meta comunitaria conseguida, en el mismo hueco que la alerta. */
  import type { GoalView } from '../../lib/overlay-types';
  import { splitGoalName } from '../../lib/mc-live-state';

  let { goal }: { goal: GoalView } = $props();

  let parts = $derived(splitGoalName(goal.name));
</script>

<div class="mc-celebration">
  <div class="mc-celebration__trophy">🏆</div>
  <div class="mc-celebration__kicker mc-mono">¡META COMUNITARIA CONSEGUIDA!</div>
  <h1 class="mc-celebration__title">{parts.reward || parts.title}</h1>
</div>
