<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch, type ComponentPublicInstance } from 'vue';
import { useRoute } from 'vue-router';
import AnnualConferenceNav from '@/src/components/AnnualConferenceNav.vue';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AppMultiSelectDropdown from '@/src/components/AppMultiSelectDropdown.vue';
import ProgrammeEditorActions from '@/src/components/ProgrammeEditorActions.vue';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import ProgrammeTimePicker from '@/src/components/ui/ProgrammeTimePicker.vue';
import { notify } from '@/src/lib/notify';
import { suggestProgrammeSummary } from '@/src/lib/programme-summary';
import { programmeSaveSchema, type ProgrammeRow, type ProgrammeSnapshot } from '@/lib/annual-conference-programme';

const options = [
  { value: 'talk', label: 'Talk' }, { value: 'product_demo', label: 'Product demo' },
  { value: 'system_design', label: 'System design' }, { value: 'workshop', label: 'Workshop' },
  { value: 'panel', label: 'Panel' }, { value: 'open_discussion', label: 'Open discussion' },
  { value: 'networking', label: 'Networking' }, { value: 'break', label: 'Break' },
];

type SpeakerProposal = { id: string; speakerId: string; name: string; title: string; description: string; photoUrl: string | null };
type State = { canManagePhotos: boolean; proposals: SpeakerProposal[]; speakersLoading: boolean; speakersError: string; photoBusy: string; photoError: string; snapshot: ProgrammeSnapshot | null; draft: ProgrammeRow[]; editing: boolean; loading: boolean; saving: boolean; error: string; conflict: boolean };
const states = reactive(new Map<string, State>());
const expandedRows = reactive(new Map<string, Set<string>>());
const editor = ref<HTMLElement | null>(null);
const heading = ref<HTMLElement | null>(null);
const annualConferenceNav = ref<ComponentPublicInstance | null>(null);
const navHeight = ref(0);
let navObserver: ResizeObserver | undefined;
let photoVersion = 0;

function measureNavigation() {
  const element = annualConferenceNav.value?.$el;

  navHeight.value = element instanceof HTMLElement && getComputedStyle(element).position === 'sticky'
    ? element.getBoundingClientRect().height
    : 0;
}

onMounted(() => {
  const element = annualConferenceNav.value?.$el;

  if (element instanceof HTMLElement) {
    navObserver = new ResizeObserver(measureNavigation);
    navObserver.observe(element);
    measureNavigation();
  }
  window.addEventListener('resize', measureNavigation);
});

onBeforeUnmount(() => {
  navObserver?.disconnect();
  window.removeEventListener('resize', measureNavigation);
});
const pendingDeletion = ref<{ year: string; rowId: string } | null>(null);
const pendingCopy = ref<{ year: string; row: ProgrammeRow; proposal: SpeakerProposal; title: string; description: string } | null>(null);
const pendingPhotoRemoval = ref<{ year: string; row: ProgrammeRow; proposal: SpeakerProposal; photoUrl: string } | null>(null);

function clearPendingActions() {
  pendingDeletion.value = null;
  pendingCopy.value = null;
  pendingPhotoRemoval.value = null;
}
const route = useRoute();
const year = computed(() => String(route.params.year));
const state = computed(() => states.get(year.value));
const pendingTitle = computed(() => {
  const pending = pendingDeletion.value;
  const title = pending && states.get(pending.year)?.draft.find((row) => row.id === pending.rowId)?.title.trim();

  return title || 'Untitled session';
});
const copy = (rows: ProgrammeRow[]) => rows.map((row) => ({ ...row, speakerProposalIds: [...(row.speakerProposalIds ?? [])] }));
const suggestions = reactive(new Map<string, string>());
const suggestionKey = (rowId: string) => `${year.value}:${rowId}`;

