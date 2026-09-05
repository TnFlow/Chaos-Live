<script lang="ts">
  /**
   * Un panel suelto del HUD, servido como su propia pagina.
   *
   * TikTok LIVE Studio no tiene Browser Source: tiene fuentes `Link`, y el
   * patron del ecosistema es una URL por widget para poder colocar cada pieza
   * por separado en la escena vertical. Este componente no dibuja nada propio:
   * elige uno de los paneles que ya existen y lo saca a su tamano real, sin el
   * lienzo de 1080x1920 alrededor.
   *
   * Los paneles ya traen fondo opaco, asi que un widget se ve bien aunque TLS
   * no respete la transparencia de la pagina.
   */
  import type { ActionView, AlertView, GoalView, RewardView } from '../../lib/overlay-types';
  import type { LeaderboardEntry } from '../../lib/types';
  import type { QueuedEffect } from '../../lib/mc-live-state';
  import type { OverlaySettings } from '../../types/overlay-config';
  import { WIDGET_COLUMN, type WidgetName } from './widgets';
  import McStatusBar from './McStatusBar.svelte';
  import McGoalPanel from './McGoalPanel.svelte';
  import McSecondaryGoal from './McSecondaryGoal.svelte';
  import McRewardsBoard from './McRewardsBoard.svelte';
  import McLeaderboard from './McLeaderboard.svelte';
  import McQueue from './McQueue.svelte';
  import McAlert from './McAlert.svelte';
  import McCelebration from './McCelebration.svelte';
  import McTicker from './McTicker.svelte';

  let {
    name,
    settings,
    isConnected,
    eventCount,
    handle,
    goals,
    rewards,
    cooldowns,
    queue,
    leaderboard,
    recentActions,
    activeAlert,
    celebratingGoal,
  }: {
    name: WidgetName;
    settings: OverlaySettings;
    isConnected: boolean;
    eventCount: number;
    handle: string;
    goals: GoalView[];
    rewards: RewardView[];
    cooldowns: Record<string, number>;
    queue: QueuedEffect[];
    leaderboard: LeaderboardEntry[];
    recentActions: ActionView[];
    activeAlert: AlertView | null;
    celebratingGoal: GoalView | null;
  } = $props();

  let column = $derived(WIDGET_COLUMN[name] ?? 'full');
</script>

<div class="mc-widget-stage">
  <div
    class="mc-widget mc-widget--{column}"
    style="--mc-widget-scale: {settings.scale || 1}"
    id="chaos-widget-{name}"
  >
    {#if name === 'status'}
      <McStatusBar {isConnected} {eventCount} {handle} />
    {:else if name === 'goal'}
      {#if goals[0]}
        <McGoalPanel goal={goals[0]} />
      {/if}
    {:else if name === 'goal2'}
      {#if goals[1]}
        <McSecondaryGoal goal={goals[1]} />
      {/if}
    {:else if name === 'rewards'}
      <McRewardsBoard {rewards} {cooldowns} />
    {:else if name === 'leaderboard'}
      <McLeaderboard {leaderboard} />
    {:else if name === 'queue'}
      <McQueue {queue} />
    {:else if name === 'alert'}
      <!-- La capa de alertas esta vacia casi todo el rato, a proposito: solo
           aparece cuando hay algo que celebrar. -->
      {#if celebratingGoal}
        <McCelebration goal={celebratingGoal} />
      {:else if activeAlert}
        <McAlert alert={activeAlert} />
      {/if}
    {:else if name === 'ticker'}
      <McTicker {recentActions} {rewards} speedSeconds={settings.marqueeSpeedSeconds} />
    {/if}
  </div>
</div>
