<script setup lang="ts">
import { ref } from 'vue';
import CommunityMasthead from '@/src/components/CommunityMasthead.vue';
import type { Event, Talk } from '@/types';

type TalkWithEvent = Talk & { event: Event | null };

const email = ref('');
const talks = ref<TalkWithEvent[]>([]);
const loading = ref(false);
const checked = ref(false);
const uploadTalkId = ref<string | null>(null);
const slidesUrl = ref('');
const message = ref<string | null>(null);
const error = ref<string | null>(null);

async function checkTalks() {
  loading.value = true;
  error.value = null;
  message.value = null;

  try {
    const response = await fetch(`/api/my-talks?email=${encodeURIComponent(email.value)}`);
    if (response.ok) {
      talks.value = await response.json();
      checked.value = true;
    } else {
      error.value = 'Failed to fetch talks';
    }
  } catch {
    error.value = 'Failed to fetch talks';
  } finally {
    loading.value = false;
  }
}

async function refreshTalks() {
  const response = await fetch(`/api/my-talks?email=${encodeURIComponent(email.value)}`);
  if (response.ok) {
    talks.value = await response.json();
  }
}

async function saveSlides() {
  if (!uploadTalkId.value) return;
  error.value = null;
  message.value = null;

  const response = await fetch(`/api/talks/${uploadTalkId.value}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slides_url: slidesUrl.value }),
  });

  if (response.ok) {
    message.value = 'Slides updated.';
    uploadTalkId.value = null;
    slidesUrl.value = '';
    await refreshTalks();
  } else {
    const data = await response.json();
    error.value = data.error || 'Failed to update slides';
  }
}

function slidesViewUrl(talk: Talk): string | null {
  if (talk.slides_type === 'file' && talk.storage_path) return talk.storage_path;
  if (talk.slides_type === 'url' && talk.slides_url) return talk.slides_url;
  return null;
}

function slideDeadline(talk: TalkWithEvent): string | null {
  if (!talk.event) return null;
  const deadline = new Date(talk.event.event_date);
  deadline.setDate(deadline.getDate() - 7);
  return deadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function eventHasPassed(talk: TalkWithEvent): boolean {
  if (!talk.event) return false;
  return new Date(talk.event.event_date).getTime() < Date.now();
}

function reminderCopy(talk: TalkWithEvent): string {
  if (talk.reminder_sent_count === 0) return '';
  return ` Organizers have logged ${talk.reminder_sent_count} reminder${talk.reminder_sent_count === 1 ? '' : 's'}.`;
}

function slidePrompt(talk: TalkWithEvent): string {
  if (eventHasPassed(talk)) {
    return `Share a public slide link so organizers can complete the archive.${reminderCopy(talk)}`;
  }

  return `Share a public slide link before ${slideDeadline(talk) ?? 'event week'} so organizers can publish the archive on time.${reminderCopy(talk)}`;
}

function eventDate(talk: TalkWithEvent): string | null {
  if (!talk.event) return null;
  return new Date(talk.event.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function badge(status: string) {
  const badges: Record<string, { bg: string; text: string; label: string }> = {
    submitted: { bg: 'bg-dc-paper-warm', text: 'text-dc-gray', label: 'PENDING REVIEW' },
    accepted: { bg: 'bg-green-100', text: 'text-green-800', label: 'ACCEPTED' },
    rejected: { bg: 'bg-red-100', text: 'text-red-800', label: 'REJECTED' },
    slides_received: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'SLIDES RECEIVED' },
    published: { bg: 'bg-dc-yellow', text: 'text-dc-ink', label: 'PUBLISHED' },
  };
  return badges[status] ?? badges.submitted;
}
</script>

<template>
  <div class="editorial-page my-talks-page">
    <div class="my-talks-wrap mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <CommunityMasthead
        eyebrow="speaker desk"
        title="My Talks"
        description="Look up confirmed talks, track review status, and share a public slide link."
        ribbon="Coming soon"
      />

      <div v-if="message" class="mb-4 border border-green-700/50 bg-green-100 px-4 py-3 text-sm text-green-800">{{ message }}</div>
      <div v-if="error" class="mb-4 border border-red-700/50 bg-red-100 px-4 py-3 text-sm text-red-800">{{ error }}</div>

      <div v-if="!checked" class="my-talks-card editorial-panel relative mx-auto max-w-md overflow-hidden border-dc-border bg-dc-paper-warm p-8 opacity-80 sm:p-12">
        <div class="my-talks-card-header mb-6 text-center">
          <div class="my-talks-kicker mb-4 inline-block border-2 border-dc-ink bg-dc-yellow px-3 py-1 font-mono text-xs font-bold text-dc-ink shadow-[2px_2px_0_#111111]">SPEAKER ACCESS</div>
          <h2 class="mb-2 font-mono text-2xl font-bold text-dc-ink">Check Your Talks</h2>
          <p class="font-mono text-sm text-dc-gray">Use the email organizers have on file for your talk.</p>
        </div>

        <form class="my-talks-form space-y-6" @submit.prevent>
          <div>
            <label class="mb-2 block font-mono text-xs font-bold uppercase text-dc-ink">Email Address</label>
            <input v-model="email" disabled type="email" placeholder="speaker@example.com" class="editorial-input cursor-not-allowed font-mono opacity-70" />
          </div>
          <button type="submit" disabled class="my-talks-submit w-full rounded-md border-2 border-dc-ink bg-dc-pink py-4 font-mono text-lg font-bold uppercase tracking-wide text-white shadow-[2px_2px_0_#111111] opacity-55 disabled:cursor-not-allowed">
            View My Talks
          </button>
        </form>
      </div>

      <div v-else class="space-y-6">
        <div class="mb-6 flex items-center justify-between">
          <div class="flex items-center gap-4">
            <span class="font-mono text-sm text-dc-gray">{{ email }}</span>
            <button class="font-mono text-sm text-dc-pink hover:text-dc-ink" @click="checked = false; talks = []; email = ''">
              CHANGE EMAIL
            </button>
          </div>
        </div>

        <div v-if="talks.length === 0" class="border-2 border-dc-ink bg-dc-paper p-12 text-center shadow-[3px_3px_0_#111111]">
          <p class="font-mono text-dc-gray">No talk submissions found for this email</p>
          <RouterLink to="/archive" class="mt-6 inline-block font-mono text-sm text-dc-pink hover:text-dc-ink">
            BROWSE THE ARCHIVE &rarr;
          </RouterLink>
        </div>

        <div v-else class="space-y-4">
              <article v-for="talk in talks" :key="talk.id" class="editorial-panel p-6">
            <div class="mb-4 flex items-start justify-between">
              <div class="flex-1">
                <p class="editorial-eyebrow">{{ talk.topic || 'General' }}</p>
                <h3 class="mb-2 mt-2 text-2xl font-black tracking-tight text-dc-ink">{{ talk.title }}</h3>
                <p class="mb-3 text-sm text-dc-gray">
                  {{ talk.event?.name }}
                  <span v-if="eventDate(talk)">· {{ eventDate(talk) }}</span>
                </p>
              </div>
              <span class="border-2 border-dc-ink px-3 py-1 font-mono text-xs font-bold" :class="[badge(talk.status).bg, badge(talk.status).text]">
                {{ badge(talk.status).label }}
              </span>
            </div>

            <p class="mb-4 line-clamp-2 text-sm text-dc-gray">{{ talk.abstract }}</p>

            <div v-if="talk.status === 'accepted' || talk.status === 'slides_received' || talk.status === 'published'" class="mt-4 border-t-2 border-dc-border pt-4">
              <div v-if="!slidesViewUrl(talk)" class="mb-4 border-2 border-dc-ink bg-dc-paper-warm p-4">
                <p class="font-mono text-xs font-bold uppercase tracking-[0.2em] text-dc-pink">Action needed</p>
                <p class="mt-2 text-sm text-dc-gray">
                  {{ slidePrompt(talk) }}
                </p>
              </div>
              <div v-if="slidesViewUrl(talk)" class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <span class="font-mono text-sm font-bold text-green-700">READY</span>
                  <span class="text-sm text-dc-gray">
                    Slide link shared
                    <span v-if="talk.slides_uploaded_at">on {{ new Date(talk.slides_uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }}</span>
                  </span>
                </div>
                <div class="flex gap-2">
                  <a :href="slidesViewUrl(talk) ?? undefined" target="_blank" rel="noopener noreferrer" class="border-2 border-dc-ink bg-dc-paper px-4 py-2 font-mono text-sm text-dc-ink hover:bg-dc-yellow">VIEW</a>
                  <button class="border-2 border-dc-ink bg-dc-paper px-4 py-2 font-mono text-sm text-dc-ink hover:bg-dc-yellow" @click="uploadTalkId = talk.id; slidesUrl = slidesViewUrl(talk) ?? ''">UPDATE</button>
                </div>
              </div>
              <button v-else class="motion-press w-full rounded-md border-2 border-dc-ink bg-dc-yellow px-6 py-3 font-mono font-bold uppercase tracking-wide text-dc-ink shadow-[2px_2px_0_#111111]" @click="uploadTalkId = talk.id">
                ADD SLIDE LINK
              </button>
            </div>
          </article>
        </div>
      </div>
    </div>

    <div v-if="uploadTalkId" class="fixed inset-0 z-50 flex items-center justify-center bg-dc-ink/70 p-4">
      <form class="w-full max-w-lg border-2 border-dc-ink bg-dc-paper p-6 shadow-[4px_4px_0_#111111]" @submit.prevent="saveSlides">
        <h2 class="mb-2 font-mono text-2xl font-bold text-dc-ink">Slide Link</h2>
        <p class="mb-4 text-sm leading-6 text-dc-gray">Paste a public link to your slides. We are not storing slide files in this phase.</p>
        <input v-model="slidesUrl" required type="url" placeholder="https://..." class="mb-6 w-full border-2 border-dc-ink bg-dc-paper px-4 py-3 font-mono text-dc-ink outline-none focus:border-dc-pink" />
        <div class="flex justify-end gap-3">
          <button type="button" class="border-2 border-dc-ink px-4 py-2 font-mono text-dc-ink" @click="uploadTalkId = null; slidesUrl = ''">CANCEL</button>
          <button type="submit" class="border-2 border-dc-ink bg-dc-yellow px-4 py-2 font-mono font-bold text-dc-ink">SAVE</button>
        </div>
      </form>
    </div>
  </div>
</template>