async function loadSpeakers(target: string) {
  const current = states.get(target);

  if (!current) return;
  current.speakersLoading = true;
  current.speakersError = '';
  try {
    const response = await fetch(`/api/annual-conference/${target}/programme/speakers`, { credentials: 'include' });
    const result = await response.json();

    if (!response.ok) throw new Error(result.error ?? 'Unable to load accepted proposals.');
    current.proposals = result.proposals;
    current.canManagePhotos = result.canManagePhotos === true;
  } catch (error) {
    current.speakersError = error instanceof Error ? error.message : 'Unable to load accepted proposals.';
  } finally {
    current.speakersLoading = false;
  }
}

function applyProposal(row: ProgrammeRow, proposal: SpeakerProposal) {
  row.title = proposal.title;
  row.description = proposal.description;
  suggestions.delete(suggestionKey(row.id));
}

function copyProposal(row: ProgrammeRow, proposal: SpeakerProposal) {
  if (row.title.trim() || row.description.trim()) {
    pendingCopy.value = { year: year.value, row, proposal, title: row.title, description: row.description };

    return;
  }
  applyProposal(row, proposal);
}

function pendingActionIsValid(target: string, row: ProgrammeRow, proposal: SpeakerProposal) {
  const current = states.get(target);

  return target === year.value && !!current && current.editing && !current.loading && !current.saving
    && current.draft.includes(row) && current.proposals.includes(proposal) && row.speakerProposalIds.includes(proposal.id);
}

function confirmCopy() {
  const pending = pendingCopy.value;

  pendingCopy.value = null;
  if (!pending || !pendingActionIsValid(pending.year, pending.row, pending.proposal)
    || pending.row.title !== pending.title || pending.row.description !== pending.description) return;
  applyProposal(pending.row, pending.proposal);
}

function requestPhotoRemoval(row: ProgrammeRow, proposal: SpeakerProposal) {
  if (!proposal.photoUrl) return;
  pendingPhotoRemoval.value = { year: year.value, row, proposal, photoUrl: proposal.photoUrl };
}

function confirmPhotoRemoval() {
  const pending = pendingPhotoRemoval.value;

  pendingPhotoRemoval.value = null;
  if (!pending || !pendingActionIsValid(pending.year, pending.row, pending.proposal)
    || pending.proposal.photoUrl !== pending.photoUrl || states.get(pending.year)?.photoBusy) return;
  void updatePhoto(pending.proposal);
}

async function updatePhoto(proposal: SpeakerProposal, event?: Event) {
  const target = year.value;
  const current = states.get(target);
  const input = event?.target as HTMLInputElement | undefined;
  const file = input?.files?.[0];

  if (!current || (input && !file)) return;
  current.photoBusy = proposal.speakerId;
  current.photoError = '';
  try {
    const body = file ? new FormData() : undefined;

    if (file) body?.append('file', file);
    const response = await fetch(`/api/annual-conference/${target}/programme/speakers/${proposal.speakerId}/photo`, { method: file ? 'PUT' : 'DELETE', credentials: 'include', body });
    const result = await response.json();

    if (!response.ok) throw new Error(result.error ?? 'Unable to update photo.');
    for (const item of current.proposals) {
      if (item.speakerId === proposal.speakerId) item.photoUrl = result.photoUrl ? `${result.photoUrl}?updated=${++photoVersion}` : null;
    }
  } catch (error) {
    current.photoError = error instanceof Error ? error.message : 'Unable to update photo.';
  } finally {
    current.photoBusy = '';
    if (input) input.value = '';
  }
}

async function load(target: string, replaceDraft = false) {
  const current = states.get(target);

  if (!current) return;
  clearPendingActions();
  current.loading = true;
  current.error = '';
  try {
    const response = await fetch(`/api/annual-conference/${target}/programme`, { credentials: 'include' });
    const result = await response.json();

    if (!response.ok) throw new Error(result.error ?? 'Unable to load programme.');
    current.snapshot = result as ProgrammeSnapshot;
    if (replaceDraft || !current.editing) {
      for (const row of current.draft) suggestions.delete(`${target}:${row.id}`);
      current.draft = copy(current.snapshot.rows);
    }
    if (replaceDraft) current.conflict = false;
  } catch (error) {
    current.error = error instanceof Error ? error.message : 'Unable to load programme.';
  } finally {
    current.loading = false;
  }
}

