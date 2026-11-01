<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { useRoute } from 'vue-router';
import AnnualConferenceNav from '@/src/components/AnnualConferenceNav.vue';
import AppDropdown from '@/src/components/AppDropdown.vue';
import { notify } from '@/src/lib/notify';
import { programmeSaveSchema, type ProgrammeRow, type ProgrammeSnapshot } from '@/lib/annual-conference-programme';

const options = [
  { value: 'talk', label: 'Talk' }, { value: 'product_demo', label: 'Product demo' },
  { value: 'system_design', label: 'System design' }, { value: 'workshop', label: 'Workshop' },
  { value: 'panel', label: 'Panel' }, { value: 'open_discussion', label: 'Open discussion' },
  { value: 'networking', label: 'Networking' }, { value: 'break', label: 'Break' },
];

type State = { snapshot: ProgrammeSnapshot | null; draft: ProgrammeRow[]; editing: boolean; loading: boolean; saving: boolean; error: string; conflict: boolean };
const states = reactive(new Map<string, State>());
const route = useRoute();
const year = computed(() => String(route.params.year));
const state = computed(() => states.get(year.value));
const copy = (rows: ProgrammeRow[]) => rows.map((row) => ({ ...row }));

async function load(target: string, replaceDraft = false) {
  const current = states.get(target);

  if (!current) return;
  current.loading = true;
  current.error = '';
  try {
    const response = await fetch(`/api/annual-conference/${target}/programme`, { credentials: 'include' });
    const result = await response.json();

    if (!response.ok) throw new Error(result.error ?? 'Unable to load programme.');
    current.snapshot = result as ProgrammeSnapshot;
    if (replaceDraft || !current.editing) current.draft = copy(current.snapshot.rows);
    if (replaceDraft) current.conflict = false;
  } catch (error) {
    current.error = error instanceof Error ? error.message : 'Unable to load programme.';
  } finally {
    current.loading = false;
  }
}

watch(year, (target) => {
  if (!states.has(target)) {
    states.set(target, { snapshot: null, draft: [], editing: false, loading: false, saving: false, error: '', conflict: false });
    void load(target);
  }
}, { immediate: true });

