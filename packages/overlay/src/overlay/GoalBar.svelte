<script lang="ts">

  import type { GoalView } from '../lib/overlay-types';

  let { goal }: { goal: GoalView | undefined } = $props();
</script>

<div class="goal-widget" id="active-goal-widget">
  <div class="goal-label-row">
    <span class="goal-name">{goal?.name}</span>
    <span class="goal-counts">
      <strong>{goal?.currentValue}</strong> / {goal?.targetValue}
      <span class="goal-percent">({goal?.percent}%)</span>
    </span>
  </div>
  <div class="goal-track">
    <div
      class="goal-fill"
      style="width: {goal?.percent}%;"
    >
      <div class="goal-shimmer"></div>
    </div>
  </div>
</div>