watch(year, (target) => {
  clearPendingActions();
  if (!states.has(target)) {
    states.set(target, { canManagePhotos: false, proposals: [], speakersLoading: false, speakersError: '', photoBusy: '', photoError: '', snapshot: null, draft: [], editing: false, loading: false, saving: false, error: '', conflict: false });
    void load(target);
    void loadSpeakers(target);
  }
}, { immediate: true });

async function add(focus = true) {
  const current = state.value;

  if (!current) return;
  const id = crypto.randomUUID();

  current.draft.push({ id, time: '', title: '', type: 'talk', lead: '', description: '', resourceTitle: '', resourceUrl: '', speakerProposalIds: [] });
  if (focus) {
    await nextTick();
    focusEditorField(`[data-row-title="${id}"]`);
  }
}
function ensureEditorFocusVisible(field: HTMLElement) {
  const scrollContainer = field.closest<HTMLElement>('.app-main');
  const visibleTop = heading.value?.getBoundingClientRect().bottom ?? 0;
  const fieldTop = field.getBoundingClientRect().top;

  if (fieldTop < visibleTop) {
    const offset = fieldTop - visibleTop - 8;

    if (scrollContainer && getComputedStyle(scrollContainer).overflowY !== 'visible') scrollContainer.scrollBy({ top: offset, behavior: 'auto' });
    else window.scrollBy({ top: offset, behavior: 'auto' });
  }
}
function onEditorFocus(event: FocusEvent) {
  if (!(event.target instanceof HTMLElement)) return;
  const field = event.target;

  requestAnimationFrame(() => {
    if (document.activeElement === field) ensureEditorFocusVisible(field);
  });
}
function focusEditorField(selector: string) {
  const field = editor.value?.querySelector<HTMLInputElement>(selector);

  if (!field) return;
  field.focus();
  ensureEditorFocusVisible(field);
}
function edit() {
  const current = state.value;

  if (!current) return;
  current.draft = copy(current.snapshot?.rows ?? []);
  current.editing = true;
  current.error = '';
  if (!current.draft.length) void add(false);
}
function cancel() {
  const current = state.value;

  if (!current) return;
  clearPendingActions();
  current.editing = false;
  for (const row of current.draft) suggestions.delete(`${year.value}:${row.id}`);
  current.conflict = false;
  current.error = '';
}
function toggleDetails(id: string) {
  let expanded = expandedRows.get(year.value);

  if (!expanded) {
    expandedRows.set(year.value, new Set());
    expanded = expandedRows.get(year.value)!;
  }
  if (expanded.has(id)) expanded.delete(id);
  else expanded.add(id);
}
function isExpanded(id: string) {
  return expandedRows.get(year.value)?.has(id) ?? false;
}
function move(index: number, offset: number) {
  const current = state.value;
  const target = index + offset;

  if (!current || target < 0 || target >= current.draft.length) return;
  const [row] = current.draft.splice(index, 1);

  current.draft.splice(target, 0, row);
}
function requestRemoval(rowId: string) {
  const current = state.value;

  if (!current || !current.editing || current.loading || current.saving || current.conflict) return;
  pendingDeletion.value = { year: year.value, rowId };
}
async function confirmRemoval() {
  const pending = pendingDeletion.value;
  const current = pending ? states.get(pending.year) : undefined;

  if (!pending || !current || pending.year !== year.value || !current.editing || current.loading || current.saving || current.conflict) {
    pendingDeletion.value = null;

    return;
  }
  const index = current.draft.findIndex((row) => row.id === pending.rowId);

  if (index < 0) {
    pendingDeletion.value = null;

    return;
  }
  suggestions.delete(`${pending.year}:${pending.rowId}`);
  current.draft.splice(index, 1);
  expandedRows.get(pending.year)?.delete(pending.rowId);
  const nextId = current.draft[Math.min(index, current.draft.length - 1)]?.id;

  pendingDeletion.value = null;
  await nextTick();
  if (year.value !== pending.year) return;
  if (nextId) focusEditorField(`[data-row-title="${nextId}"]`);
  else heading.value?.querySelector<HTMLButtonElement>('[aria-label="Outline actions"] button')?.focus();
}
async function save() {
  const target = year.value;
  const current = states.get(target);

  if (!current) return;
  const parsed = programmeSaveSchema.safeParse({ revision: current.snapshot?.revision, rows: current.draft });

  if (!parsed.success) {
    current.error = parsed.error.issues[0]?.message ?? 'Check the programme rows.';
    if (parsed.error.issues.some((issue) => issue.path.includes('resourceUrl'))) {
      const issue = parsed.error.issues.find((item) => item.path.includes('resourceUrl'));
      const index = typeof issue?.path[1] === 'number' ? issue.path[1] : -1;
      const invalidRow = current.draft[index];

      if (invalidRow) {
        const expanded = expandedRows.get(target) ?? new Set<string>();

        expanded.add(invalidRow.id);
        expandedRows.set(target, expanded);
      }
      if (invalidRow && year.value === target) {
        await nextTick();
        focusEditorField(`[data-resource-url="${invalidRow.id}"]`);
      }
    }

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
    for (const row of current.draft) suggestions.delete(`${target}:${row.id}`);
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
      <AnnualConferenceNav ref="annualConferenceNav" :show-page-heading="false" />
      <section v-if="state" class="programme" :style="{ '--programme-nav-height': `${navHeight}px` }">
        <div ref="heading" class="programme-heading">
          <div>
            <p class="editorial-eyebrow">{{ year }} conference</p>
            <h1>Programme outline</h1>
            <p>Plan the order and details of conference sessions.</p>
          </div>
          <ProgrammeEditorActions
            v-if="state.snapshot && state.editing"
            :busy="state.saving || state.loading"
            :saving="state.saving"
            :conflict="state.conflict"
            :full="state.draft.length >= 100"
            @add="add()"
            @save="save"
            @cancel="cancel"
          />
          <button v-if="state.snapshot && !state.editing" class="programme-edit-button" @click="edit">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path v-if="state.snapshot.rows.length" d="m4 16-1 5 5-1L19 9l-4-4zM13 7l4 4" />
              <path v-else d="M12 5v14M5 12h14" />
            </svg>
            {{ state.snapshot.rows.length ? 'Edit outline' : 'Add outline' }}
          </button>
        </div>
        <p v-if="state.loading && !state.snapshot">Loading programme…</p>
        <div v-if="state.error" role="alert" class="programme-error">
          {{ state.error }}
          <button v-if="!state.snapshot" @click="load(year)">Try again</button>
        </div>
        <template v-if="state.snapshot">
          <div v-if="state.editing" ref="editor" class="programme-editor" @focusin="onEditorFocus">
            <div class="programme-rows">
              <fieldset v-for="(row, index) in state.draft" :key="`${year}-${row.id}`" class="programme-row" :disabled="state.saving || state.loading">
                <legend class="sr-only">Session {{ index + 1 }}</legend>
                <div class="programme-grid">
                  <div class="programme-time-field">
                    <span>Time</span>
                    <ProgrammeTimePicker v-model="row.time" :previous-time="state.draft[index - 1]?.time" :disabled="state.saving || state.loading" />
                  </div>
                  <label>
                    Title
                    <input v-model="row.title" :data-row-title="row.id" class="app-form-control" maxlength="200" required />
                  </label>
                  <div class="programme-type-field">
                    <span>Type</span>
                    <AppDropdown v-model="row.type" aria-label="Type" :options="options" :disabled="state.saving || state.loading" trigger-class="!px-2" />
                  </div>
                  <div class="programme-row-actions" role="group" :aria-label="`Session ${index + 1} actions`">
                    <button type="button" :disabled="index === 0" :aria-label="`Move ${row.title || `session ${index + 1}`} up`" title="Move up" @click="move(index, -1)">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
                    </button>
                    <button type="button" :disabled="index === state.draft.length - 1" :aria-label="`Move ${row.title || `session ${index + 1}`} down`" title="Move down" @click="move(index, 1)">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
                    </button>
                    <button type="button" class="programme-remove" :disabled="state.conflict" :aria-label="`Remove ${row.title || `session ${index + 1}`}`" title="Remove" @click="requestRemoval(row.id)">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v6M14 11v6" /></svg>
                    </button>
                  </div>
                </div>
                <button type="button" class="programme-details-toggle" :aria-expanded="isExpanded(row.id)" :aria-controls="`programme-details-${year}-${row.id}`" @click="toggleDetails(row.id)">
                  <svg viewBox="0 0 24 24" aria-hidden="true" :class="{ 'is-expanded': isExpanded(row.id) }"><path d="m9 6 6 6-6 6" /></svg>
                  <span class="programme-details-label">{{ isExpanded(row.id) ? 'Hide details' : 'Description and resource' }}</span>
                  <span v-if="!isExpanded(row.id) && (row.description || row.resourceUrl)" class="programme-preview">{{ row.description || row.resourceTitle || row.resourceUrl }}</span>
                </button>
                <div :id="`programme-details-${year}-${row.id}`" v-show="isExpanded(row.id)" class="programme-details">
                  <div class="programme-speakers">
                    <AppMultiSelectDropdown
                      :model-value="row.speakerProposalIds"
                      :options="[...state.proposals.map((proposal) => ({ value: proposal.id, label: `${proposal.name} · ${proposal.title}` })), ...row.speakerProposalIds.filter((id) => !state?.proposals.some((proposal) => proposal.id === id)).map((id) => ({ value: id, label: `Unavailable proposal (${id})` }))]"
                      label="Accepted speaker proposals"
                      placeholder="No speakers selected"
                      :disabled="state.speakersLoading || !!state.speakersError || !state.canManagePhotos"
                      teleport
                      @update:model-value="row.speakerProposalIds = $event.map(String)"
                    />
                    <p class="programme-help">{{ state.canManagePhotos ? 'Select one or more proposals, or leave empty. Copying proposal text is optional.' : 'Speaker links can be changed by an organizer with speaker management access.' }}</p>
                    <p v-if="state.speakersLoading" class="programme-help">Loading accepted proposals…</p>
                    <p v-else-if="state.speakersError" role="alert" class="programme-error">{{ state.speakersError }} <button type="button" @click="loadSpeakers(year)">Try again</button></p>
                    <p v-else-if="!state.proposals.length" class="programme-help">No accepted proposals for this conference yet.</p>
                    <p v-if="!state.speakersLoading && !state.speakersError && row.speakerProposalIds.some((id) => !state?.proposals.some((proposal) => proposal.id === id))" class="programme-error">A linked proposal is no longer available. This speaker is hidden from the public programme. You can keep editing the schedule.</p>
                    <div v-for="proposal in state.proposals.filter((item) => row.speakerProposalIds.includes(item.id))" :key="proposal.id" class="programme-speaker">
                      <img v-if="proposal.photoUrl" :src="proposal.photoUrl" :alt="`Photo of ${proposal.name}`" class="programme-photo" />
                      <div class="programme-speaker-copy">
                        <strong>{{ proposal.name }}</strong>
                        <span>{{ proposal.title }}</span>
                        <div class="programme-speaker-actions">
                          <button type="button" @click="copyProposal(row, proposal)">Copy title and description</button>
                          <label v-if="state.canManagePhotos" class="programme-photo-action">{{ proposal.photoUrl ? 'Replace photo' : 'Upload photo' }}<input type="file" accept="image/avif,image/jpeg,image/png,image/webp" :disabled="!!state.photoBusy" @change="updatePhoto(proposal, $event)" /></label>
                          <button v-if="proposal.photoUrl && state.canManagePhotos" type="button" :disabled="!!state.photoBusy" @click="requestPhotoRemoval(row, proposal)">Remove photo</button>
                        </div>
                      </div>
                    </div>
                    <p v-if="state.photoBusy" class="programme-help">Updating photo…</p>
                    <p v-if="state.photoError" role="alert" class="programme-error">{{ state.photoError }}</p>
                    <p v-if="row.speakerProposalIds.length" class="programme-help">Photo changes save immediately for this speaker across sessions. Use AVIF, JPEG, PNG or WebP, up to 5 MB.</p>
                  </div>
                  <label class="programme-description">
                    Description
                    <textarea v-model="row.description" class="app-form-control" maxlength="2000" rows="2" @input="suggestions.delete(suggestionKey(row.id))" />
                  </label>
                  <p v-if="row.description.length > 2000" class="programme-error programme-description">Description: {{ row.description.length }} of 2,000 characters. Shorten it or use a suggested summary before saving.</p>
                  <div class="programme-summary">
                    <button type="button" :disabled="!row.description.trim()" @click="suggestions.set(suggestionKey(row.id), suggestProgrammeSummary(row.description))">Suggest summary</button>
                    <p class="programme-help">Drafted from your description on this device. Review the extract before using it.</p>
                    <template v-if="suggestions.has(suggestionKey(row.id))">
                      <label>Suggested summary
                        <textarea :value="suggestions.get(suggestionKey(row.id))" class="app-form-control" rows="3" maxlength="2000" @input="suggestions.set(suggestionKey(row.id), ($event.target as HTMLTextAreaElement).value)" />
                      </label>
                      <button type="button" @click="row.description = suggestions.get(suggestionKey(row.id)) || ''; suggestions.delete(suggestionKey(row.id))">Use summary</button>
                      <button type="button" @click="suggestions.delete(suggestionKey(row.id))">Dismiss</button>
                    </template>
                  </div>
                  <label>
                    Resource title
                    <input v-model="row.resourceTitle" class="app-form-control" maxlength="200" />
                  </label>
                  <label>
                    Resource URL
                    <input v-model="row.resourceUrl" :data-resource-url="row.id" class="app-form-control" type="url" maxlength="2048" placeholder="https://" />
                  </label>
                </div>
              </fieldset>
            </div>
            <p v-if="state.error" class="programme-error">{{ state.error }}</p>
            <div v-if="state.conflict">
              <p>Your draft is still here. Loading the latest version will replace it.</p>
              <button class="programme-button" :disabled="state.loading || state.saving" @click="load(year, true)">Discard draft and load latest</button>
            </div>
          </div>
          <div v-else-if="state.snapshot.rows.length" class="programme-list">
            <article v-for="row in state.snapshot.rows" :key="row.id" class="programme-display">
              <span class="programme-time">{{ row.time }}</span>
              <div class="programme-copy">
                <h2>{{ row.title }}</h2>
                <p v-if="row.description">{{ row.description }}</p>
                <div v-if="row.speakerProposalIds?.length" class="programme-display-speakers">
                  <template v-for="id in row.speakerProposalIds" :key="id">
                    <span v-if="state.proposals.find((proposal) => proposal.id === id)" class="programme-display-speaker">
                      <img v-if="state.proposals.find((proposal) => proposal.id === id)?.photoUrl" :src="state.proposals.find((proposal) => proposal.id === id)?.photoUrl || undefined" alt="" />
                      {{ state.proposals.find((proposal) => proposal.id === id)?.name }}
                    </span>
                    <span v-else-if="!state.speakersLoading" class="programme-display-speaker">{{ state.speakersError ? 'Speakers unavailable' : 'Unavailable proposal' }}</span>
                  </template>
                </div>
                <a v-if="row.resourceUrl" :href="row.resourceUrl" target="_blank" rel="noopener noreferrer">{{ row.resourceTitle || 'Open resource' }}</a>
              </div>
              <span class="programme-type">{{ options.find((option) => option.value === row.type)?.label }}</span>
            </article>
          </div>
          <p v-else>No programme outline yet.</p>
        </template>
      </section>
      <ConfirmDialog
        :open="pendingCopy !== null"
        title="Replace session text?"
        message="Replace this session title and description with the proposal? Your current draft text will be lost."
        confirm-label="Replace text"
        mobile-sheet
        @cancel="pendingCopy = null"
        @confirm="confirmCopy"
      />
      <ConfirmDialog
        :open="pendingPhotoRemoval !== null"
        title="Remove speaker photo?"
        :message="`Remove the photo for ${pendingPhotoRemoval?.proposal.name ?? 'this speaker'}? This applies wherever the speaker appears.`"
        confirm-label="Remove photo"
        danger
        mobile-sheet
        @cancel="pendingPhotoRemoval = null"
        @confirm="confirmPhotoRemoval"
      />
      <ConfirmDialog
        :open="pendingDeletion !== null"
        title="Remove session?"
        :message="`Remove “${pendingTitle}” from the draft? Save outline to apply this change.`"
        confirm-label="Remove session"
        danger
        mobile-sheet
        @cancel="pendingDeletion = null"
        @confirm="confirmRemoval"
      />
    </div>
  </div>
</template>

<style scoped>
:deep(.annual-conference-nav-shell:has(form)) {
  position: relative;
  top: auto;
}

.programme {
  padding: 24px 0 80px;
}

.programme-heading {
  position: sticky;
  top: var(--app-header-fixed-offset);
  z-index: 30;
  background: #f5f2e8;
  padding: 12px 0;
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

.programme-editor, .programme-rows, .programme-list {
  display: grid;
  gap: 10px;
}

.programme-editor {
  gap: 18px;
}

.programme-row, .programme-display {
  min-width: 0;
  padding: 12px 16px;
  border: 1px solid #e0ddd4;
  border-radius: 8px;
  background: #fff;
}

.programme-grid {
  display: grid;
  grid-template-columns: minmax(155px, .8fr) minmax(180px, 2fr) minmax(150px, 1fr) auto;
  align-items: end;
  gap: 10px;
}

.programme-grid label, .programme-time-field, .programme-type-field, .programme-details label {
  display: grid;
  gap: 5px;
  min-width: 0;
  font-size: 14px;
  font-weight: 700;
}

.programme-row-actions {
  display: flex;
  gap: 2px;
}

.programme-row-actions button {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 1px solid #e0ddd4;
  border-radius: 6px;
  font-size: 18px;
}

.programme-row-actions svg, .programme-details-toggle svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.programme-row-actions .programme-remove {
  border-color: hsl(var(--destructive) / .35);
  color: hsl(var(--destructive));
}

@media (hover: hover) and (pointer: fine) {
  .programme-row-actions .programme-remove:not(:disabled):hover {
    background: hsl(var(--destructive) / .08);
  }
}

.programme-row-actions button:disabled {
  opacity: .4;
}

.programme-details-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-height: 44px;
  color: #555;
  font-size: 14px;
  font-weight: 700;
  text-align: left;
}

.programme-details-toggle svg {
  flex: none;
  transition: transform 150ms cubic-bezier(.4, 0, .2, 1);
}

.programme-details-toggle svg.is-expanded {
  transform: rotate(90deg);
}

@media (hover: hover) and (pointer: fine) {
  .programme-details-toggle:enabled:hover:not(:focus-visible) .programme-details-label {
    text-decoration: underline;
    text-underline-offset: .2em;
  }
}

.programme-details-label {
  flex: none;
}

.programme-preview {
  min-width: 0;
  overflow: hidden;
  color: #777;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.programme-details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 4px 0 6px;
}

.programme-speakers, .programme-summary {
  grid-column: 1 / -1;
  min-width: 0;
}

.programme-help {
  margin: 5px 0;
  color: #555;
  font-size: 14px;
  font-weight: 400;
}

.programme-speaker {
  display: flex;
  gap: 12px;
  margin-top: 10px;
  padding: 10px;
  border: 1px solid #e0ddd4;
  border-radius: 6px;
}

.programme-photo {
  width: 56px;
  height: 56px;
  flex: none;
  border-radius: 6px;
  object-fit: cover;
}

.programme-speaker-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
  overflow-wrap: anywhere;
}

.programme-speaker-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
}

