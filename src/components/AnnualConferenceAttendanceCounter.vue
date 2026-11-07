<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { protectedFetch } from '@/src/lib/admin-session-signal';

const props = defineProps<{ canManage: boolean }>();
const publicPath = '/api/public/annual-conference/2026/attendance-counter';
const ownerPath = '/api/annual-conference/2026/attendance-counter';

type Counter = { count: number | null; source: 'estimate' | 'actual' | null };
const counter = ref<Counter | null>(null);
const version = ref(0);
const loading = ref(true);
const busy = ref(false);
const error = ref('');
const pending = ref<'estimate' | 'actual' | null>(null);
const headline = computed(() => counter.value?.count === 1 ? '1 person is attending' : `${counter.value?.count ?? 0} people are attending`);

async function refresh() {
  loading.value = true;
  error.value = '';

  try {
    const response = props.canManage
      ? await protectedFetch(ownerPath, { cache: 'no-store' })
      : await fetch(publicPath, { cache: 'no-store' });

    if (!response.ok) throw new Error();
    const result = await response.json() as Counter & { version?: number };

    counter.value = { count: result.count, source: result.source };
    if (props.canManage && result.version !== undefined) version.value = result.version;
  } catch {
    error.value = 'Unable to load the attendance counter.';
  } finally {
    loading.value = false;
  }
}

async function confirmChange() {
  if (!pending.value) return;
  busy.value = true;
  error.value = '';

  try {
    const response = await protectedFetch(ownerPath, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: pending.value, version: version.value, confirmed: true }),
    });
    const result = await response.json();

    if (!response.ok) throw new Error(result.error || 'Unable to change the counter.');
    pending.value = null;
    await refresh();
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Unable to change the counter.';
  } finally {
    busy.value = false;
  }
}

onMounted(refresh);
</script>

<template>
  <section v-if="canManage || counter?.source" class="attendance-counter" aria-labelledby="attendance-counter-title">
    <div class="attendance-status">
      <h2 id="attendance-counter-title">Attendance counter</h2>
      <p v-if="loading">Loading attendance counter…</p>
      <template v-else-if="counter?.source">
        <p class="attendance-headline">{{ headline }}</p>
        <p v-if="counter.source === 'estimate'">Estimated turnout</p>
        <p v-else>Valid admissions and confirmed speakers</p>
      </template>
      <p v-else-if="!error">Hidden from the public</p>
      <p v-if="error" role="alert">{{ error }} <button type="button" class="editorial-action motion-press" @click="refresh">Retry</button></p>
    </div>
    <template v-if="canManage && !loading && !error">
      <div v-if="!pending" class="attendance-actions">
        <button v-if="!counter?.source" type="button" class="attendance-button motion-press" @click="pending = 'estimate'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19h16M6 16v-4m6 4V8m6 8V5" /></svg>
          Publish estimate
        </button>
        <button v-if="counter?.source !== 'actual'" type="button" class="attendance-button motion-press" @click="pending = 'actual'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3.5 19v-1.5a5.5 5.5 0 0 1 11 0V19M16 10a3 3 0 0 0 0-5.8M17 13a4.5 4.5 0 0 1 3.5 4.4V19" /></svg>
          {{ counter?.source ? 'Switch to actual' : 'Publish actual' }}
        </button>
      </div>
      <div v-else class="attendance-confirm">
        <p v-if="pending === 'estimate'">Publish the estimate starting at 20? It increases every 48 hours until the event date.</p>
        <p v-else>Publish the actual count? This switch is permanent and the number may decrease.</p>
        <div class="attendance-actions">
          <button type="button" class="attendance-button motion-press" :disabled="busy" @click="confirmChange">{{ busy ? 'Saving…' : 'Confirm' }}</button>
          <button type="button" class="attendance-button motion-press" :disabled="busy" @click="pending = null">Cancel</button>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.attendance-counter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px 24px;
  border: 1px solid #e0ddd4;
  border-radius: 8px;
  background: white;
  padding: 16px 20px;
}

.attendance-status {
  min-width: 0;
}

.attendance-status h2 {
  font-weight: 600;
}

.attendance-status p {
  color: #555;
  font-size: 0.875rem;
}

.attendance-status .attendance-headline {
  color: #111;
  font-size: 1rem;
  font-weight: 600;
}

.attendance-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.attendance-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  border: 0;
  border-radius: 6px;
  background: #f2f2ef;
  padding: 8px 12px;
  color: #252b30;
  font-weight: 600;
}

.attendance-button svg {
  width: 18px;
  height: 18px;
  flex: none;
  color: #627481;
}

.attendance-button:hover:not(:disabled) {
  background: #e9eae7;
}

.attendance-button:focus-visible {
  outline: 2px solid #e8117f;
  outline-offset: 2px;
}

.attendance-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.attendance-confirm {
  display: grid;
  gap: 8px;
  max-width: 440px;
}

@media (max-width: 600px) {
  .attendance-counter {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
