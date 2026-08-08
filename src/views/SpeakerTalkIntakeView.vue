<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
  SPEAKER_ARCHIVE_ABSTRACT_MAX_CHARACTERS,
  SPEAKER_ARCHIVE_BIO_MAX_CHARACTERS,
} from '@/lib/speaker-intake-limits';
import AppDropdown from '@/src/components/AppDropdown.vue';
import SpeakerTalkIntakePageSkeleton from '@/src/components/ui/page-skeletons/SpeakerTalkIntakePageSkeleton.vue';
import type { ArchiveItemKind, ArchiveMaterialField, Event, SpeakerIntakeLinkPurpose } from '@/types';

type IntakeEvent = Pick<Event, 'id' | 'name' | 'event_date' | 'status'>;
type IntakePrefill = {
  speaker_name?: string;
  speaker_email?: string;
  title?: string;
  topic?: string;
  abstract?: string;
  bio?: string;
  slides_url?: string;
};

const route = useRoute();
const event = ref<IntakeEvent | null>(null);
const linkPurpose = ref<SpeakerIntakeLinkPurpose>('archive_backfill');
const archiveItemKind = ref<ArchiveItemKind>('talk');
const requestedFields = ref<ArchiveMaterialField[]>([]);
const loading = ref(true);
const submitting = ref(false);
const submitted = ref(false);
const unavailableMessage = ref<string | null>(null);
const error = ref<string | null>(null);
const popularTopics = [
  'Frontend Engineering',
  'Backend Engineering',
  'Cloud Infrastructure',
  'DevOps',
  'AI/ML',
  'Data Engineering',
  'Security',
  'Open Source',
  'Product Engineering',
  'Career Growth',
];
const form = reactive({
  speaker_name: '',
  speaker_email: '',
  title: '',
  topic: '',
  abstract: '',
  bio: '',
  slides_url: '',
});
const topicOptions = computed(() => {
  const baseOptions = [
    { value: '', label: 'General' },
    ...popularTopics.map((topic) => ({ value: topic, label: topic })),
  ];
  const currentTopic = form.topic.trim();

  if (currentTopic && !popularTopics.includes(currentTopic)) {
    return [
      ...baseOptions,
      { value: currentTopic, label: currentTopic },
    ];
  }

  return baseOptions;
});

function isSelectedSpeakerLink() {
  return linkPurpose.value === 'selected_speaker_confirmation';
}

function isMaterialsFollowUpLink() {
  return linkPurpose.value === 'archive_materials_follow_up';
}

function requestsField(field: ArchiveMaterialField) {
  return requestedFields.value.includes(field);
}

function isProductDemo() {
  return archiveItemKind.value === 'product_demo';
}

function archiveItemLabel() {
  return isProductDemo() ? 'Product demo' : 'Talk';
}

function presenterLabel() {
  return isProductDemo() ? 'Presenter' : 'Speaker';
}

function resourceLabel() {
  return isProductDemo() ? 'Demo or product URL' : 'Slides URL';
}

function archiveHeading() {
  if (isSelectedSpeakerLink()) {
    return 'Complete Your Speaker Details';
  }

  if (isMaterialsFollowUpLink()) return 'Complete Your Archive Details';

  return isProductDemo() ? 'Share Product Demo Details' : 'Share Talk Details';
}

function archiveDescription() {
  if (isSelectedSpeakerLink()) {
    return 'Add a short bio and any resource link you have. You can leave the resource link blank if it is not ready yet.';
  }

  if (isMaterialsFollowUpLink()) {
    return 'Share the details requested below so we can complete the archive record for your presentation.';
  }

  return isProductDemo()
    ? 'Your demo title is set. Add the remaining details to the DevCongress archive.'
    : 'Your talk title is set. Add the remaining details to the DevCongress archive.';
}

function displayEventName() {
  const fullName = event.value?.name.trim() ?? '';
  return fullName || 'this event';
}

function displayEventDate() {
  if (!event.value?.event_date) return '';

  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(event.value.event_date));
}

