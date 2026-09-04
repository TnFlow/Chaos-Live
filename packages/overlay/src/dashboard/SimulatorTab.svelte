<script lang="ts">

  let {
    injectSynthetic,
  }: {
    injectSynthetic: (event: Record<string, unknown>) => void;
  } = $props();
</script>

  <div class="sim-view glass-card">
    <h2>🧪 Simulador</h2>
    <p class="panel-desc">Prueba tus reglas y metas sin necesidad de estar en directo. Los eventos entran en el motor igual que los reales.</p>

    <div class="sim-grid">
      <div class="sim-card">
        <h4>Atajos rápidos</h4>
        <div class="sim-grid-buttons">
          <button
            class="sim-action-btn"
            onclick={() =>
              injectSynthetic({
                platform: 'tiktok',
                type: 'gift',
                value: 1,
                user: { id: 'u-1', displayName: 'ViewerOne' },
                metadata: { giftName: 'Rose', diamondCount: 1, repeatCount: 1 },
              })}
          >
            🌹 Enviar 1 Rosa
          </button>

          <button
            class="sim-action-btn"
            onclick={() =>
              injectSynthetic({
                platform: 'tiktok',
                type: 'gift',
                value: 30,
                user: { id: 'u-2', displayName: 'IceCreamFan' },
                metadata: { giftName: 'Ice Cream Cone', diamondCount: 30, repeatCount: 1 },
              })}
          >
            🍦 Enviar Helado
          </button>

          <button
            class="sim-action-btn"
            onclick={() =>
              injectSynthetic({
                platform: 'tiktok',
                type: 'gift',
                value: 500,
                user: { id: 'u-3', displayName: 'MoneyMaker' },
                metadata: { giftName: 'Money Gun', diamondCount: 500, repeatCount: 1 },
              })}
          >
            💸 Enviar Money Gun
          </button>

          <button
            class="sim-action-btn"
            onclick={() =>
              injectSynthetic({
                platform: 'tiktok',
                type: 'gift',
                value: 1000,
                user: { id: 'u-4', displayName: 'KingDonator' },
                metadata: { giftName: 'Lion', diamondCount: 1000, repeatCount: 1 },
              })}
          >
            🦁 Enviar León
          </button>

          <button
            class="sim-action-btn"
            onclick={() =>
              injectSynthetic({
                platform: 'tiktok',
                type: 'like',
                value: 150,
                user: { id: 'u-5', displayName: 'TapperHero' },
                metadata: { likeCount: 150 },
              })}
          >
            ❤️ Enviar 150 Me gusta
          </button>

          <button
            class="sim-action-btn"
            onclick={() =>
              injectSynthetic({
                platform: 'tiktok',
                type: 'follow',
                value: 1,
                user: { id: 'u-6', displayName: 'NewFollower123' },
                metadata: {},
              })}
          >
            ⭐ Nuevo seguidor
          </button>
        </div>
      </div>
    </div>
  </div>
