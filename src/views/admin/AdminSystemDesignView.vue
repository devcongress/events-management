<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { findSystemDesignSource, isSystemDesignSessionItem, systemDesignDisplayTitle } from '@/lib/system-design';
import SystemDesignLearningRoomPanel from '@/src/components/SystemDesignLearningRoomPanel.vue';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import { notify } from '@/src/lib/notify';
import type { Event as CommunityEvent, PublicMeetupScheduleItem } from '@/types';

type SystemDesignDraft = {
  time: string;
  title: string;
  facilitators: string[];
  facilitatorInput: string;
  description: string;
  promptUrl: string;
};

type GeneratedSystemDesignDraft = {
  title: string;
  content: string;
  summary: string;
  export_url: string;
};

const route = useRoute();
const event = ref<CommunityEvent | null>(null);
const drafts = ref<SystemDesignDraft[]>([]);
const loading = ref(true);
const saving = ref(false);
const generatingIndex = ref<number | null>(null);
const removingIndex = ref<number | null>(null);
const pendingRemovalIndex = ref<number | null>(null);
const editing = ref(false);
const error = ref('');
const saveError = ref('');

const systemDesignSessions = computed(() => {
  const schedule = event.value?.schedule ?? [];
  const outlineSlots = schedule.filter((item): item is PublicMeetupScheduleItem => item.type !== 'system_design' && isSystemDesignSessionItem(item));
  const explicitSessions = schedule.filter((item): item is PublicMeetupScheduleItem => item.type === 'system_design');

  if (outlineSlots.length > 0 && explicitSessions.length > 0) {
    const [primarySlot, ...otherSlots] = outlineSlots;
    const [primaryExplicit, ...otherExplicit] = explicitSessions;

    return [
      {
        ...primarySlot,
        lead: primaryExplicit.lead ?? primarySlot.lead,
        facilitators: primaryExplicit.facilitators ?? primarySlot.facilitators,
        description: primaryExplicit.description ?? primarySlot.description,
        system_design_title: primaryExplicit.system_design_title?.trim() || primaryExplicit.title.trim(),
        resources: primaryExplicit.resources.length > 0 ? primaryExplicit.resources : primarySlot.resources,
      },
      ...otherExplicit,
      ...otherSlots,
    ];
  }

  if (explicitSessions.length > 0) {
    return explicitSessions;
  }

  return outlineSlots;
});
const primaryLearningSource = computed(() => {
  const source = findSystemDesignSource(systemDesignSessions.value);
  if (!source) return null;
  return {
    title: source.title?.trim() || 'System Design source',
    url: source.url,
  };
});
const hasSavedDrafts = computed(() => systemDesignSessions.value.some((item) => (
  item.type === 'system_design'
  || Boolean(item.system_design_title?.trim())
  || Boolean(item.description?.trim())
  || Boolean(item.resources[0]?.url?.trim())
  || Boolean(item.lead?.trim())
)));
const pendingRemovalScenario = computed(() => (
  pendingRemovalIndex.value === null ? null : systemDesignSessions.value[pendingRemovalIndex.value] ?? null
));
const pendingRemovalMessage = computed(() => {
  if (!pendingRemovalScenario.value) return '';
  return `Remove “${systemDesignDisplayTitle(pendingRemovalScenario.value)}” and its learning questions from this event? This ends any live presentation and cannot be undone.`;
});
const mutatingDrafts = computed(() => saving.value || generatingIndex.value !== null || removingIndex.value !== null);

function draftFromSession(session?: PublicMeetupScheduleItem): SystemDesignDraft {
  const promptResource = session?.resources?.[0];
  const explicitScenarioTitle = session?.system_design_title?.trim()
    || (session?.type === 'system_design' ? session.title.trim() : '')
    || promptResource?.title?.trim()
    || '';

  return {
    time: session?.time ?? '',
    title: explicitScenarioTitle,
    facilitators: session?.facilitators ?? session?.lead?.split(',').map((name) => name.trim()).filter(Boolean) ?? [],
    facilitatorInput: '',
    description: session?.description ?? '',
    promptUrl: promptResource?.url ?? '',
  };
}

