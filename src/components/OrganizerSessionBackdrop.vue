<script setup lang="ts">
import type { FrozenGeometry } from '../lib/organizer-session-backdrop';

defineProps<{ geometry: FrozenGeometry[]; title: string; logo: string }>();
</script>

<template>
  <div class="session-frozen-shell" aria-hidden="true" inert>
    <template v-if="geometry.length">
      <div
        v-for="(item, index) in geometry"
        :key="index"
        class="session-frozen-geometry"
        :class="`session-frozen-geometry--${item.kind}`"
        :style="{ left: `${item.left}%`, top: `${item.top}%`, width: `${item.width}%`, height: `${item.height}%` }"
      >
        <img v-if="item.kind === 'brand'" :src="logo" alt="" />
        <span v-else-if="item.kind === 'heading'">{{ title }}</span>
        <span v-else-if="item.kind === 'navigation'">Events &nbsp;&nbsp; Reports &nbsp;&nbsp; Annual Conference &nbsp;&nbsp; People &amp; Access</span>
      </div>
    </template>
    <template v-else>
      <div class="session-frozen-nav">
        <img :src="logo" alt="" />
        <span>Events</span><span>Reports</span><span>Annual Conference</span><span>People &amp; Access</span>
      </div>
      <div class="session-frozen-content">
        <p>{{ title === 'Volunteers' ? 'Annual Conference' : 'Organizer console' }}</p>
        <h1>{{ title }}</h1>
        <div class="session-frozen-tabs">
          <template v-if="title === 'Volunteers'"><span>Directory</span><span>Reviews</span><span>Campaign</span></template>
          <span v-else>{{ title }}</span>
        </div>
        <div class="session-frozen-panel">
          <div v-for="row in 5" :key="row" class="session-frozen-row"><i /><i /><i /></div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.session-frozen-shell {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: var(--surface-canvas);
  filter: blur(5px);
  pointer-events: none;
}

.session-frozen-geometry {
  position: absolute;
  overflow: hidden;
  border-radius: 6px;
  background: var(--border-subtle);
}

.session-frozen-geometry--brand,
.session-frozen-geometry--navigation,
.session-frozen-geometry--heading {
  background: transparent;
}

.session-frozen-geometry--brand img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.session-frozen-geometry--navigation {
  color: hsl(var(--foreground));
  font-weight: var(--font-weight-label);
  white-space: nowrap;
}

.session-frozen-geometry--heading {
  color: hsl(var(--foreground));
  font-family: var(--font-display), sans-serif;
  font-size: clamp(1rem, 2vw, 2rem);
  font-weight: var(--font-weight-heading);
}

.session-frozen-geometry--panel,
.session-frozen-geometry--row {
  border: 1px solid var(--border-subtle);
  background: var(--surface-paper);
}

.session-frozen-nav {
  display: flex;
  align-items: center;
  gap: 2rem;
  height: 69px;
  padding: 0 5%;
  border-bottom: 1px solid var(--border-subtle);
}

.session-frozen-nav img {
  width: 110px;
  object-fit: contain;
}
.session-frozen-content {
  max-width: 1200px;
  margin: 3rem auto;
  padding: 0 2rem;
}
.session-frozen-content h1 {
  font-size: 2.5rem;
  font-weight: 700;
}
.session-frozen-tabs {
  display: flex;
  gap: 2rem;
  margin-top: 2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #d6d2c8;
}
.session-frozen-panel {
  margin-top: 2rem;
  padding: 1rem;
  border: 1px solid var(--border-subtle);
  background: white;
}
.session-frozen-row {
  display: flex;
  gap: 8%;
  padding: 1.25rem;
  border-bottom: 1px solid #eee;
}
.session-frozen-row i {
  display: block;
  width: 20%;
  height: 12px;
  border-radius: 6px;
  background: #ddd9d2;
}

</style>