function add() {
  const current = state.value;

  if (!current) return;
  current.draft.push({ id: crypto.randomUUID(), time: '', title: '', type: 'talk', lead: '', description: '', resourceTitle: '', resourceUrl: '' });
}
function edit() {
  const current = state.value;

  if (!current) return;
  current.draft = copy(current.snapshot?.rows ?? []);
  current.editing = true;
  current.error = '';
  if (!current.draft.length) add();
}
function cancel() {
  const current = state.value;

  if (!current) return;
  current.editing = false;
  current.conflict = false;
  current.error = '';
}
function move(index: number, offset: number) {
  const current = state.value;
  const target = index + offset;

  if (!current || target < 0 || target >= current.draft.length) return;
  const [row] = current.draft.splice(index, 1);

  current.draft.splice(target, 0, row);
}
async function save() {
  const target = year.value;
  const current = states.get(target);

  if (!current) return;
  const parsed = programmeSaveSchema.safeParse({ revision: current.snapshot?.revision, rows: current.draft });

  if (!parsed.success) {
    current.error = parsed.error.issues[0]?.message ?? 'Check the programme rows.';

    return;
  }
  current.saving = true;
  current.error = '';
  try {
    const response = await fetch(`/api/annual-conference/${target}/programme`, {
      method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.data),
    });
    const result = await response.json();

    if (response.status === 409) current.conflict = true;
    if (!response.ok) throw new Error(result.error ?? 'Unable to save programme.');
    current.snapshot = result as ProgrammeSnapshot;
    current.draft = copy(current.snapshot.rows);
    current.editing = false;
    current.conflict = false;
    if (year.value === target) notify.success('Programme outline saved.');
  } catch (error) {
    current.error = error instanceof Error ? error.message : 'Unable to save programme.';
  } finally {
    current.saving = false;
  }
}
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <AnnualConferenceNav :show-page-heading="false" />
      <section v-if="state" class="programme">
        <div class="programme-heading">
          <div>
            <p class="editorial-eyebrow">{{ year }} conference</p>
            <h1>Programme outline</h1>
            <p>Plan the order and details of conference sessions.</p>
          </div>
          <button v-if="state.snapshot && !state.editing" class="programme-button" @click="edit">
            {{ state.snapshot.rows.length ? 'Edit outline' : 'Add outline' }}
          </button>
        </div>
        <p v-if="state.loading && !state.snapshot">Loading programme…</p>
        <div v-if="state.error" role="alert" class="programme-error">
          {{ state.error }}
          <button v-if="!state.snapshot" @click="load(year)">Try again</button>
        </div>
        <template v-if="state.snapshot">
          <div v-if="state.editing" class="programme-rows">
            <fieldset v-for="(row, index) in state.draft" :key="row.id" class="programme-row" :disabled="state.saving || state.loading">
              <legend>Session {{ index + 1 }}</legend>
              <div class="programme-grid">
                <label>
                  Time
                  <input v-model="row.time" class="app-form-control" maxlength="80" placeholder="TBD" />
                </label>
                <label>
                  Title
                  <input v-model="row.title" class="app-form-control" maxlength="200" required />
                </label>
                <AppDropdown v-model="row.type" label="Type" :options="options" :disabled="state.saving || state.loading" density="compact" />
                <label>
                  Lead
                  <input v-model="row.lead" class="app-form-control" maxlength="200" />
                </label>
                <label class="programme-wide">
                  Description
                  <textarea v-model="row.description" class="app-form-control" maxlength="2000" rows="2" />
                </label>
                <label>
                  Resource title
                  <input v-model="row.resourceTitle" class="app-form-control" maxlength="200" />
                </label>
                <label>
                  Resource URL
                  <input v-model="row.resourceUrl" class="app-form-control" type="url" maxlength="2048" placeholder="https://" />
                </label>
              </div>
              <div class="programme-actions" role="group" :aria-label="`Session ${index + 1} actions`">
                <button :disabled="index === 0 || state.saving" @click="move(index, -1)">Move up</button>
                <button :disabled="index === state.draft.length - 1 || state.saving" @click="move(index, 1)">Move down</button>
                <button :disabled="state.saving" @click="state.draft.splice(index, 1)">Remove</button>
              </div>
            </fieldset>
            <div class="programme-actions">
              <button :disabled="state.saving || state.loading || state.draft.length >= 100" @click="add">Add row</button>
              <button class="programme-button" :disabled="state.saving || state.loading || state.conflict" @click="save">
                {{ state.saving ? 'Saving…' : 'Save outline' }}
              </button>
              <button :disabled="state.saving || state.loading" @click="cancel">Cancel</button>
            </div>
            <div v-if="state.conflict">
              <p>Your draft is still here. Loading the latest version will replace it.</p>
              <button :disabled="state.loading || state.saving" @click="load(year, true)">Discard draft and load latest</button>
            </div>
          </div>
          <div v-else-if="state.snapshot.rows.length" class="programme-rows">
            <article v-for="row in state.snapshot.rows" :key="row.id" class="programme-display">
              <strong>{{ row.time }}</strong>
              <div>
                <h2>{{ row.title }}</h2>
                <p>{{ options.find((option) => option.value === row.type)?.label }}<span v-if="row.lead"> · {{ row.lead }}</span></p>
                <p v-if="row.description">{{ row.description }}</p>
                <a v-if="row.resourceUrl" :href="row.resourceUrl" target="_blank" rel="noopener noreferrer">{{ row.resourceTitle || 'Open resource' }}</a>
              </div>
            </article>
          </div>
          <p v-else>No programme outline yet.</p>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.programme {
  padding: 24px 0 80px;
}

.programme-heading {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 16px;
  margin-bottom: 24px;
}

.programme-heading h1 {
  font-size: 2rem;
  font-weight: 800;
}

.programme-heading p {
  color: #555;
}

.programme-rows {
  display: grid;
  gap: 16px;
}

.programme-row,
.programme-display {
  background: white;
  border: 1px solid #ddd9ce;
  border-radius: 8px;
  padding: 20px;
}

.programme-row legend {
  font-weight: 700;
  padding: 0 6px;
}

.programme-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.programme-grid label {
  display: grid;
  gap: 5px;
  font-weight: 600;
}

.programme-wide {
  grid-column: 1 / -1;
}

.programme-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.programme-actions button,
.programme-button,
.programme-error button {
  border: 1px solid #111;
  border-radius: 6px;
  padding: 8px 14px;
  min-height: 44px;
  font-weight: 700;
}

.programme-button {
  background: #f5e642;
}

button:disabled {
  opacity: .5;
}

.programme-display {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 16px;
}

.programme-display h2 {
  font-size: 1.2rem;
  font-weight: 700;
}

.programme-display p {
  color: #555;
  white-space: pre-wrap;
}

.programme-display a {
  text-decoration: underline;
  overflow-wrap: anywhere;
}

.programme-error {
  color: #a00035;
  margin-bottom: 16px;
}

@media (max-width: 640px) {
  .programme-heading {
    align-items: start;
    flex-direction: column;
  }

  .programme-grid {
    grid-template-columns: 1fr;
  }

  .programme-wide {
    grid-column: auto;
  }

  .programme-display {
    grid-template-columns: 1fr;
    gap: 4px;
  }
}
</style>