function addFacilitator(draft: SystemDesignDraft) {
  const name = draft.facilitatorInput.trim();
  if (!name) return;
  if (name.length > 120) {
    notify.error('Keep facilitator names under 120 characters.');
    return;
  }
  if (draft.facilitators.some((facilitator) => facilitator.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0)) {
    notify.error('That facilitator is already listed.');
    return;
  }
  draft.facilitators.push(name);
  draft.facilitatorInput = '';
}

function removeFacilitator(draft: SystemDesignDraft, facilitator: string) {
  draft.facilitators = draft.facilitators.filter((name) => name !== facilitator);
}

function syncDrafts() {
  drafts.value = systemDesignSessions.value.length > 0
    ? systemDesignSessions.value.map(draftFromSession)
    : [draftFromSession()];
}

function normalizeDrafts(): PublicMeetupScheduleItem[] {
  return drafts.value.flatMap((draft) => {
    const time = draft.time.trim();
    const title = draft.title.trim();
    const promptUrl = draft.promptUrl.trim();

    if (!title && !promptUrl && !draft.description.trim()) return [];
    if (!title) {
      throw new Error('Add a session title before saving.');
    }
    if (promptUrl && !URL.canParse(promptUrl)) {
      throw new Error('Use a valid URL for the system design docs.');
    }

    return [{
      time: time || 'TBD',
      title,
      type: 'system_design',
      lead: draft.facilitators.join(', ') || null,
      facilitators: draft.facilitators,
      description: draft.description.trim() || null,
      system_design_title: title,
      resources: promptUrl ? [{ title, url: promptUrl }] : [],
    }];
  });
}

function mergeSystemDesignSchedule(items: PublicMeetupScheduleItem[]): PublicMeetupScheduleItem[] {
  const sourceSchedule = event.value?.schedule ?? [];
  const outlineSlotIndexes = sourceSchedule.flatMap((item, index) => (
    item.type !== 'system_design' && isSystemDesignSessionItem(item) ? [index] : []
  ));
  const explicitIndexes = sourceSchedule.flatMap((item, index) => (item.type === 'system_design' ? [index] : []));

  if (outlineSlotIndexes.length > 0) {
    const nextItems = [...items];
    const outlineSlotIndexSet = new Set(outlineSlotIndexes);
    const explicitIndexSet = new Set(explicitIndexes);
    const merged = sourceSchedule.flatMap((item, index) => {
      if (explicitIndexSet.has(index)) return [];
      if (!outlineSlotIndexSet.has(index)) return [item];

      const replacement = nextItems.shift();
      if (!replacement) {
        return [{
          ...item,
          lead: null,
          description: null,
          system_design_title: null,
          resources: [],
        }];
      }

      const scenarioTitle = replacement.system_design_title?.trim() || replacement.title.trim();
      return [{
        ...item,
        lead: replacement.lead,
        description: replacement.description,
        system_design_title: scenarioTitle || null,
        resources: replacement.resources,
      }];
    });

    return [...merged, ...nextItems];
  }

  const nextItems = [...items];
  const merged = sourceSchedule.flatMap((item) => {
    if (item.type !== 'system_design') return [item];
    const replacement = nextItems.shift();
    if (!replacement) return [];

    return [{
      ...replacement,
      time: replacement.time === 'TBD' && item.time ? item.time : replacement.time,
      system_design_title: replacement.system_design_title?.trim() || replacement.title.trim() || null,
    }];
  });

  return [...merged, ...nextItems];
}

function startEditing() {
  syncDrafts();
  saveError.value = '';
  editing.value = true;
}

function cancelEditing() {
  syncDrafts();
  saveError.value = '';
  editing.value = !hasSavedDrafts.value;
}

function addScenarioFromSavedState() {
  startEditing();
  drafts.value.push(draftFromSession());
}

