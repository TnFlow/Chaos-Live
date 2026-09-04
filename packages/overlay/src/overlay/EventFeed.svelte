<script lang="ts">

  import type { FeedItem } from '../lib/overlay-types';

  let {
    events,
    position,
    formatTime,
  }: {
    events: FeedItem[];
    position: string;
    formatTime: (timestamp: number) => string;
  } = $props();
</script>

<aside class="event-feed-container feed-pos-{position}" id="overlay-event-feed">
  <div class="feed-header">
    <span class="feed-title">INTERACCIONES RECIENTES</span>
  </div>
  <div class="feed-items">
    {#each events as item (item.id)}
      <div
        class="event-card glass-panel"
        style="--card-accent: {item.accentColor}"
        id="event-card-{item.id}"
      >
        <div class="event-icon-badge">{item.icon}</div>
        <div class="event-details">
          <div class="event-top-row">
            <span class="event-username">{item.title}</span>
            <span class="event-timestamp">{formatTime(item.timestamp)}</span>
          </div>
          <div class="event-subtitle">{item.subtitle}</div>
        </div>
      </div>
    {/each}
  </div>
</aside>
