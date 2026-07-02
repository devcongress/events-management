<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AdminTalksPageSkeleton from '@/src/components/ui/page-skeletons/AdminTalksPageSkeleton.vue';
import { notify } from '@/src/lib/notify';
import type { Talk, TalkStatus } from '@/types';

const route = useRoute();
const talks = ref<Talk[]>([]);
const loading = ref(true);
const addingTalk = ref(false);
const creatingSpeakerLink = ref(false);
const speakerFormEnabled = ref(true);
const speakerLinkExpiresInDays = ref(7);
const generatedSpeakerIntakePath = ref('');
const generatedSpeakerLinkExpiresAt = ref<string | null>(null);
const generatedSpeakerLinkMonth = ref<string | null>(null);
const error = ref<string | null>(null);
const groups: { label: string; statuses: TalkStatus[] }[] = [
  { label: 'Pending review', statuses: ['submitted'] },
  { label: 'Accepted', statuses: ['accepted', 'slides_received'] },
  { label: 'Published', statuses: ['published'] },
  { label: 'Rejected', statuses: ['rejected'] },
];
const manualTalkForm = reactive({
  speaker_name: '',
  speaker_email: '',
  github_username: '',
  title: '',
  topic: '',
  abstract: '',
  bio: '',
  slides_url: '',
  publish: false,
});

const groupedTalks = computed(() => groups.map((group) => ({
  ...group,
  talks: talks.value.filter((talk) => group.statuses.includes(talk.status)),
})));
const manualEntryEnabled = computed(() => !speakerFormEnabled.value);
const speakerLinkExpiryOptions = [3, 7, 14, 31].map((days) => ({
  value: days,
  label: `${days} days`,
}));
const generatedSpeakerIntakeUrl = computed(() => {
  if (!generatedSpeakerIntakePath.value) return '';
  if (typeof window === 'undefined') return generatedSpeakerIntakePath.value;
  return new URL(generatedSpeakerIntakePath.value, window.location.origin).toString();
});

async function fetchTalks() {
  const response = await fetch(`/api/events/${route.params.eventId}/talks`);
  if (response.ok) talks.value = await response.json();
  loading.value = false;
}

function resetManualTalkForm() {
  manualTalkForm.speaker_name = '';
  manualTalkForm.speaker_email = '';
  manualTalkForm.github_username = '';
  manualTalkForm.title = '';
  manualTalkForm.topic = '';
  manualTalkForm.abstract = '';
  manualTalkForm.bio = '';
  manualTalkForm.slides_url = '';
  manualTalkForm.publish = false;
}

async function addManualTalk() {
  if (!manualEntryEnabled.value) return;

  addingTalk.value = true;
  error.value = null;

  const shouldPublish = manualTalkForm.publish;
  try {
    const response = await fetch(`/api/events/${route.params.eventId}/talks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(manualTalkForm),
    });

    if (response.ok) {
      resetManualTalkForm();
      await fetchTalks();
      notify.success(shouldPublish ? 'Talk published to the archive.' : 'Talk added to the program.');
    } else {
      const data = await response.json();
      error.value = data.error || 'Failed to add talk';
    }
  } catch {
    error.value = 'Failed to add talk';
  } finally {
    addingTalk.value = false;
  }
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

async function generateSpeakerIntakeLink() {
  if (!speakerFormEnabled.value) return;

  creatingSpeakerLink.value = true;
  error.value = null;

  try {
    const response = await fetch(`/api/events/${route.params.eventId}/speaker-intake-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expires_in_days: speakerLinkExpiresInDays.value }),
    });
    const data = await response.json();

    if (response.ok) {
      generatedSpeakerIntakePath.value = `/speaker-talks/${route.params.eventId}/${data.token}`;
      generatedSpeakerLinkExpiresAt.value = data.link?.expires_at ?? null;
      generatedSpeakerLinkMonth.value = data.link?.event_month ?? null;
      notify.success('One-time speaker link generated.');
    } else {
      error.value = data.error || 'Could not generate speaker form link.';
    }
  } catch {
    error.value = 'Could not generate speaker form link.';
  } finally {
    creatingSpeakerLink.value = false;
  }
}