async function fetchEvent() {
  loading.value = true;
  error.value = '';

  try {
    const response = await fetch(`/api/events/${route.params.eventId}`);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error ?? 'Unable to load event');
    }

    event.value = payload;
    syncDrafts();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Unable to load event';
  } finally {
    loading.value = false;
  }
}

function addDraft() {
  drafts.value.push(draftFromSession());
}

function removeDraft(index: number) {
  drafts.value.splice(index, 1);
  if (drafts.value.length === 0) {
    drafts.value.push(draftFromSession());
  }
}

function generatedDraftDescription(draft: SystemDesignDraft): string {
  const title = draft.title.trim();
  const facilitator = draft.facilitators.join(', ');
  const promptUrl = draft.promptUrl.trim();
  const subject = title
    ? `${title} is the monthly architecture session for this meetup.`
    : 'This monthly System Design session uses the linked docs as its teaching brief.';
  const promptCopy = promptUrl
    ? 'The linked prompt deck is the source artifact for the exercise.'
    : 'Add the prompt deck link before publishing so attendees can review the source artifact.';
  const facilitatorCopy = facilitator
    ? ` The session is facilitated by ${facilitator}.`
    : '';

  return [
    `${subject}${facilitatorCopy}`,
    `${promptCopy} The room will use it to explore requirements, system boundaries, data flow, failure modes, scaling constraints, and the tradeoffs behind the final design.`,
    'After the session, replace this draft with the actual recap: the major decisions discussed, tradeoffs the room debated, and what someone who missed the meetup should know.',
  ].join('\n\n');
}

async function generateDraftFromPrompt(draft: SystemDesignDraft, index: number) {
  if (generatingIndex.value !== null) return;

  const promptUrl = draft.promptUrl.trim();
  if (!draft.title.trim() && !promptUrl) {
    notify.error('Add a session title or docs URL before generating a draft.');
    return;
  }

  generatingIndex.value = index;

  try {
    if (!promptUrl) {
      draft.description = generatedDraftDescription(draft);
      await saveSystemDesign('Draft generated and saved.');
      return;
    }

    const response = await fetch(`/api/events/${route.params.eventId}/system-design/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt_url: promptUrl,
        title: draft.title.trim() || undefined,
        lead: draft.facilitators.join(', ') || undefined,
      }),
    });
    const payload = await response.json().catch(() => ({})) as Partial<GeneratedSystemDesignDraft> & { error?: string };

    if (!response.ok) {
      throw new Error(payload.error ?? 'Unable to generate a draft from this prompt deck.');
    }

    if (typeof payload.title === 'string' && !draft.title.trim()) {
      draft.title = payload.title;
    }
    if (typeof payload.summary === 'string' && payload.summary.trim()) {
      draft.description = payload.summary.trim();
    } else {
      draft.description = generatedDraftDescription(draft);
    }

    await saveSystemDesign('Draft generated and saved.');
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Unable to generate a draft from this prompt deck.';
    notify.error(message);
  } finally {
    generatingIndex.value = null;
  }
}

async function saveSystemDesign(successMessage = 'System design notes saved'): Promise<boolean> {
  if (!event.value || saving.value) return false;

  let systemDesignItems: PublicMeetupScheduleItem[];
  try {
    systemDesignItems = normalizeDrafts();
  } catch (caught) {
    saveError.value = caught instanceof Error ? caught.message : 'Check the system design details.';
    return false;
  }

  saving.value = true;
  saveError.value = '';

  try {
    const response = await fetch(`/api/events/${route.params.eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule: mergeSystemDesignSchedule(systemDesignItems) }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error ?? 'Unable to save system design notes');
    }

    event.value = payload;
    syncDrafts();
    editing.value = systemDesignItems.length === 0;
    notify.success(systemDesignItems.length > 0 ? successMessage : 'System design section cleared');
    return true;
  } catch (caught) {
    saveError.value = caught instanceof Error ? caught.message : 'Unable to save system design notes';
    notify.error(saveError.value);
    return false;
  } finally {
    saving.value = false;
  }
}

function requestSavedScenarioRemoval(index: number) {
  if (mutatingDrafts.value || !systemDesignSessions.value[index]) return;
  pendingRemovalIndex.value = index;
}