.programme-speaker-actions button, .programme-photo-action, .programme-summary button {
  min-height: 44px;
  color: #a00050;
  font-size: 14px;
  font-weight: 700;
  text-underline-offset: 2px;
}

.programme-summary button {
  text-decoration: underline;
}

@media (hover: hover) and (pointer: fine) {
  .programme-speaker-actions button:not(:disabled):hover,
  .programme-photo-action:has(input:enabled):hover {
    text-decoration: underline;
  }

  .programme-speaker-actions button:not(:disabled):hover:not(:focus-visible) {
    outline: none;
  }
}

.programme-speaker-actions .programme-photo-action {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.programme-photo-action input {
  width: 1px;
  height: 1px;
  overflow: hidden;
  position: absolute;
  clip-path: inset(50%);
}

.programme-photo-action:has(input:focus-visible) {
  outline: 2px solid #e8117f;
  outline-offset: 2px;
}

.programme-summary button + button {
  margin-left: 16px;
}

.programme-description {
  grid-column: 1 / -1;
}

.programme-edit-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 44px;
  padding: 8px 14px;
  border: 1px solid #d8d4ca;
  border-radius: 6px;
  background: #fff;
  font-size: 15px;
  font-weight: 600;
}

.programme-edit-button svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (hover: hover) and (pointer: fine) {
  .programme-edit-button:hover {
    border-color: #aaa59a;
    background: #fefce8;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .programme-edit-button:active {
    transform: scale(.97);
  }
}

