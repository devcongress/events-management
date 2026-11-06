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
    <h2 id="attendance-counter-title">Attendance counter</h2>
    <p v-if="loading">Loading attendance counter…</p>
    <template v-else-if="counter?.source">
      <div class="attendance-preview">
        <svg class="attendance-people" viewBox="0 0 68 48" aria-hidden="true" focusable="false">
          <circle cx="34" cy="24" r="24" fill="#FEFCE8" />
          <circle cx="19" cy="19" r="5" fill="#111111" />
          <path d="M11 34c0-5 3-8 8-8s8 3 8 8" fill="#111111" />
          <circle cx="49" cy="19" r="5" fill="#111111" />
          <path d="M41 34c0-5 3-8 8-8s8 3 8 8" fill="#111111" />
          <circle cx="34" cy="16" r="6" fill="#E8117F" />
          <path d="M24 35c0-6 4-10 10-10s10 4 10 10" fill="#E8117F" />
        </svg>
        <div>
          <p class="attendance-headline">{{ headline }}</p>
          <p v-if="counter.source === 'estimate'">Estimated turnout</p>
          <p v-else>Valid admissions and confirmed speakers</p>
        </div>
      </div>
    </template>
    <p v-else-if="!error">The counter is hidden from the public.</p>
    <p v-if="error" role="alert">{{ error }} <button type="button" class="editorial-action motion-press" @click="refresh">Retry</button></p>
    <template v-if="canManage && !loading && !error">
      <div v-if="!pending" class="attendance-actions">
        <button v-if="!counter?.source" type="button" class="editorial-action motion-press" @click="pending = 'estimate'">Publish estimate</button>
        <button v-if="counter?.source !== 'actual'" type="button" class="editorial-action motion-press" @click="pending = 'actual'">{{ counter?.source ? 'Switch to actual' : 'Publish actual' }}</button>
      </div>
      <div v-else class="attendance-confirm">
        <p v-if="pending === 'estimate'">Publish the estimate starting at 20? It increases every 48 hours until the event date.</p>
        <p v-else>Publish the actual count? This switch is permanent and the number may decrease.</p>
        <button type="button" class="editorial-action motion-press" :disabled="busy" @click="confirmChange">{{ busy ? 'Saving…' : 'Confirm' }}</button>
        <button type="button" class="editorial-action motion-press" :disabled="busy" @click="pending = null">Cancel</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.attendance-counter {
  border: 1px solid #e0ddd4;
  border-radius: 8px;
  background: white;
  padding: 16px;
}

.attendance-counter h2 {
  font-weight: 600;
}

.attendance-preview {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.attendance-people {
  flex: none;
  width: 68px;
  height: 48px;
}

.attendance-headline {
  font-size: 1.25rem;
  font-weight: 600;
}

.attendance-actions,
.attendance-confirm {
  margin-top: 12px;
}

.attendance-actions button,
.attendance-confirm button {
  margin-right: 16px;
  min-height: 44px;
}
</style>
