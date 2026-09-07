<script lang="ts">
  /**
   * Un panel suelto del overlay de cristal, servido como su propia pagina.
   *
   * Es el equivalente de `McWidget` para los temas que no son `minecraft`: el
   * mismo contrato de `?widget=`, con los componentes de cristal que ya
   * existian. No dibuja nada propio ni inventa paneles que el diseno no tenga.
   *
   * A diferencia del HUD pixel, estos paneles se apoyan en la rejilla de
   * `.overlay-root` para colocarse. Sueltos necesitan un ancho explicito, que
   * sale del mismo diseno (la columna del feed mide 340px, la lateral 320) y
   * vive en `lib/widgets.ts` junto al resto de medidas.
   */
  import type { ActionView, AlertView, FeedItem, GoalView, RewardView } from '../lib/overlay-types';
  import type { LeaderboardEntry } from '../lib/types';
  import type { OverlaySettings } from '../types/overlay-config';
  import type { WidgetName } from '../lib/widgets';
  import { GLASS_WIDGET_SIZE } from '../lib/widgets';
  import StatusPill from './StatusPill.svelte';
  import GoalBar from './GoalBar.svelte';
  import EventFeed from './EventFeed.svelte';
  import AlertBanner from './AlertBanner.svelte';
  import GoalCelebration from './GoalCelebration.svelte';
  import Leaderboard from './Leaderboard.svelte';
  import RewardsBoard from './RewardsBoard.svelte';
  import MarqueeTicker from './MarqueeTicker.svelte';

  let {
    name,
    settings,
    isConnected,
    eventCount,
    handle,
    goals,
    rewards,
    leaderboard,
    recentActions,
    events,
    activeAlert,
    celebratingGoal,
    formatTime,
  }: {
    name: WidgetName;
    settings: OverlaySettings;
    isConnected: boolean;
    eventCount: number;
    handle: string;
    goals: GoalView[];
    rewards: RewardView[];
    leaderboard: LeaderboardEntry[];
    recentActions: ActionView[];
    events: FeedItem[];
    activeAlert: AlertView | null;
    celebratingGoal: GoalView | null;
    formatTime: (timestamp: number) => string;
  } = $props();

  let width = $derived(GLASS_WIDGET_SIZE[name]?.width ?? 340);
</script>

<div class="widget-stage">
  <div
    class="glass-widget"
    style="width: {width}px; --widget-scale: {settings.scale || 1}"
    id="chaos-widget-{name}"
  >
    {#if name === 'status'}
      <StatusPill {isConnected} {eventCount} {handle} />
    {:else if name === 'goal'}
      <!-- La barra de meta se disena para ir dentro de la cabecera, que es la
           que le pone el panel de cristal y el margen. Suelta se quedaba sin
           fondo y con el texto cortado por arriba, asi que se le pone aqui. -->
      {#if goals[0]}
        <div class="glass-panel widget-panel">
          <GoalBar goal={goals[0]} />
        </div>
      {/if}
    {:else if name === 'goal2'}
      {#if goals[1]}
        <div class="glass-panel widget-panel">
          <GoalBar goal={goals[1]} />
        </div>
      {/if}
    {:else if name === 'rewards'}
      <RewardsBoard {rewards} />
    {:else if name === 'leaderboard'}
      <!-- Sin `secondaryGoal`: la segunda meta tiene su propia capa (`goal2`), y
           repetirla aqui la duplicaria en pantalla. -->
      <Leaderboard {leaderboard} />
    {:else if name === 'alert'}
      <!-- Casi siempre vacia, a proposito: solo aparece cuando hay algo que
           celebrar. -->
      {#if celebratingGoal}
        <GoalCelebration goal={celebratingGoal} />
      {:else if activeAlert}
        <AlertBanner alert={activeAlert} />
      {/if}
    {:else if name === 'ticker'}
      <MarqueeTicker
        {rewards}
        {recentActions}
        showMarquee={settings.rewardsMode === 'both' || settings.rewardsMode === 'ticker'}
      />
    {:else if name === 'feed'}
      <EventFeed {events} position="left" {formatTime} />
    {/if}
  </div>
</div>
