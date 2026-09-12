<script setup lang="ts">
import { ref, watch } from 'vue';
import { isProjectNightEvent } from '@/lib/project-night-contact';
import type { ProjectNightRecurrence } from '@/lib/supabase/project-night-recurrence';
import { fetchJson } from '@/src/lib/api';

const props = defineProps<{ eventId: string; eventName: string }>();
const recurrence = ref<ProjectNightRecurrence | null>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const ready = ref(false);
const confirmSkip = ref(false);
let requestVersion = 0;

async function load() {
  const version = ++requestVersion;

  if (!isProjectNightEvent(props.eventName)) return;
  loading.value = true;
  ready.value = false;
  error.value = '';
  confirmSkip.value = false;
  try {
    const result = await fetchJson<{ recurrence: ProjectNightRecurrence | null }>(`/api/events/${encodeURIComponent(props.eventId)}/recurrence`);

    if (version !== requestVersion) return;
    recurrence.value = result.recurrence;
    ready.value = true;
  } catch (cause) {
    if (version === requestVersion) error.value = cause instanceof Error ? cause.message : 'Unable to load recurrence.';
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}

async function save(action: 'enable' | 'pause' | 'skip') {
  if (saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    const result = await fetchJson<{ recurrence: ProjectNightRecurrence }>(`/api/events/${encodeURIComponent(props.eventId)}/recurrence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });

    recurrence.value = result.recurrence;
    confirmSkip.value = false;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to save recurrence.';
  } finally {
    saving.value = false;
  }
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('en-GH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Accra' }).format(new Date(`${value}T12:00:00Z`));
}

watch(() => [props.eventId, props.eventName], load, { immediate: true });
</script>

<template>
  <section v-if="isProjectNightEvent(eventName)" class="recurrence-panel rounded-lg border border-dc-line bg-white p-5 text-dc-ink" :aria-busy="loading || saving" aria-label="Project Night recurrence">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="font-mono text-xs font-bold tracking-widest">WEEKLY PROJECT NIGHT</h2>
      <span v-if="ready" class="font-mono text-xs font-bold text-dc-gray">{{ recurrence?.enabled ? 'ENABLED' : recurrence ? 'PAUSED' : 'OFF' }}</span>
    </div>
    <p class="mt-3 text-sm leading-6 text-dc-gray">Every Thursday, at the source event’s configured time. Publish one event each Monday at 9:00 am, Accra time. Slack follows once its website page is ready.</p>
    <p v-if="loading" class="mt-4 text-sm" role="status">Checking recurrence…</p>
    <template v-else-if="ready">
      <div v-if="recurrence" class="mt-4 border-t border-dc-line pt-4">
        <p class="text-sm text-dc-gray">{{ recurrence.enabled ? 'Next occurrence' : 'Saved next occurrence · recalculated when resumed' }}</p>
        <p class="mt-1 font-semibold">{{ dateLabel(recurrence.next_date) }}</p>
      </div>
      <p class="mt-3 text-sm leading-6 text-dc-gray">Reuse the last Project Night announcement image. Change the cover on the source event or a recurring occurrence to update future drafts. Other published occurrences keep their images.</p>
      <div class="mt-4 flex flex-wrap gap-3">
        <button type="button" class="min-h-11 rounded-md border border-dc-ink bg-dc-yellow px-4 py-2 font-mono text-xs font-bold disabled:opacity-50" :disabled="saving" @click="save(recurrence?.enabled ? 'pause' : 'enable')">
          {{ saving ? 'SAVING…' : recurrence?.enabled ? 'PAUSE RECURRENCE' : recurrence ? 'RESUME RECURRENCE' : 'ENABLE RECURRENCE' }}
        </button>
        <button v-if="recurrence?.enabled && !confirmSkip" type="button" class="min-h-11 rounded-md border border-dc-line px-4 py-2 font-mono text-xs font-bold disabled:opacity-50" :disabled="saving" @click="confirmSkip = true">SKIP NEXT WEEK</button>
      </div>
      <div v-if="confirmSkip && recurrence" class="mt-4 border-t border-dc-line pt-4">
        <p class="text-sm">Skip {{ dateLabel(recurrence.next_date) }}? Its draft will not be automatically published or announced.</p>
        <div class="mt-2 flex gap-3">
          <button type="button" class="min-h-11 px-3 font-semibold text-dc-pink disabled:opacity-50" :disabled="saving" @click="save('skip')">Yes, skip this week</button>
          <button type="button" class="min-h-11 px-3 font-semibold" :disabled="saving" @click="confirmSkip = false">Keep it</button>
        </div>
      </div>
    </template>
    <p v-if="error" role="alert" class="mt-3 text-sm text-dc-pink">{{ error }}</p>
    <button v-if="!loading && !ready" type="button" class="mt-2 min-h-11 font-semibold underline" @click="load">Try again</button>
  </section>
</template>

<style scoped>
.recurrence-panel button {
  transition: transform 100ms cubic-bezier(0.4, 0, 0.2, 1);
}
.recurrence-panel button:active:not(:disabled) {
  transform: scale(0.97);
}
.recurrence-panel button:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 3px;
}
@media (prefers-reduced-motion: reduce) {
  .recurrence-panel button {
    transition: none;
  }
  .recurrence-panel button:active:not(:disabled) {
    transform: none;
  }
}
</style>
