<script lang="ts">

  import type { GoalView } from '../lib/overlay-types';

  let { goal }: { goal: GoalView } = $props();
</script>

<div class="celebration-overlay" id="goal-celebration-banner">
  <div class="celebration-card glass-panel">
    <div class="celebration-rays"></div>
    <div class="celebration-trophy">🏆</div>
    <h2 class="celebration-subtitle">¡META COMUNITARIA CONSEGUIDA!</h2>
    <h1 class="celebration-title">{goal.name}</h1>
    <div class="celebration-pill">
      <span>🎮 ¡Invocando la recompensa en Minecraft!</span>
    </div>
  </div>
</div>