.programme-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 8px 14px;
  border: 1px solid #111;
  border-radius: 6px;
  background: #f5e642;
  font-weight: 700;
}

.programme-button svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.programme-display {
  display: grid;
  grid-template-columns: 165px minmax(0, 1fr) auto;
  align-items: start;
  gap: 16px;
}

.programme-time {
  color: #555;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.programme-copy {
  min-width: 0;
}

.programme-copy h2 {
  font-weight: 700;
  overflow-wrap: anywhere;
}

.programme-copy p {
  color: #555;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.programme-display-speakers {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-top: 8px;
}

.programme-display-speaker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #555;
  font-size: 14px;
}

.programme-display-speaker img {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  object-fit: cover;
}

.programme-copy a {
  color: #c80d68;
  text-decoration: underline;
  overflow-wrap: anywhere;
}

.programme-type {
  padding: 3px 8px;
  border-radius: 6px;
  background: #f5f2e8;
  color: #555;
  font-size: 13px;
  font-weight: 700;
}

.programme-error {
  color: #a00035;
  margin-bottom: 16px;
}

@media (min-width: 768px) {
  .programme-heading {
    top: calc(var(--organizer-breadcrumb-height, 0px) + var(--programme-nav-height, 0px));
  }
}

@media (max-width: 900px) {
  .programme-grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .programme-heading {
    align-items: start;
    flex-direction: column;
    gap: 8px;
  }

  .programme-heading h1 {
    font-size: 1.5rem;
  }

  .programme-heading p:not(.editorial-eyebrow) {
    font-size: 14px;
  }

  .programme-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .programme-grid > :nth-child(1) {
    grid-column: 1;
    grid-row: 1;
  }

  .programme-grid > :nth-child(2) {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .programme-grid > :nth-child(3) {
    grid-column: 2;
    grid-row: 1;
  }

  .programme-row-actions {
    grid-column: 1 / -1;
  }

  .programme-preview {
    display: none;
  }

  .programme-details {
    grid-template-columns: minmax(0, 1fr);
  }

  .programme-description {
    grid-column: auto;
  }

  .programme-display {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px 12px;
  }

  .programme-time {
    grid-column: 1 / -1;
  }
}

@media (max-width: 360px) {
  .programme-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .programme-grid > :nth-child(1),
  .programme-grid > :nth-child(2),
  .programme-grid > :nth-child(3) {
    grid-column: 1;
    grid-row: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .programme-details-toggle svg {
    transition: none;
  }
}
</style>
