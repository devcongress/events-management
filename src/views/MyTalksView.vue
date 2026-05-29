<script setup lang="ts">
import { ref } from 'vue';
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
  const response = await fetch(`/api/my-talks?email=${encodeURIComponent(email.value)}`);
  if (response.ok) {
    talks.value = await response.json();
    checked.value = true;
  } else {
    error.value = 'Failed to fetch talks';
  }
  loading.value = false;
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

function badge(status: string) {
  const badges: Record<string, { bg: string; text: string; label: string }> = {
    submitted: { bg: 'bg-dc-dark-2', text: 'text-dc-gray', label: 'PENDING REVIEW' },
    accepted: { bg: 'bg-green-900/30', text: 'text-green-400', label: 'ACCEPTED' },
    rejected: { bg: 'bg-red-900/30', text: 'text-red-400', label: 'REJECTED' },
    slides_received: { bg: 'bg-blue-900/30', text: 'text-blue-400', label: 'SLIDES RECEIVED' },
    published: { bg: 'bg-purple-900/30', text: 'text-purple-400', label: 'PUBLISHED' },
  };
  return badges[status] ?? badges.submitted;
}
</script>

<template>
  <div class="editorial-page">
    <div class="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <div class="editorial-header">
        <p class="editorial-eyebrow">speaker desk</p>
        <h1 class="editorial-title">My Talks</h1>
        <p class="editorial-subtitle">Look up submissions, track review status, and attach your slides before event day.</p>
      </div>

      <div v-if="message" class="mb-4 border border-green-500/50 bg-green-500/10 px-4 py-3 text-sm text-green-200">{{ message }}</div>
      <div v-if="error" class="mb-4 border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">{{ error }}</div>

      <div v-if="!checked" class="editorial-panel mx-auto max-w-md p-8 sm:p-12">
        <div class="mb-6 text-center">
          <div class="mb-4 inline-block bg-dc-yellow px-3 py-1 font-mono text-xs font-bold text-dc-dark">SPEAKER ACCESS</div>
          <h2 class="mb-2 font-mono text-2xl font-bold text-white">Check Your Talks</h2>
          <p class="font-mono text-sm text-dc-gray">Enter the email you used for CFP submissions</p>
        </div>

        <form class="space-y-6" @submit.prevent="checkTalks">
          <div>
            <label class="mb-2 block font-mono text-xs font-bold uppercase text-dc-yellow">Email Address</label>
            <input v-model="email" required type="email" placeholder="speaker@example.com" class="editorial-input font-mono" />
          </div>
          <button type="submit" :disabled="loading" class="w-full bg-dc-yellow py-4 font-mono text-lg font-bold uppercase tracking-wide text-dc-dark transition-all hover:shadow-glow disabled:opacity-50">
            {{ loading ? 'CHECKING...' : 'VIEW MY TALKS' }}
          </button>
        </form>
      </div>

      <div v-else class="space-y-6">
        <div class="mb-6 flex items-center justify-between">
          <div class="flex items-center gap-4">
            <span class="font-mono text-sm text-dc-gray">{{ email }}</span>
            <button class="font-mono text-sm text-dc-yellow hover:text-dc-yellow-glow" @click="checked = false; talks = []; email = ''">
              CHANGE EMAIL
            </button>
          </div>
        </div>

        <div v-if="talks.length === 0" class="border-2 border-dc-dark-3 bg-dc-dark-1 p-12 text-center">
          <p class="font-mono text-dc-gray">No talk submissions found for this email</p>
          <RouterLink to="/" class="mt-6 inline-block font-mono text-sm text-dc-yellow hover:text-dc-yellow-glow">
            VIEW EVENTS WITH OPEN CFP &rarr;
          </RouterLink>
        </div>

        <div v-else class="space-y-4">
              <article v-for="talk in talks" :key="talk.id" class="editorial-panel p-6">
            <div class="mb-4 flex items-start justify-between">
              <div class="flex-1">
                <h3 class="mb-2 font-mono text-xl font-bold text-white">{{ talk.title }}</h3>
                <p class="mb-3 font-mono text-sm text-dc-gray-light">{{ talk.event?.name }}</p>
              </div>
              <span class="border border-current px-3 py-1 font-mono text-xs font-bold" :class="[badge(talk.status).bg, badge(talk.status).text]">
                {{ badge(talk.status).label }}
              </span>
            </div>

            <p class="mb-4 line-clamp-2 text-sm text-white/80">{{ talk.abstract }}</p>

            <div v-if="talk.status === 'accepted' || talk.status === 'slides_received'" class="mt-4 border-t-2 border-dc-dark-3 pt-4">
              <div v-if="slidesViewUrl(talk)" class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <span class="text-xl text-green-400">OK</span>
                  <span class="font-mono text-sm text-dc-gray-light">Slides uploaded</span>
                </div>
                <div class="flex gap-2">
                  <a :href="slidesViewUrl(talk) ?? undefined" target="_blank" rel="noopener noreferrer" class="border border-dc-yellow/30 bg-dc-dark-2 px-4 py-2 font-mono text-sm text-dc-yellow hover:border-dc-yellow">VIEW</a>
                  <button class="border border-dc-dark-3 bg-dc-dark-2 px-4 py-2 font-mono text-sm text-white hover:border-dc-yellow/30" @click="uploadTalkId = talk.id; slidesUrl = slidesViewUrl(talk) ?? ''">UPDATE</button>
                </div>
              </div>
              <button v-else class="w-full bg-dc-yellow px-6 py-3 font-mono font-bold uppercase tracking-wide text-dc-dark transition-shadow hover:shadow-glow" @click="uploadTalkId = talk.id">
                UPLOAD SLIDES
              </button>
            </div>
          </article>
        </div>
      </div>
    </div>

    <div v-if="uploadTalkId" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <form class="w-full max-w-lg border-2 border-dc-yellow bg-dc-dark-1 p-6 shadow-glow" @submit.prevent="saveSlides">
        <h2 class="mb-4 font-mono text-2xl font-bold text-white">Slides URL</h2>
        <input v-model="slidesUrl" required type="url" placeholder="https://..." class="mb-6 w-full border-2 border-dc-dark-3 bg-dc-dark-2 px-4 py-3 font-mono text-white outline-none focus:border-dc-yellow" />
        <div class="flex justify-end gap-3">
          <button type="button" class="border-2 border-dc-dark-3 px-4 py-2 font-mono text-white" @click="uploadTalkId = null; slidesUrl = ''">CANCEL</button>
          <button type="submit" class="bg-dc-yellow px-4 py-2 font-mono font-bold text-dc-dark">SAVE</button>
        </div>
      </form>
    </div>
  </div>
</template>
