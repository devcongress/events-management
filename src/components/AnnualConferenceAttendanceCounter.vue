<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { protectedFetch } from '@/src/lib/admin-session-signal';

const props = defineProps<{ canManage: boolean }>();

type Counter = { count: number; source: 'ticket_count'; baseline?: number; purchases?: number };
const counter = ref<Counter | null>(null);
const loading = ref(true);
const error = ref('');

async function refresh() {
  loading.value = true;
  error.value = '';

  try {
    const response = props.canManage
      ? await protectedFetch('/api/annual-conference/2026/attendance-counter', { cache: 'no-store' })
      : await fetch('/api/public/annual-conference/2026/attendance-counter', { cache: 'no-store' });

    if (!response.ok) throw new Error();
    counter.value = await response.json() as Counter;
  } catch {
    counter.value = null;
    error.value = 'Unable to load the ticket counter.';
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
</script>

<template>
  <section class="attendance-counter" aria-labelledby="attendance-counter-title">
    <h2 id="attendance-counter-title">Public ticket counter</h2>
    <p v-if="loading">Loading ticket counter…</p>
    <template v-else-if="counter">
      <p class="attendance-headline">{{ counter.count.toLocaleString() }} displayed</p>
      <p v-if="canManage">{{ counter.baseline }} starting count + {{ counter.purchases }} net purchased tickets</p>
      <p v-else>Starting count plus net purchased tickets</p>
    </template>
    <p v-if="error" role="alert">{{ error }} <button type="button" class="editorial-action motion-press" @click="refresh">Retry</button></p>
  </section>
</template>

<style scoped>
.attendance-counter {
  border: 1px solid #e0ddd4;
  border-radius: 8px;
  background: white;
  padding: 16px 20px;
}

.attendance-counter h2 {
  font-weight: 600;
}

.attendance-counter p {
  color: #555;
  font-size: 0.875rem;
}

.attendance-counter .attendance-headline {
  color: #111;
  font-size: 1rem;
  font-weight: 600;
}
</style>
