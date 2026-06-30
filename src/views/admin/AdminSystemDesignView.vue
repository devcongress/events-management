<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { isSystemDesignSessionItem, systemDesignDisplayTitle } from '@/lib/system-design';
import { adminPath } from '@/src/admin-routes';
import { notify } from '@/src/lib/notify';
import type { Event as CommunityEvent, PublicMeetupScheduleItem } from '@/types';

type SystemDesignDraft = {
  time: string;
  title: string;
  lead: string;
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
const editing = ref(false);
const error = ref('');
const saveError = ref('');

const overviewPath = computed(() => adminPath(`events/${route.params.eventId}`));
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
const hasSavedDrafts = computed(() => systemDesignSessions.value.some((item) => (
  item.type === 'system_design'
  || Boolean(item.system_design_title?.trim())
  || Boolean(item.description?.trim())
  || Boolean(item.resources[0]?.url?.trim())
  || Boolean(item.lead?.trim())
)));
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
    lead: session?.lead ?? '',
    description: session?.description ?? '',
    promptUrl: promptResource?.url ?? '',
  };
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
      throw new Error('Add a scenario title before saving.');
    }
    if (promptUrl && !URL.canParse(promptUrl)) {
      throw new Error('Use a valid URL for the system design prompt.');
    }

    return [{
      time: time || 'TBD',
      title,
      type: 'system_design',
      lead: draft.lead.trim() || null,
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
  const facilitator = draft.lead.trim();
  const promptUrl = draft.promptUrl.trim();
  const subject = title
    ? `${title} is the monthly architecture scenario for this meetup.`
    : 'This monthly system design session uses the linked prompt deck as its architecture scenario.';
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

function generateDraftDescription(draft: SystemDesignDraft) {
  if (generatingIndex.value !== null) return;

  if (!draft.title.trim() && !draft.promptUrl.trim()) {
    notify.error('Add a scenario title or prompt URL before generating a draft.');
    return;
  }

  if (!draft.promptUrl.trim()) {
    draft.description = generatedDraftDescription(draft);
    notify.success('Draft generated from the scenario details.');
    return;
  }
}

async function generateDraftFromPrompt(draft: SystemDesignDraft, index: number) {
  if (generatingIndex.value !== null) return;

  const promptUrl = draft.promptUrl.trim();
  if (!promptUrl) {
    generateDraftDescription(draft);
    return;
  }

  generatingIndex.value = index;

  try {
    const response = await fetch(`/api/events/${route.params.eventId}/system-design/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt_url: promptUrl,
        title: draft.title.trim() || undefined,
        lead: draft.lead.trim() || undefined,
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

    notify.success('Draft generated from the prompt deck.');
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Unable to generate a draft from this prompt deck.';
    notify.error(message);
  } finally {
    generatingIndex.value = null;
  }
}

async function saveSystemDesign() {
  if (!event.value || saving.value) return;

  let systemDesignItems: PublicMeetupScheduleItem[];
  try {
    systemDesignItems = normalizeDrafts();
  } catch (caught) {
    saveError.value = caught instanceof Error ? caught.message : 'Check the system design details.';
    return;
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
    notify.success(systemDesignItems.length > 0 ? 'System design notes saved' : 'System design section cleared');
  } catch (caught) {
    saveError.value = caught instanceof Error ? caught.message : 'Unable to save system design notes';
    notify.error(saveError.value);
  } finally {
    saving.value = false;
  }
}

async function removeSavedScenario(index: number) {
  if (!event.value || mutatingDrafts.value) return;

  const scenario = systemDesignSessions.value[index];
  if (!scenario) return;

  const confirmed = window.confirm(`Remove "${systemDesignDisplayTitle(scenario)}" from the saved monthly system design section?`);
  if (!confirmed) return;

  removingIndex.value = index;
  saveError.value = '';

  try {
    const remainingItems = systemDesignSessions.value.filter((_, itemIndex) => itemIndex !== index);
    const response = await fetch(`/api/events/${route.params.eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule: mergeSystemDesignSchedule(remainingItems) }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error ?? 'Unable to remove this system design scenario');
    }

    event.value = payload;
    syncDrafts();
    editing.value = remainingItems.length === 0;
    notify.success(remainingItems.length > 0 ? 'Scenario removed' : 'System design section removed');
  } catch (caught) {
    saveError.value = caught instanceof Error ? caught.message : 'Unable to remove this system design scenario';
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
          Keep the monthly architecture scenario public-ready. Add the prompt link and a short recap so people who missed the room can still follow the discussion.
        </p>
      </section>

      <p v-if="error" class="mb-5 rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
        {{ error }}
      </p>

      <section v-if="loading" class="skeleton-panel p-6">
        <div class="skeleton-line skeleton-line--title" />
        <div class="skeleton-line mt-4 w-2/3" />
        <div class="skeleton-line mt-3 w-1/2" />
      </section>

      <section v-else-if="!editing && hasSavedDrafts" class="grid gap-5">
        <article class="editorial-panel p-6 sm:p-8">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p class="editorial-eyebrow">saved artifact</p>
              <h2 class="mt-2 text-2xl font-black tracking-tight text-dc-ink">Monthly system design is saved</h2>
              <p class="mt-2 max-w-3xl text-sm leading-6 text-dc-gray">
                {{ systemDesignSessions.length }} scenario{{ systemDesignSessions.length === 1 ? '' : 's' }} saved for this event. Use edit when you want to revise the recap, swap the prompt deck, or add another scenario.
              </p>
            </div>
            <div class="flex flex-col gap-3 sm:flex-row">
              <button type="button" class="editorial-action" :disabled="mutatingDrafts" @click="startEditing">
                Edit scenario{{ systemDesignSessions.length === 1 ? '' : 's' }}
              </button>
              <button type="button" class="editorial-secondary-action" :disabled="mutatingDrafts" @click="addScenarioFromSavedState">
                Add Scenario
              </button>
            </div>
          </div>
        </article>

        <article
          v-for="(item, index) in systemDesignSessions"
          :key="`${item.time}-${item.title}-${index}`"
          class="editorial-panel p-6 sm:p-8"
        >
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="min-w-0">
              <p class="editorial-eyebrow">scenario {{ index + 1 }}</p>
              <component
                :is="item.resources[0] ? 'a' : 'h2'"
                v-bind="item.resources[0] ? {
                  href: item.resources[0].url,
                  target: '_blank',
                  rel: 'noopener noreferrer',
                } : {}"
                class="mt-3 block w-fit text-2xl font-black tracking-tight text-dc-ink"
                :class="item.resources[0] ? 'border-b-2 border-dc-pink/30 transition-colors hover:border-dc-ink' : ''"
              >
                {{ systemDesignDisplayTitle(item) }}
              </component>
              <p v-if="item.lead" class="mt-2 text-sm font-semibold text-dc-gray">
                Facilitated by {{ item.lead }}
              </p>
              <p v-if="item.time" class="mt-2 font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">
                {{ item.time }}
              </p>
            </div>

            <div class="flex flex-col gap-3 sm:flex-row">
              <button type="button" class="editorial-secondary-action" :disabled="mutatingDrafts" @click="startEditing">
                Edit
              </button>
              <button
                type="button"
                class="font-mono text-xs font-bold uppercase tracking-wide text-red-600 hover:text-red-700"
                :disabled="mutatingDrafts"
                @click="removeSavedScenario(index)"
              >
                {{ removingIndex === index ? 'REMOVING...' : 'Remove' }}
              </button>
            </div>
          </div>

          <p v-if="item.description" class="mt-5 max-w-4xl whitespace-pre-line text-base leading-8 text-dc-gray">
            {{ item.description }}
          </p>
        </article>

        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <RouterLink :to="overviewPath" class="font-mono text-xs font-bold uppercase tracking-wide text-dc-gray hover:text-dc-ink">
            Edit full program outline
          </RouterLink>
        </div>

        <p v-if="saveError" class="rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {{ saveError }}
        </p>
      </section>

      <form v-else class="grid gap-5" @submit.prevent="saveSystemDesign">
        <article
          v-for="(draft, index) in drafts"
          :key="index"
          class="editorial-panel p-6 sm:p-8"
        >
          <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p class="editorial-eyebrow">scenario {{ index + 1 }}</p>
              <h2 class="mt-2 text-2xl font-black tracking-tight text-dc-ink">Monthly system design artifact</h2>
            </div>
            <button
              v-if="drafts.length > 1"
              type="button"
              class="font-mono text-xs font-bold uppercase tracking-wide text-red-600 hover:text-red-700"
              :disabled="mutatingDrafts"
              @click="removeDraft(index)"
            >
              Remove
            </button>
          </div>

          <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <label>
              <span class="editorial-label">Scenario title</span>
              <input
                v-model="draft.title"
                class="editorial-input mt-2"
                placeholder="Design a resilient ticketing queue"
              />
            </label>
            <label>
              <span class="editorial-label">Expert / facilitator</span>
              <input
                v-model="draft.lead"
                class="editorial-input mt-2"
                placeholder="Optional"
              />
            </label>
          </div>

          <label class="mt-4 block">
            <span class="editorial-label">Prompt URL</span>
            <input
              v-model="draft.promptUrl"
              class="editorial-input mt-2"
              placeholder="https://docs.google.com/presentation/d/..."
            />
          </label>

          <label class="mt-4 block">
            <span class="editorial-label">Public scenario / recap notes</span>
            <textarea
              v-model="draft.description"
              class="system-design-notes-textarea mt-2"
              placeholder="Generate a draft from the prompt deck, then replace it after the meetup with what the room actually discussed."
            />
          </label>
          <button
            type="button"
            class="editorial-secondary-action mt-3 w-full"
            :disabled="mutatingDrafts"
            @click="generateDraftFromPrompt(draft, index)"
          >
            {{ generatingIndex === index ? 'GENERATING...' : 'GENERATE DRAFT' }}
          </button>
        </article>

        <p v-if="saveError" class="rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {{ saveError }}
        </p>

        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button type="submit" class="editorial-action" :disabled="mutatingDrafts">
            {{ saving ? 'SAVING...' : 'SAVE SYSTEM DESIGN' }}
          </button>
          <button type="button" class="editorial-secondary-action" :disabled="mutatingDrafts" @click="addDraft">
            Add Scenario
          </button>
          <button v-if="hasSavedDrafts" type="button" class="editorial-secondary-action" :disabled="mutatingDrafts" @click="cancelEditing">
            Cancel
          </button>
          <RouterLink :to="overviewPath" class="font-mono text-xs font-bold uppercase tracking-wide text-dc-gray hover:text-dc-ink">
            Edit full program outline
          </RouterLink>
        </div>
      </form>
    </div>
  </div>
</template>