async function submitTalkDetails() {
  submitting.value = true;
  error.value = null;
  const payload = isSelectedSpeakerLink()
    ? { topic: form.topic, bio: form.bio, slides_url: form.slides_url }
    : isMaterialsFollowUpLink()
      ? Object.fromEntries(requestedFields.value.map((field) => [field, form[field]]))
    : {
      topic: form.topic,
      abstract: form.abstract,
      bio: form.bio,
      slides_url: form.slides_url,
    };

  try {
    const response = await fetch(`/api/events/${route.params.eventId}/speaker-intake/${route.params.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      submitted.value = true;
    } else {
      const data = await response.json();
      error.value = data.error || `The ${archiveItemLabel().toLowerCase()} details could not be submitted.`;
    }
  } catch {
    error.value = `The ${archiveItemLabel().toLowerCase()} details could not be submitted. Check your connection and try again.`;
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  try {
    const response = await fetch(`/api/events/${route.params.eventId}/speaker-intake/${route.params.token}`);
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      event.value = data.event;
      linkPurpose.value = data.link?.purpose ?? 'archive_backfill';
      archiveItemKind.value = data.link?.kind === 'product_demo' ? 'product_demo' : 'talk';
      requestedFields.value = Array.isArray(data.link?.requested_fields)
        ? data.link.requested_fields.filter((field: unknown): field is ArchiveMaterialField => (
          field === 'abstract' || field === 'bio' || field === 'slides_url'
        ))
        : [];
      applyPrefill(data.prefill ?? {});
    } else {
      unavailableMessage.value = data.error || 'This archive form link is no longer available.';
    }
  } finally {
    loading.value = false;
  }
});

function applyPrefill(prefill: IntakePrefill) {
  form.speaker_name = prefill.speaker_name || form.speaker_name;
  form.speaker_email = prefill.speaker_email || form.speaker_email;
  form.title = prefill.title || form.title;
  form.topic = prefill.topic || form.topic;
  form.abstract = prefill.abstract || form.abstract;
  form.bio = prefill.bio || form.bio;
  form.slides_url = prefill.slides_url || form.slides_url;
}
</script>

<template>
  <div class="min-h-full bg-dc-cream text-dc-ink">
    <div v-if="loading" class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <SpeakerTalkIntakePageSkeleton />
    </div>

    <div v-else-if="unavailableMessage" class="flex min-h-full items-center justify-center p-4">
      <div class="w-full max-w-md rounded-lg border-2 border-dc-ink bg-dc-paper p-8 text-center shadow-[3px_3px_0_#111111]">
        <h2 class="mb-3 text-2xl font-bold text-dc-ink">Link closed</h2>
        <p class="text-dc-gray">{{ unavailableMessage }}</p>
        <p class="mt-4 text-sm text-dc-gray">You can close this tab.</p>
      </div>
    </div>

    <div v-else-if="!event" class="flex min-h-full items-center justify-center p-4 text-center">
      <p class="font-mono text-dc-ink">EVENT NOT FOUND</p>
    </div>

    <div v-else-if="submitted" class="flex min-h-full items-center justify-center p-4">
      <div class="w-full max-w-md rounded-lg border-2 border-dc-ink bg-dc-paper p-8 text-center shadow-[3px_3px_0_#111111]">
        <div class="mb-6 font-mono text-6xl font-bold text-dc-pink">OK</div>
        <h2 class="mb-4 text-3xl font-bold text-dc-ink">Received</h2>
        <p class="mb-6 text-dc-gray">
          {{
            isSelectedSpeakerLink()
              ? isProductDemo()
                ? 'Your demo link has been sent to the organizers. This link is now closed.'
                : 'Your slides link has been sent to the organizers. This link is now closed.'
              : isMaterialsFollowUpLink()
                ? 'Your archive details have been updated. This link is now closed.'
              : isProductDemo()
                ? 'Your product demo details have been sent to the organizers. This link is now closed.'
                : 'Your talk details have been sent to the organizers. This link is now closed.'
          }}
        </p>
        <p class="text-sm text-dc-gray">You can close this tab.</p>
      </div>
    </div>

    <div v-else class="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <header class="mb-5 sm:mb-6">
        <img
          src="/brand/dev-con-logo.png"
          alt="DevCongress"
          class="mb-5 h-auto w-40 max-w-[56vw] sm:w-48"
        >
        <h1 class="max-w-3xl text-3xl font-bold leading-none tracking-tight text-dc-ink sm:text-4xl">
          {{ archiveHeading() }}
        </h1>
        <p class="mt-2 max-w-3xl text-sm font-medium leading-5 text-dc-gray sm:text-base">
          {{ displayEventName() }}<span v-if="displayEventDate()"> · {{ displayEventDate() }}</span>
        </p>
        <p class="mt-3 max-w-xl text-sm leading-5 text-dc-gray sm:text-base">
          {{ archiveDescription() }}
        </p>
      </header>

      <form class="speaker-intake-form space-y-6 border-t border-dc-border pt-6" @submit.prevent="submitTalkDetails">
        <div v-if="error" class="rounded-md border-2 border-red-700 bg-red-100 p-4 font-mono text-sm text-red-800">{{ error }}</div>

        <div v-if="isSelectedSpeakerLink() || isMaterialsFollowUpLink()" class="border-l-4 border-dc-yellow pl-4">
          <p class="editorial-label">{{ isMaterialsFollowUpLink() ? 'Archive follow-up' : `Selected ${archiveItemLabel()}` }}</p>
          <h2 class="text-xl font-bold tracking-tight text-dc-ink">{{ form.title }}</h2>
          <p class="mt-2 font-mono text-xs font-semibold uppercase tracking-wide text-dc-gray">
            {{ form.speaker_name }} <span class="mx-2 text-dc-pink">/</span> {{ form.topic || 'General' }}
          </p>
          <p v-if="form.abstract" class="mt-4 text-sm leading-6 text-dc-gray">{{ form.abstract }}</p>
        </div>

        <template v-if="!isMaterialsFollowUpLink()">
          <div class="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(12rem,1fr)]">
            <label v-if="!isSelectedSpeakerLink()" class="block">
              <span class="mb-2 flex items-center justify-between gap-3">
                <span class="editorial-label !mb-0">{{ archiveItemLabel() }} title</span>
                <span class="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-gray">Locked</span>
              </span>
              <input
                v-model="form.title"
                readonly
                aria-readonly="true"
                class="speaker-intake-readonly editorial-input"
              />
            </label>
            <AppDropdown
              v-model="form.topic"
              label="Topic"
              :options="topicOptions"
              menu-class="speaker-intake-topic-menu"
            />
          </div>

          <div class="grid min-w-0 gap-4 lg:grid-cols-2">
            <label class="block min-w-0">
              <span class="mb-2 flex items-end justify-between gap-3">
                <span class="editorial-label !mb-0">{{ isProductDemo() ? 'Demo summary' : 'Abstract' }}</span>
                <span id="speaker-archive-abstract-count" class="font-mono text-[11px] font-semibold tabular-nums text-dc-gray">
                  {{ form.abstract.length }} / {{ SPEAKER_ARCHIVE_ABSTRACT_MAX_CHARACTERS }}
                  <span class="sr-only">characters</span>
                </span>
              </span>
              <textarea
                v-model="form.abstract"
                rows="4"
                :maxlength="SPEAKER_ARCHIVE_ABSTRACT_MAX_CHARACTERS"
                aria-describedby="speaker-archive-abstract-count"
                class="editorial-input h-28 resize-none overflow-y-auto"
              />
            </label>

            <label class="block min-w-0">
              <span class="mb-2 flex items-end justify-between gap-3">
                <span class="editorial-label !mb-0">{{ presenterLabel() }} bio<span v-if="isSelectedSpeakerLink()"> *</span></span>
                <span id="speaker-archive-bio-count" class="font-mono text-[11px] font-semibold tabular-nums text-dc-gray">
                  {{ form.bio.length }} / {{ SPEAKER_ARCHIVE_BIO_MAX_CHARACTERS }}
                  <span class="sr-only">characters</span>
                </span>
              </span>
              <textarea
                v-model="form.bio"
                :required="isSelectedSpeakerLink()"
                rows="4"
                :maxlength="SPEAKER_ARCHIVE_BIO_MAX_CHARACTERS"
                aria-describedby="speaker-archive-bio-count"
                class="editorial-input h-28 resize-none overflow-y-auto"
              />
            </label>
          </div>
        </template>

        <template v-if="isMaterialsFollowUpLink()">
          <div v-if="requestsField('abstract')" class="block min-w-0">
            <span class="mb-2 flex items-end justify-between gap-3">
              <span class="editorial-label !mb-0">{{ isProductDemo() ? 'Demo summary' : 'Abstract' }} *</span>
              <span id="speaker-archive-abstract-count" class="font-mono text-[11px] font-semibold tabular-nums text-dc-gray">{{ form.abstract.length }} / {{ SPEAKER_ARCHIVE_ABSTRACT_MAX_CHARACTERS }}<span class="sr-only">characters</span></span>
            </span>
            <textarea v-model="form.abstract" required rows="4" :maxlength="SPEAKER_ARCHIVE_ABSTRACT_MAX_CHARACTERS" aria-describedby="speaker-archive-abstract-count" class="editorial-input h-28 resize-none overflow-y-auto" />
          </div>
          <div v-if="requestsField('bio')" class="block min-w-0">
            <span class="mb-2 flex items-end justify-between gap-3">
              <span class="editorial-label !mb-0">{{ presenterLabel() }} bio *</span>
              <span id="speaker-archive-bio-count" class="font-mono text-[11px] font-semibold tabular-nums text-dc-gray">{{ form.bio.length }} / {{ SPEAKER_ARCHIVE_BIO_MAX_CHARACTERS }}<span class="sr-only">characters</span></span>
            </span>
            <textarea v-model="form.bio" required rows="4" :maxlength="SPEAKER_ARCHIVE_BIO_MAX_CHARACTERS" aria-describedby="speaker-archive-bio-count" class="editorial-input h-28 resize-none overflow-y-auto" />
          </div>
        </template>

        <div v-if="!isMaterialsFollowUpLink() || requestsField('slides_url')" class="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <label class="block min-w-0">
            <span class="editorial-label">{{ resourceLabel() }}<span v-if="isMaterialsFollowUpLink()"> *</span></span>
            <input v-model="form.slides_url" :required="isMaterialsFollowUpLink()" type="url" placeholder="https://..." class="editorial-input font-mono" />
          </label>

          <button type="submit" :disabled="submitting" class="speaker-intake-submit motion-press w-full rounded-lg border border-dc-ink bg-dc-pink px-5 py-3 font-mono text-sm font-semibold uppercase tracking-wide text-white shadow-[2px_2px_0_#111111] disabled:cursor-not-allowed disabled:opacity-50 lg:min-w-56">
            {{
              submitting
                ? 'SUBMITTING...'
                : isMaterialsFollowUpLink()
                  ? 'SEND ARCHIVE DETAILS'
                  : isSelectedSpeakerLink()
                  ? 'SEND DETAILS'
                  : isProductDemo()
                    ? 'SEND PRODUCT DEMO DETAILS'
                    : 'SEND TALK DETAILS'
            }}
          </button>
        </div>
        <div v-else class="flex justify-end">
          <button type="submit" :disabled="submitting" class="speaker-intake-submit motion-press w-full rounded-lg border border-dc-ink bg-dc-pink px-5 py-3 font-mono text-sm font-semibold uppercase tracking-wide text-white shadow-[2px_2px_0_#111111] disabled:cursor-not-allowed disabled:opacity-50 lg:min-w-56 lg:w-auto">
            {{ submitting ? 'SUBMITTING...' : 'SEND ARCHIVE DETAILS' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.speaker-intake-form :deep(.editorial-label) {
  color: #555555;
  font-size: 0.68rem;
  letter-spacing: 0.12em;
}

.speaker-intake-form :deep(.editorial-input),
.speaker-intake-form :deep(button[aria-haspopup='listbox']) {
  min-height: 3.1rem;
  border-width: 1px;
  border-color: #c9c5bc;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 1px 0 rgba(17, 17, 17, 0.06);
}

.speaker-intake-form :deep(.editorial-input:focus),
.speaker-intake-form :deep(button[aria-haspopup='listbox']:focus),
.speaker-intake-form :deep(button[aria-haspopup='listbox'][aria-expanded='true']) {
  border-color: #111111;
  box-shadow: 0 0 0 3px rgba(17, 17, 17, 0.12);
}

.speaker-intake-form :deep(.speaker-intake-topic-menu .app-dropdown-scroll) {
  max-height: min(16rem, calc(100svh - 12rem));
}

.speaker-intake-form :deep(.speaker-intake-topic-menu [role='option'][aria-selected='true']) {
  background: rgba(232, 17, 127, 0.08);
  color: #111111;
}

.speaker-intake-form :deep(.speaker-intake-topic-menu [role='option'][aria-selected='true'] svg) {
  color: #e8117f;
}

.speaker-intake-form :deep(.speaker-intake-readonly) {
  cursor: default;
  background: #f8f5ed;
  color: #333333;
}

.speaker-intake-form :deep(.speaker-intake-readonly:focus) {
  border-color: #c9c5bc;
  box-shadow: 0 1px 0 rgba(17, 17, 17, 0.06);
}

.speaker-intake-submit {
  min-height: 3rem;
}
</style>