async function copySpeakerIntakeLink() {
  if (!speakerFormEnabled.value || !generatedSpeakerIntakeUrl.value) return;

  error.value = null;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(generatedSpeakerIntakeUrl.value);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = generatedSpeakerIntakeUrl.value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }

    notify.success('Speaker form link copied.');
  } catch {
    error.value = 'Could not copy the speaker form link.';
  }
}

async function setStatus(talkId: string, status: TalkStatus) {
  error.value = null;
  const response = await fetch(`/api/talks/${talkId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (response.ok) {
    await fetchTalks();
  } else {
    const data = await response.json();
    error.value = data.error || 'Failed to update talk';
  }
}

async function sendReminder(talkId: string) {
  error.value = null;

  const response = await fetch(`/api/talks/${talkId}/reminder`, { method: 'POST' });
  if (response.ok) {
    notify.success('Reminder logged for speaker follow-up.');
    await fetchTalks();
  } else {
    const data = await response.json();
    error.value = data.error || 'Failed to send reminder';
  }
}

function slideLabel(talk: Talk): string {
  if (talk.slides_uploaded_at) {
    return `Slides received ${new Date(talk.slides_uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }

  if (talk.status === 'accepted') {
    return talk.reminder_sent_count > 0
      ? `${talk.reminder_sent_count} reminder${talk.reminder_sent_count === 1 ? '' : 's'} sent`
      : 'Needs slides';
  }

  if (talk.status === 'published') {
    return 'No slides link';
  }

  return 'Slides not required yet';
}

function slidesLink(talk: Talk): string | null {
  if (talk.slides_type === 'file' && talk.storage_path) return talk.storage_path;
  if (talk.slides_url) return talk.slides_url;
  return null;
}

function actionClass(isPrimary = false): string {
  return isPrimary
    ? 'motion-press rounded-md border-2 border-dc-ink bg-dc-yellow px-4 py-2 font-mono text-xs font-bold uppercase tracking-wide text-dc-ink shadow-[2px_2px_0_#111111] disabled:opacity-40'
    : 'motion-press rounded-md border-2 border-dc-border bg-dc-paper px-4 py-2 font-mono text-xs font-bold uppercase tracking-wide text-dc-gray hover:border-dc-ink hover:text-dc-ink disabled:opacity-40';
}

function toggleSpeakerForm() {
  speakerFormEnabled.value = !speakerFormEnabled.value;
  error.value = null;
}

onMounted(fetchTalks);
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <div class="editorial-header">
        <p class="editorial-eyebrow">program desk</p>
        <h1 class="editorial-title">Talk Management</h1>
        <p class="editorial-subtitle">Review submissions, accept speakers, and publish talks into the public archive.</p>
      </div>

      <div v-if="error" class="mb-4 rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{{ error }}</div>

      <AdminTalksPageSkeleton v-if="loading" />
      <template v-else>
        <section class="ops-panel mb-8 p-5">
          <div class="mb-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.7fr)]">
            <div>
              <p class="ops-label">manual entry</p>
              <h2 class="mt-1 text-2xl font-black tracking-tight text-dc-ink">Add Talk</h2>
              <p class="mt-2 max-w-xl text-sm leading-6 text-dc-gray">Backfill confirmed or past talks yourself, with slides now or later.</p>
              <div v-if="!manualEntryEnabled" class="mt-5 rounded-md border border-dc-border bg-dc-paper-warm px-4 py-3">
                <p class="font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">Manual entry disabled</p>
                <p class="mt-1 text-sm leading-6 text-dc-gray">Turn off the speaker form to enter talk details yourself.</p>
              </div>
            </div>
            <div class="border-t border-dc-border pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0" :class="{ 'opacity-55': !speakerFormEnabled }">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="ops-label">speaker form</p>
                  <h3 class="mt-1 text-lg font-black tracking-tight text-dc-ink">Send a one-time link</h3>
                </div>
                <label class="motion-press flex shrink-0 cursor-pointer items-center gap-2 rounded-md border border-dc-border bg-dc-paper px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">
                  <input :checked="speakerFormEnabled" type="checkbox" class="size-4 accent-dc-pink" @change="toggleSpeakerForm" />
                  <span>{{ speakerFormEnabled ? 'On' : 'Off' }}</span>
                </label>
              </div>
              <p class="mt-2 text-sm leading-6 text-dc-gray">Generate a month-specific link for one speaker. It expires and closes after one successful submission.</p>

              <div class="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <AppDropdown
                  :model-value="speakerLinkExpiresInDays"
                  label="Valid for"
                  :options="speakerLinkExpiryOptions"
                  :disabled="!speakerFormEnabled"
                  density="compact"
                  menu-class="min-w-40"
                  @update:model-value="speakerLinkExpiresInDays = Number($event)"
                />
                <button type="button" :disabled="!speakerFormEnabled || creatingSpeakerLink" class="editorial-secondary-action self-end px-4 py-3 text-xs" @click="generateSpeakerIntakeLink">
                  {{ creatingSpeakerLink ? 'Generating...' : 'Generate link' }}
                </button>
              </div>

              <div v-if="generatedSpeakerIntakeUrl" class="mt-4 rounded-md border border-dc-border bg-dc-paper-warm p-3">
                <p class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">
                  {{ generatedSpeakerLinkMonth ? `Month ${generatedSpeakerLinkMonth}` : 'One-time link' }}
                  <span v-if="generatedSpeakerLinkExpiresAt"> / Expires {{ formatDateTime(generatedSpeakerLinkExpiresAt) }}</span>
                </p>
                <input :value="generatedSpeakerIntakeUrl" readonly :disabled="!speakerFormEnabled" class="editorial-input mt-3 font-mono text-sm disabled:cursor-not-allowed disabled:opacity-55" />
                <div class="mt-3 flex flex-wrap gap-2">
                  <button type="button" :disabled="!speakerFormEnabled" :class="actionClass()" @click="copySpeakerIntakeLink">
                    Copy link
                  </button>
                  <a v-if="speakerFormEnabled" :href="generatedSpeakerIntakePath" target="_blank" rel="noopener noreferrer" :class="actionClass()">Open form</a>
                </div>
              </div>
            </div>
          </div>

          <Transition name="manual-rollup">
            <form v-show="manualEntryEnabled" class="manual-entry-form" @submit.prevent="addManualTalk">
              <div class="manual-rollup-inner">
                <fieldset :disabled="!manualEntryEnabled || addingTalk" class="space-y-4">
                  <div class="grid gap-4 md:grid-cols-2">
                    <label class="block">
                      <span class="mb-2 block font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">Speaker name</span>
                      <input v-model="manualTalkForm.speaker_name" required placeholder="Speaker Name" class="editorial-input font-mono disabled:cursor-not-allowed disabled:opacity-55" />
                    </label>
                    <label class="block">
                      <span class="mb-2 block font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">Speaker email</span>
                      <input v-model="manualTalkForm.speaker_email" required type="email" placeholder="speaker@example.com" class="editorial-input font-mono disabled:cursor-not-allowed disabled:opacity-55" />
                    </label>
                  </div>

                  <div class="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(12rem,1fr)]">
                    <label class="block">
                      <span class="mb-2 block font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">Talk title</span>
                      <input v-model="manualTalkForm.title" required placeholder="Talk title" class="editorial-input font-mono disabled:cursor-not-allowed disabled:opacity-55" />
                    </label>
                    <label class="block">
                      <span class="mb-2 block font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">Topic</span>
                      <input v-model="manualTalkForm.topic" placeholder="General" class="editorial-input font-mono disabled:cursor-not-allowed disabled:opacity-55" />
                    </label>
                  </div>

                  <label class="block">
                    <span class="mb-2 block font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">GitHub username</span>
                    <input v-model="manualTalkForm.github_username" placeholder="octocat" class="editorial-input font-mono disabled:cursor-not-allowed disabled:opacity-55" />
                  </label>

                  <div class="grid gap-4 md:grid-cols-2">
                    <label class="block">
                      <span class="mb-2 block font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">Abstract</span>
                      <textarea v-model="manualTalkForm.abstract" rows="3" class="editorial-input min-h-28 resize-y font-mono disabled:cursor-not-allowed disabled:opacity-55" />
                    </label>
                    <label class="block">
                      <span class="mb-2 block font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">Speaker bio</span>
                      <textarea v-model="manualTalkForm.bio" rows="3" class="editorial-input min-h-28 resize-y font-mono disabled:cursor-not-allowed disabled:opacity-55" />
                    </label>
                  </div>

                  <label class="block">
                    <span class="mb-2 block font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">Slides URL</span>
                    <input v-model="manualTalkForm.slides_url" type="url" placeholder="https://..." class="editorial-input font-mono disabled:cursor-not-allowed disabled:opacity-55" />
                  </label>

                  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <label class="flex items-start gap-3 text-sm font-semibold leading-6 text-dc-gray">
                      <input v-model="manualTalkForm.publish" type="checkbox" class="mt-1 size-4 shrink-0 accent-dc-pink disabled:cursor-not-allowed disabled:opacity-55" />
                      <span>Publish this talk to the archive immediately</span>
                    </label>
                    <button type="submit" :disabled="!manualEntryEnabled || addingTalk" class="editorial-action shrink-0">
                      {{ addingTalk ? 'ADDING...' : 'ADD TALK' }}
                    </button>
                  </div>
                </fieldset>
              </div>
            </form>
          </Transition>
        </section>

        <section v-for="group in groupedTalks.filter((item) => item.talks.length > 0)" :key="group.label" class="mb-8">
          <h2 class="mb-3 flex items-center gap-3 text-lg font-black tracking-tight text-dc-ink">
            {{ group.label }}
            <span class="font-mono text-xs font-semibold text-dc-gray">({{ group.talks.length }})</span>
          </h2>
          <div class="ops-panel overflow-hidden">
            <article v-for="talk in group.talks" :key="talk.id" class="ops-row p-4">
              <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div class="min-w-0">
                  <div class="mb-2 flex flex-wrap items-center gap-2">
                    <h3 class="text-xl font-black tracking-tight text-dc-ink">{{ talk.title }}</h3>
                    <span class="rounded-md border border-dc-border bg-dc-paper-warm px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">{{ talk.status.replace('_', ' ') }}</span>
                  </div>
                  <p class="text-sm text-dc-gray">{{ talk.speaker_name }} · {{ talk.speaker_email }}</p>
                  <p v-if="talk.abstract" class="mt-3 max-w-4xl text-sm leading-6 text-dc-gray">{{ talk.abstract }}</p>
                  <p class="mt-3 font-mono text-xs uppercase tracking-wide text-dc-gray">
                    {{ talk.topic || 'General' }} <span class="mx-2 text-dc-pink">/</span> {{ slideLabel(talk) }}
                  </p>
                </div>
                <div class="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                  <a v-if="slidesLink(talk)" :href="slidesLink(talk) ?? undefined" target="_blank" rel="noopener noreferrer" :class="actionClass()">
                    Slides
                  </a>
                  <button :class="actionClass()" @click="setStatus(talk.id, 'accepted')">Accept</button>
                  <button :class="actionClass()" @click="setStatus(talk.id, 'rejected')">Reject</button>
                  <button :class="actionClass(true)" @click="setStatus(talk.id, 'published')">Publish</button>
                  <button
                    v-if="talk.status === 'accepted' && !talk.slides_uploaded_at"
                    :class="actionClass()"
                    @click="sendReminder(talk.id)"
                  >
                    Remind
                  </button>
                </div>
              </div>
            </article>
          </div>
        </section>
        <div v-if="talks.length === 0" class="editorial-panel p-12 text-center">
          <p class="font-mono text-dc-gray">No talk submissions yet</p>
        </div>
      </template>
    </div>
  </div>
</template>
