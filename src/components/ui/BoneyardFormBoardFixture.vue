<script setup lang="ts">
defineProps<{ count: number }>();
</script>

<template>
  <section class="loading-audience-grid" :style="{ '--card-count': count }">
    <article v-for="card in count" :key="card" class="loading-audience-card">
      <div class="loading-card-heading"><h2>Get involved</h2><p>Community participation form</p></div>
      <div class="loading-code-frame" />
      <span class="loading-card-url">go.devcongress.org/form</span>
    </article>
  </section>
</template>

<style scoped>
.loading-audience-grid {
  display: grid;
  grid-template-columns: repeat(var(--card-count), minmax(0, 1fr));
  gap: clamp(20px, 1.88vw, 36px);
}

.loading-audience-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding-top: 15px;
  border-top: 1px solid #d2cfc5;
}

.loading-card-heading {
  min-height: 60px;
  text-align: center;
}

h2 {
  margin: 0;
  font-size: clamp(22px, 2.1vw, 40px);
  font-weight: 600;
  letter-spacing: -.03em;
  line-height: 1.2;
}

.loading-card-heading p {
  margin: 6px 0 0;
  font-size: clamp(13px, 1.17vw, 22px);
}

.loading-code-frame {
  width: min(100%, 28.3vh, 400px);
  aspect-ratio: 1;
  margin: 12px auto 8px;
  background: #d2cfc5;
}

.loading-card-url {
  overflow-wrap: anywhere;
  text-align: center;
  font: 600 clamp(13px, 1.05vw, 20px) var(--font-sans), sans-serif;
  font-style: italic;
}

@media (max-height: 650px) {
  .loading-code-frame {
    width: min(100%, 26vh);
  }
}
</style>
