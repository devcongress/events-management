<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { protectedFetch } from '@/src/lib/admin-session-signal';

const props = defineProps<{ canManage: boolean }>();

type Counter = { count: number; source: 'ticket_count'; baseline?: number; purchases?: number; version?: number };
const ownerPath = '/api/annual-conference/2026/attendance-counter';
const counter = ref<Counter | null>(null);
const draft = ref<string | number>('');
const loading = ref(true);
const saving = ref(false);
const editing = ref(false);
const inputElement = ref<HTMLInputElement | null>(null);
const editButton = ref<HTMLButtonElement | null>(null);
const conflict = ref(false);
const error = ref('');
const validBaseline = computed(() => {
  if (String(draft.value).trim() === '') return null;

  const value = Number(draft.value);

  return Number.isInteger(value) && value >= 0 && value <= 2147483647 ? value : null;
});
const canSave = computed(() => props.canManage && !loading.value && !saving.value && !conflict.value
  && counter.value?.version != null && validBaseline.value !== null
  && validBaseline.value !== counter.value.baseline);

async function refresh(restoreFocus = false) {
  loading.value = true;
  error.value = '';

  try {
    const response = props.canManage
      ? await protectedFetch(ownerPath, { cache: 'no-store' })
      : await fetch('/api/public/annual-conference/2026/attendance-counter', { cache: 'no-store' });

    if (!response.ok) throw new Error();

    const result = await response.json() as Counter;

    counter.value = result;
    draft.value = String(result.baseline ?? '');
    editing.value = false;
    conflict.value = false;
  } catch {
    error.value = 'Unable to load the ticket counter.';
  } finally {
    loading.value = false;
  }

  if (restoreFocus && counter.value && !conflict.value) {
    await nextTick();
    editButton.value?.focus();
  }
}

async function save() {
  if (!canSave.value || !counter.value || validBaseline.value === null) return;

  const baseline = validBaseline.value;

  saving.value = true;
  error.value = '';

  try {
    const response = await protectedFetch(ownerPath, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseline, version: counter.value.version }),
    });

    if (response.status === 409) {
      conflict.value = true;
      error.value = 'The starting count changed elsewhere. Reload the latest count before saving.';

      return;
    }

    if (!response.ok) throw new Error();

    const result = await response.json() as Counter;

    counter.value = result;
    draft.value = String(result.baseline ?? '');
    editing.value = false;
    await nextTick();
    editButton.value?.focus();
  } catch {
    error.value = 'Unable to save the starting count. Please try again.';
  } finally {
    saving.value = false;
  }
}

async function startEdit() {
  editing.value = true;
  await nextTick();
  inputElement.value?.focus();
}

async function cancelEdit() {
  draft.value = String(counter.value?.baseline ?? '');
  editing.value = false;

  if (!conflict.value) error.value = '';

  await nextTick();
  editButton.value?.focus();
}

onMounted(() => refresh());
</script>

<template>
  <section class="attendance-counter" aria-labelledby="attendance-counter-title">
    <div class="attendance-row">
      <div class="attendance-summary">
        <h2 id="attendance-counter-title">Public ticket counter</h2>
        <p v-if="loading">Loading ticket counter…</p>
        <template v-else-if="counter">
          <p class="attendance-headline">{{ counter.count.toLocaleString() }} displayed</p>
          <p v-if="canManage">{{ counter.baseline }} starting + {{ counter.purchases }} net purchased</p>
          <p v-else>Starting count + net purchased tickets</p>
        </template>
      </div>
      <template v-if="canManage && counter && !loading">
        <button v-if="!editing" ref="editButton" type="button" class="attendance-save motion-press" @click="startEdit">Edit</button>
        <form v-else class="attendance-form" @submit.prevent="save">
          <label for="attendance-starting-count">Starting count</label>
          <input id="attendance-starting-count" ref="inputElement" v-model="draft" class="editorial-input" type="number" min="0" max="2147483647" step="1" required :disabled="saving" aria-describedby="attendance-starting-help">
          <span id="attendance-starting-help" class="sr-only">Net purchased tickets are added automatically.</span>
          <button type="submit" class="attendance-save motion-press" :disabled="!canSave">{{ saving ? 'Saving…' : 'Save' }}</button>
          <button type="button" class="attendance-save motion-press" :disabled="saving" @click="cancelEdit">Cancel</button>
        </form>
      </template>
    </div>
    <p v-if="error" class="attendance-error" role="alert">
      {{ error }}
      <button v-if="conflict || !counter" type="button" class="attendance-save motion-press" :disabled="loading || saving" @click="refresh(conflict)">{{ conflict ? 'Reload latest count' : 'Retry' }}</button>
    </p>
  </section>
</template>

<style scoped>
.attendance-counter {
  border: 1px solid #e0ddd4;
  border-radius: 8px;
  background: white;
  padding: 12px 16px;
}

.attendance-row,
.attendance-summary,
.attendance-form {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 16px;
}

.attendance-row {
  justify-content: space-between;
}

.attendance-summary {
  flex: 1 1 0;
  min-width: 0;
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

.attendance-form {
  gap: 8px;
  flex-wrap: nowrap;
}

.attendance-form label {
  font-size: 0.875rem;
  font-weight: 600;
}

.attendance-counter .attendance-form input.editorial-input {
  width: 100px;
  max-width: 100%;
  min-height: 40px;
  padding: 6px 8px;
}

.attendance-save {
  min-height: 40px;
  border: 1px solid #e0ddd4;
  border-radius: 6px;
  background: white;
  padding: 6px 12px;
  font-weight: 600;
  scroll-margin-bottom: 100px;
}

.attendance-save:disabled {
  opacity: 0.5;
}

.attendance-save:focus-visible {
  outline: 2px solid #e8117f;
  outline-offset: 2px;
}

.attendance-error {
  margin-top: 8px;
}

@media (hover: hover) and (pointer: fine) {
  .attendance-save:not(:disabled):hover {
    background: #f5f2e8;
  }
}

@media (max-width: 600px) {
  .attendance-counter {
    margin-bottom: 80px;
  }

  .attendance-summary {
    gap: 2px 12px;
  }

  .attendance-summary h2 {
    flex-basis: 100%;
  }

  .attendance-form {
    flex-wrap: wrap;
  }

  .attendance-counter .attendance-form input.editorial-input {
    font-size: 16px;
  }

  .attendance-save {
    min-height: 44px;
  }
}
</style>