async function confirmSavedScenarioRemoval() {
  if (!event.value || mutatingDrafts.value) return;

  const index = pendingRemovalIndex.value;
  if (index === null) return;

  const scenario = systemDesignSessions.value[index];
  if (!scenario) return;

  removingIndex.value = index;
  saveError.value = '';

  try {
    const remainingItems = systemDesignSessions.value.filter((_, itemIndex) => itemIndex !== index);
    const response = await fetch(`/api/events/${route.params.eventId}/system-design`, { method: 'DELETE' });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error ?? 'Unable to remove this System Design session');
    }

    event.value = payload;
    syncDrafts();
    editing.value = remainingItems.length === 0;
    pendingRemovalIndex.value = null;
    notify.success('System Design session and learning room removed');
  } catch (caught) {
    saveError.value = caught instanceof Error ? caught.message : 'Unable to remove this System Design session';
    notify.error(saveError.value);
  } finally {
    removingIndex.value = null;
  }
}

onMounted(async () => {
  await fetchEvent();
  editing.value = !hasSavedDrafts.value;
});
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <section class="editorial-header">
        <p class="editorial-eyebrow">monthly session</p>
        <h1 class="editorial-title">System Design</h1>
        <p class="editorial-subtitle max-w-3xl">
          Prepare a public-ready System Design session: its brief, facilitators, docs, and the teaching questions attendees will revisit after the meetup.
        </p>
      </section>

      <p v-if="error" class="mb-5 rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
        {{ error }}
      </p>

      <section v-if="loading" class="grid gap-5" aria-busy="true" aria-label="Loading System Design workspace">
        <article class="skeleton-panel p-6 sm:p-8">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div class="min-w-0 space-y-3">
              <div class="skeleton-eyebrow" />
              <div class="skeleton-line h-8 w-72" />
              <div class="skeleton-line h-4 w-full max-w-3xl" />
            </div>
            <div class="flex gap-3">
              <div class="skeleton-button h-11 w-36" />
              <div class="skeleton-button skeleton-button--secondary h-11 w-32" />
            </div>
          </div>
        </article>
        <article class="skeleton-panel p-6 sm:p-8">
          <div class="skeleton-eyebrow" />
          <div class="mt-3 skeleton-line h-8 w-3/5" />
          <div class="mt-5 space-y-3">
            <div class="skeleton-line h-4" />
            <div class="skeleton-line h-4 w-4/5" />
          </div>
        </article>
      </section>

      <section v-else-if="!editing && hasSavedDrafts" class="grid gap-5">
        <article
          v-for="(item, index) in systemDesignSessions"
          :key="`${item.time}-${item.title}-${index}`"
          class="editorial-panel overflow-hidden"
        >
          <div class="p-6 sm:p-8">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div class="min-w-0">
              <p class="editorial-eyebrow">session</p>
              <component
                :is="item.resources[0] ? 'a' : 'h2'"
                v-bind="item.resources[0] ? {
                  href: item.resources[0].url,
                  target: '_blank',
                  rel: 'noopener noreferrer',
                } : {}"
                class="mt-3 block w-fit text-2xl font-bold tracking-tight text-dc-ink"
                :class="item.resources[0] ? 'border-b-2 border-dc-yellow transition-colors hover:border-dc-ink' : ''"
              >
                {{ systemDesignDisplayTitle(item) }}
              </component>
              <p v-if="item.lead" class="mt-2 text-sm font-medium text-dc-gray">
                Facilitated by {{ item.lead }}
              </p>
              <p v-if="item.time" class="mt-2 font-mono text-xs font-semibold uppercase tracking-wide text-dc-gray">
                {{ item.time }}
              </p>
              </div>

              <div class="flex flex-col gap-3 sm:flex-row">
                <button type="button" class="editorial-secondary-action" :disabled="mutatingDrafts" @click="startEditing">
                  Edit session
                </button>
                <button
                  type="button"
                  class="font-mono text-xs font-semibold uppercase tracking-wide text-red-600 hover:text-red-700"
                  :disabled="mutatingDrafts"
                  @click="requestSavedScenarioRemoval(index)"
                >
                  {{ removingIndex === index ? 'REMOVING...' : 'Remove' }}
                </button>
              </div>
            </div>

            <p v-if="item.description" class="mt-5 max-w-4xl whitespace-pre-line text-base leading-8 text-dc-gray">
              {{ item.description }}
            </p>
          </div>

          <SystemDesignLearningRoomPanel
            v-if="index === 0 && primaryLearningSource"
            embedded
            :event-id="String(route.params.eventId)"
            :source-title="primaryLearningSource.title"
            :source-url="primaryLearningSource.url"
          />
        </article>

        <p v-if="saveError" class="rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {{ saveError }}
        </p>
      </section>

      <section v-else class="grid gap-5">
        <article
          v-for="(draft, index) in drafts"
          :key="index"
          class="editorial-panel p-6 sm:p-8"
        >
          <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p class="editorial-eyebrow">session</p>
              <h2 class="mt-2 text-2xl font-bold tracking-tight text-dc-ink">Monthly system design artifact</h2>
            </div>
            <button
              v-if="drafts.length > 1"
              type="button"
              class="font-mono text-xs font-semibold uppercase tracking-wide text-red-600 hover:text-red-700"
              :disabled="mutatingDrafts"
              @click="removeDraft(index)"
            >
              Remove
            </button>
          </div>

          <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <label>
              <span class="editorial-label">Title</span>
              <input
                v-model="draft.title"
                class="editorial-input min-h-[50px]"
                placeholder="Design a resilient ticketing queue"
              />
            </label>
            <div>
              <span class="editorial-label">Facilitators</span>
              <div class="flex gap-2">
                <input
                  v-model="draft.facilitatorInput"
                  class="editorial-input min-h-[50px]"
                  placeholder="Add a facilitator by name"
                  @keydown.enter.prevent="addFacilitator(draft)"
                />
                <button type="button" class="editorial-secondary-action shrink-0" :disabled="!draft.facilitatorInput.trim()" @click="addFacilitator(draft)">
                  Add
                </button>
              </div>
              <div v-if="draft.facilitators.length" class="mt-3 flex flex-wrap gap-2" aria-label="Selected facilitators">
                <span v-for="facilitator in draft.facilitators" :key="facilitator" class="inline-flex items-center gap-2 rounded-md border border-dc-border bg-dc-paper-warm px-3 py-1.5 text-sm font-medium text-dc-ink">
                  {{ facilitator }}
                  <button type="button" class="motion-press text-dc-gray hover:text-red-600" :aria-label="`Remove ${facilitator}`" @click="removeFacilitator(draft, facilitator)">×</button>
                </span>
              </div>
            </div>
          </div>

          <label class="mt-4 block">
            <span class="editorial-label">Docs URL</span>
            <input
              v-model="draft.promptUrl"
              class="editorial-input mt-2"
              placeholder="https://docs.google.com/presentation/d/..."
            />
          </label>

          <button
            type="button"
            class="editorial-secondary-action mt-4 w-full"
            :disabled="mutatingDrafts"
            @click="generateDraftFromPrompt(draft, index)"
          >
            {{ generatingIndex === index ? 'GENERATING...' : 'GENERATE DRAFT' }}
          </button>
        </article>

        <p v-if="saveError" class="rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {{ saveError }}
        </p>

        <div v-if="hasSavedDrafts" class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button type="button" class="editorial-secondary-action" :disabled="mutatingDrafts" @click="cancelEditing">
            Cancel
          </button>
        </div>
      </section>
    </div>

    <ConfirmDialog
      :open="Boolean(pendingRemovalScenario)"
      title="Remove System Design session?"
      :message="pendingRemovalMessage"
      confirm-label="Remove session"
      busy-label="Removing…"
      cancel-label="Keep session"
      :busy="removingIndex !== null"
      danger
      @cancel="pendingRemovalIndex = null"
      @confirm="confirmSavedScenarioRemoval"
    />
  </div>
</template>
