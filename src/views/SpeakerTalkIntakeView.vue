<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import CfpPageSkeleton from '@/src/components/ui/page-skeletons/CfpPageSkeleton.vue';
import type { ArchiveItemKind, Event, SpeakerIntakeLinkPurpose } from '@/types';

type IntakeEvent = Pick<Event, 'id' | 'name' | 'description' | 'event_date' | 'status'>;
type IntakePrefill = {
  speaker_name?: string;
  speaker_email?: string;
  title?: string;
  topic?: string;
  abstract?: string;
  bio?: string;
};

const route = useRoute();
const event = ref<IntakeEvent | null>(null);
const expiresAt = ref<string | null>(null);
const linkPurpose = ref<SpeakerIntakeLinkPurpose>('archive_backfill');
const archiveItemKind = ref<ArchiveItemKind>('talk');
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
    return isProductDemo() ? 'Send Your Demo Link' : 'Send Your Slides';
  }

  return isProductDemo() ? 'Share Product Demo Details' : 'Share Talk Details';
}

function archiveIntro() {
  if (isSelectedSpeakerLink()) {
    return isProductDemo()
      ? 'The organizers already have your selected demo details. Add the public product or demo link to complete the archive record.'
      : 'The organizers already have your selected talk details. Add your slides link to complete the archive record.';
  }

  return isProductDemo()
    ? 'Complete the product demo record the organizers requested. Your name and email are already secured to this private link.'
    : 'Complete the talk record the organizers requested. Your name and email are already secured to this private link.';
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

async function submitTalkDetails() {
  submitting.value = true;
  error.value = null;
  const payload = isSelectedSpeakerLink()
    ? { slides_url: form.slides_url }
    : {
      title: form.title,
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
      expiresAt.value = data.link?.expires_at ?? null;
      linkPurpose.value = data.link?.purpose ?? 'archive_backfill';
      archiveItemKind.value = data.link?.kind === 'product_demo' ? 'product_demo' : 'talk';
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
}
</script>

<template>
  <div class="min-h-full bg-dc-cream text-dc-ink">
    <div v-if="loading" class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <CfpPageSkeleton />
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
              : isProductDemo()
                ? 'Your product demo details have been sent to the organizers. This link is now closed.'
                : 'Your talk details have been sent to the organizers. This link is now closed.'
          }}
        </p>
        <p class="text-sm text-dc-gray">You can close this tab.</p>
      </div>
    </div>

    <div v-else class="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <div class="editorial-header !mb-5 !pb-5">
        <p class="editorial-eyebrow">{{ isSelectedSpeakerLink() ? `selected ${archiveItemLabel()}` : `${archiveItemLabel()} archive` }}</p>
        <h1 class="editorial-title">{{ archiveHeading() }}</h1>
        <p class="editorial-subtitle">
          {{ event.name }} · {{ formatDate(event.event_date) }}
        </p>
        <p class="mt-3 max-w-2xl text-sm font-medium leading-6 text-dc-gray">{{ archiveIntro() }}</p>
      </div>

      <div
        v-if="event.description || expiresAt"
        class="mb-4 flex flex-col gap-2 rounded-lg border-2 border-dc-ink bg-dc-paper p-4 shadow-[3px_3px_0_#111111] sm:flex-row sm:items-center sm:justify-between sm:gap-6"
      >
        <p v-if="event.description" class="line-clamp-2 min-w-0 flex-1 text-sm leading-5 text-dc-gray sm:line-clamp-1">
          {{ event.description }}
        </p>
        <p v-if="expiresAt" class="shrink-0 font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-pink">
          Link expires {{ formatDateTime(expiresAt) }}
        </p>
      </div>

      <form class="editorial-panel space-y-5 p-5 sm:p-6" @submit.prevent="submitTalkDetails">
        <div v-if="error" class="rounded-md border-2 border-red-700 bg-red-100 p-4 font-mono text-sm text-red-800">{{ error }}</div>

        <div v-if="isSelectedSpeakerLink()" class="rounded-md border border-dc-border bg-dc-paper-warm p-4">
          <p class="editorial-eyebrow">Selected {{ archiveItemLabel() }}</p>
          <h2 class="mt-2 text-2xl font-bold tracking-tight text-dc-ink">{{ form.title }}</h2>
          <p class="mt-2 font-mono text-xs font-semibold uppercase tracking-wide text-dc-gray">
            {{ form.speaker_name }} <span class="mx-2 text-dc-pink">/</span> {{ form.topic || 'General' }}
          </p>
          <p v-if="form.abstract" class="mt-4 text-sm leading-6 text-dc-gray">{{ form.abstract }}</p>
        </div>

        <template v-else>
          <section class="rounded-md border border-dc-border bg-dc-paper-warm p-4">
            <p class="editorial-eyebrow">Invited {{ presenterLabel() }}</p>
            <p class="mt-2 text-xl font-bold tracking-tight text-dc-ink">{{ form.speaker_name }}</p>
            <p class="mt-1 font-mono text-xs font-semibold text-dc-gray">{{ form.speaker_email }}</p>
          </section>

          <div class="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(12rem,1fr)]">
            <label class="block">
              <span class="editorial-label">{{ archiveItemLabel() }} title *</span>
              <input v-model="form.title" required :placeholder="`${archiveItemLabel()} title`" class="editorial-input" />
            </label>
            <AppDropdown
              v-model="form.topic"
              label="Topic"
              :options="topicOptions"
              menu-class="cfp-topic-menu"
            />
          </div>

          <div class="grid min-w-0 gap-4 lg:grid-cols-2">
            <label class="block min-w-0">
              <span class="editorial-label">{{ isProductDemo() ? 'Demo summary' : 'Abstract' }}</span>
              <textarea v-model="form.abstract" rows="4" class="editorial-input min-h-28 resize-y" />
            </label>

            <label class="block min-w-0">
              <span class="editorial-label">{{ presenterLabel() }} bio</span>
              <textarea v-model="form.bio" rows="4" class="editorial-input min-h-28 resize-y" />
            </label>
          </div>
        </template>

        <div class="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <label class="block min-w-0">
            <span class="editorial-label">{{ resourceLabel() }}<span v-if="isSelectedSpeakerLink()"> *</span></span>
            <input v-model="form.slides_url" :required="isSelectedSpeakerLink()" type="url" placeholder="https://..." class="editorial-input font-mono" />
          </label>

          <button type="submit" :disabled="submitting" class="motion-press w-full rounded-md border-2 border-dc-ink bg-dc-pink px-6 py-4 font-mono text-lg font-semibold uppercase tracking-wide text-white shadow-[2px_2px_0_#111111] disabled:cursor-not-allowed disabled:opacity-50 lg:min-w-72">
            {{
              submitting
                ? 'SUBMITTING...'
                : isSelectedSpeakerLink()
                  ? isProductDemo()
                    ? 'SEND DEMO LINK'
                    : 'SEND SLIDES'
                  : isProductDemo()
                    ? 'SEND PRODUCT DEMO DETAILS'
                    : 'SEND TALK DETAILS'
            }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
