<template>
  <article class="identity-card" :class="`identity-card--${role}`" aria-label="DevCon26 social card preview">
    <div class="identity-card__rays" aria-hidden="true"></div>
    <p class="identity-card__kicker">DEVCON26 · ACCRA</p>
    <div class="identity-card__content">
      <p class="identity-card__eyebrow">{{ role === 'speaker' ? 'I’M SPEAKING AT' : 'I’M ATTENDING' }}</p>
      <h2>DevCon26</h2>
      <div class="identity-card__portrait" :class="{ 'identity-card__portrait--empty': !photoUrl }">
        <img v-if="photoUrl" :src="photoUrl" alt="" />
        <span v-else aria-hidden="true">DC</span>
      </div>
      <p class="identity-card__name">{{ displayName || 'Your name' }}</p>
    </div>
    <footer><span>19 DEC 2026</span><span>ACCRA, GHANA</span></footer>
  </article>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  role: 'attendee' | 'speaker';
  displayName?: string;
  photoUrl?: string | null;
}>(), { displayName: '', photoUrl: null });
</script>

<style scoped>
.identity-card {
  position: relative;
  display: grid;
  aspect-ratio: 4 / 5;
  min-height: 22rem;
  overflow: hidden;
  border: 3px solid #111;
  background: #f7e83b;
  box-shadow: 10px 10px 0 #111;
  color: #111;
  isolation: isolate;
}

.identity-card--speaker { background: #ff4c9a; }
.identity-card__rays { position: absolute; inset: -35%; z-index: -1; background: repeating-conic-gradient(from 20deg, rgb(255 255 255 / 24%) 0deg 8deg, transparent 8deg 18deg); transform: rotate(-14deg); }
.identity-card__kicker, .identity-card__eyebrow, footer { font-family: var(--font-mono), monospace; font-size: 0.67rem; font-weight: 700; letter-spacing: 0.08em; }
.identity-card__kicker { margin: 1.15rem 1.15rem 0; }
.identity-card__content { display: grid; place-items: center; align-content: center; padding: 1rem; text-align: center; }
.identity-card__eyebrow { margin: 0; }
h2 { margin: 0.15rem 0 0.65rem; font-size: clamp(2.6rem, 12vw, 4.7rem); line-height: 0.8; letter-spacing: -0.09em; }
.identity-card__portrait { width: 55%; aspect-ratio: 1; overflow: hidden; border: 3px solid #111; border-radius: 50%; background: #fff; box-shadow: 5px 5px 0 #111; }
.identity-card__portrait img { width: 100%; height: 100%; object-fit: cover; }
.identity-card__portrait--empty { display: grid; place-items: center; font-size: 2rem; font-weight: 800; }
.identity-card__name { max-width: 92%; margin: 1rem 0 0; font-size: clamp(1.45rem, 6vw, 2.35rem); font-weight: 800; line-height: 0.95; letter-spacing: -0.055em; overflow-wrap: anywhere; }
footer { display: flex; justify-content: space-between; gap: 0.5rem; margin: 0 1.15rem 1.15rem; }
</style>
