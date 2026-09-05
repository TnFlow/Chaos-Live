<script lang="ts">
  /**
   * HUD pixel completo (diseño "Stack HUD", 1080x1920).
   *
   * Todo el peso visual vive en la mitad superior y el resto queda despejado a
   * propósito: en TikTok el centro lo ocupa el gameplay y el pie lo tapan los
   * comentarios de la app, así que cualquier cosa que se pinte ahí no se ve.
   *
   * El HUD se dibuja siempre a 1080x1920 reales y se escala con `--mc-fit`
   * hasta caber en el lienzo. En OBS, con la fuente a 1080x1920, la escala es
   * exactamente 1 y no hay reescalado; fuera de OBS es lo que permite revisar
   * el diseño en una ventana normal sin que se salga.
   */
  import type { ActionView, AlertView, GoalView, RewardView } from '../../lib/overlay-types';
  import type { LeaderboardEntry } from '../../lib/types';
  import type { QueuedEffect } from '../../lib/mc-live-state';
  import type { OverlaySettings } from '../../types/overlay-config';
  import McStatusBar from './McStatusBar.svelte';
  import McGoalPanel from './McGoalPanel.svelte';
  import McSecondaryGoal from './McSecondaryGoal.svelte';
  import McRewardsBoard from './McRewardsBoard.svelte';
  import McLeaderboard from './McLeaderboard.svelte';
  import McQueue from './McQueue.svelte';
  import McAlert from './McAlert.svelte';
  import McCelebration from './McCelebration.svelte';
  import McTicker from './McTicker.svelte';

  const HUD_WIDTH = 1080;
  const HUD_HEIGHT = 1920;

  let {
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
    showGuides = false,
  }: {
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
    showGuides?: boolean;
  } = $props();

  let stageWidth = $state(HUD_WIDTH);
  let stageHeight = $state(HUD_HEIGHT);

  let fit = $derived(
    Math.min(stageWidth / HUD_WIDTH, stageHeight / HUD_HEIGHT) * (settings.scale || 1)
  );

  let showRewards = $derived(settings.rewardsMode === 'both' || settings.rewardsMode === 'menu');
  let showTicker = $derived(settings.rewardsMode === 'both' || settings.rewardsMode === 'ticker');
  let showSideColumn = $derived(settings.leaderboardPosition !== 'hidden' || queue.length > 0);
</script>

<svelte:window bind:innerWidth={stageWidth} bind:innerHeight={stageHeight} />

<div class="mc-stage">
  <div
    class="mc-hud {showGuides ? 'mc-hud--guides' : ''}"
    style="--mc-fit: {fit}"
    id="minecraft-hud"
  >
    <div class="mc-hud__inner">
      <McStatusBar {isConnected} {eventCount} {handle} />

      {#if settings.goalPosition !== 'hidden' && goals[0]}
        <McGoalPanel goal={goals[0]} />
      {/if}

      {#if settings.goalPosition !== 'hidden' && goals[1]}
        <McSecondaryGoal goal={goals[1]} />
      {/if}

      {#if showRewards || showSideColumn}
        <div class="mc-columns">
          {#if showRewards}
            <div class="mc-columns__main">
              <McRewardsBoard {rewards} {cooldowns} />
            </div>
          {/if}
          {#if showSideColumn}
            <div class="mc-columns__side">
              {#if settings.leaderboardPosition !== 'hidden'}
                <McLeaderboard {leaderboard} />
              {/if}
              <McQueue {queue} />
            </div>
          {/if}
        </div>
      {/if}

      <div class="mc-center">
        {#if celebratingGoal}
          <McCelebration goal={celebratingGoal} />
        {:else if activeAlert}
          <McAlert alert={activeAlert} />
        {/if}
        {#if showGuides}
          <div class="mc-guide mc-guide--gameplay">ZONA LIBRE · GAMEPLAY</div>
        {/if}
      </div>

      {#if showTicker}
        <McTicker {recentActions} {rewards} speedSeconds={settings.marqueeSpeedSeconds} />
      {/if}

      {#if showGuides}
        <div class="mc-guide mc-guide--comments">ZONA LIBRE · COMENTARIOS TIKTOK</div>
      {/if}
    </div>
  </div>
</div>
