<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AppDropdown from '@/src/components/AppDropdown.vue';
import type { SpeakerBlastAudience, SpeakerBlastIntent } from '@/lib/speaker-blasts';

const props = defineProps<{ eventId: string; eventName: string }>();
const open = ref(false);
const intent = ref<SpeakerBlastIntent>('update');
const subject = ref('');
const message = ref('');
const busy = ref(false);
const error = ref('');
const status = ref('');
const audience = ref<SpeakerBlastAudience | null>(null);

type History = { id: string; subject: string; status: string; recipient_count: number; accepted_count: number; error: string | null; recipients: Array<{ name: string; email: string; provider_id: string | null }> };
const history = ref<History[]>([]);

type Preview = { id: string; subject: string; previews: Array<{ name: string; to: string; from: string; subject: string; text: string }> };
const preview = ref<Preview | null>(null);
const recipientCount = computed(() => audience.value?.recipients.length ?? 0);

async function request<T>(path = '', body?: unknown): Promise<T> {
  const response = await fetch(`/api/events/${props.eventId}/speaker-blasts${path}`, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();

  if (!response.ok) throw new Error(data.error ?? 'Speaker email could not be completed.');

  return data;
}

async function load() {
  try {
    const result = await request<{ audience: SpeakerBlastAudience; blasts: History[] }>(`?intent=${intent.value}`);

    audience.value = result.audience;
    history.value = result.blasts;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not load speaker emails.';
  }
}

function starter() {
  preview.value = null;
  subject.value = intent.value === 'slides_reminder' ? `Share your slides for ${props.eventName}` : `Speaker update: ${props.eventName}`;
  message.value = intent.value === 'slides_reminder'
    ? 'Thank you for being part of the programme. Please add the link to your presentation slides using your private speaker workspace below.'
    : 'Here is the latest update for your session.\n\n[Add your update]';
}

watch(intent, async () => {
  starter();
  await load();
});
watch(() => props.eventId, () => {
  open.value = false;
  preview.value = null;
  audience.value = null;
  history.value = [];
});

async function toggle() {
  open.value = !open.value;
  if (!open.value) return;
  if (!subject.value) starter();
  await load();
}

async function prepare() {
  busy.value = true;
  error.value = '';
  status.value = '';
  try {
    preview.value = await request<Preview>('/preview', { intent: intent.value, subject: subject.value, message: message.value });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not prepare the preview.';
  } finally {
    busy.value = false;
  }
}

async function send(id: string) {
  busy.value = true;
  error.value = '';
  try {
    const result = await request<{ blast: History }>(`/${id}/send`, {});

    status.value = `${result.blast.accepted_count} personalized email${result.blast.accepted_count === 1 ? '' : 's'} accepted by the email provider.`;
    preview.value = null;
    await load();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Delivery is not confirmed. Refresh history before retrying.';
    await load();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="mb-6 rounded-lg border border-dc-border bg-white p-5" aria-label="Speaker blasts">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold">Speaker emails</h2>
        <p class="mt-1 text-sm text-dc-gray">Send an update or a slides reminder with each speaker’s own details and private links.</p>
      </div>
      <button type="button" class="editorial-action min-h-11 px-4" :aria-expanded="open" @click="toggle">{{ open ? 'Close composer' : 'Email speakers' }}</button>
    </div>
    <Transition name="speaker-blast-panel">
    <div v-if="open" class="mt-5 border-t border-dc-border pt-5">
      <p v-if="error" role="alert" class="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{{ error }}</p>
      <p v-if="status" role="status" class="mb-4 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900">{{ status }}</p>
      <form v-if="!preview" class="grid gap-4" @submit.prevent="prepare">
        <AppDropdown
          :model-value="intent"
          label="Message type"
          aria-label="Message type"
          :options="[{ value: 'update', label: 'Speaker update' }, { value: 'slides_reminder', label: 'Slides reminder' }]"
          :disabled="busy"
          @update:model-value="intent = $event as SpeakerBlastIntent"
        />
        <p class="text-sm text-dc-gray">{{ recipientCount }} eligible speaker{{ recipientCount === 1 ? '' : 's' }}. Multiple sessions for one email address are grouped into one message.</p>
        <details v-if="audience?.excluded.length" class="text-sm">
          <summary class="cursor-pointer font-semibold">{{ audience.excluded.length }} sessions excluded</summary>
          <ul class="mt-2 grid gap-2"><li v-for="(item, index) in audience.excluded" :key="index">{{ item.name }} · {{ item.title }} — {{ item.reason }}</li></ul>
        </details>
        <label class="grid gap-2 text-sm font-semibold">Subject<input v-model="subject" class="editorial-input" maxlength="160" required :disabled="busy"></label>
        <label class="grid gap-2 text-sm font-semibold">Message<textarea v-model="message" class="editorial-input min-h-40" maxlength="5000" required :disabled="busy" /></label>
        <p class="text-xs text-dc-gray">Names, session titles and available private links are added automatically. Do not paste a speaker’s private link into the shared message.</p>
        <button type="submit" class="editorial-action min-h-11 justify-center px-4" :disabled="busy || !recipientCount">{{ busy ? 'Preparing…' : 'Preview speaker emails' }}</button>
      </form>
      <div v-else>
        <h3 class="text-lg font-semibold">Review {{ preview.previews.length }} personalized emails</h3>
        <p class="mt-1 text-sm text-dc-gray">Check each recipient and their own private links. Nothing is sent until you confirm.</p>
        <details v-for="item in preview.previews" :key="item.to" class="mt-3 rounded-md border border-dc-border p-4" :open="preview.previews.length === 1">
          <summary class="cursor-pointer break-words text-sm font-semibold">{{ item.name }} · {{ item.to }}</summary>
          <p class="mt-3 text-xs text-dc-gray">From: {{ item.from }}</p>
          <p class="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{{ item.text }}</p>
        </details>
        <div class="mt-4 flex flex-wrap gap-3">
          <button type="button" class="editorial-action min-h-11 px-4" :disabled="busy" @click="preview = null">Keep editing</button>
          <button type="button" class="editorial-action min-h-11 px-4" :disabled="busy" @click="send(preview!.id)">{{ busy ? 'Sending…' : `Send ${preview.previews.length} speaker emails` }}</button>
        </div>
      </div>
      <div v-if="history.length" class="mt-6 border-t border-dc-border pt-5">
        <h3 class="font-semibold">Speaker email history</h3>
        <details v-for="blast in history" :key="blast.id" class="mt-3 rounded-md border border-dc-border p-3 text-sm">
          <summary class="cursor-pointer">{{ blast.subject }} · {{ blast.status === 'accepted' ? 'Accepted by provider' : blast.status === 'sending' ? 'Sending / confirming acceptance' : 'Needs attention' }} · {{ blast.recipient_count }} speakers</summary>
          <p v-if="blast.error" class="mt-2 text-red-800">{{ blast.error }}</p>
          <ul class="mt-2 grid gap-1"><li v-for="recipient in blast.recipients" :key="recipient.email">{{ recipient.name }} · {{ recipient.email }} · {{ recipient.provider_id ? 'Accepted' : 'Not confirmed' }}</li></ul>
          <button v-if="blast.status !== 'accepted'" type="button" class="editorial-action mt-3 min-h-11 px-4" :disabled="busy" @click="send(blast.id)">Retry same blast</button>
        </details>
      </div>
    </div>
    </Transition>
  </section>
</template>

<style scoped>
.speaker-blast-panel-enter-active,
.speaker-blast-panel-leave-active {
  transition: opacity 180ms cubic-bezier(0.16, 1, 0.3, 1), transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
}
.speaker-blast-panel-enter-from,
.speaker-blast-panel-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
@media (prefers-reduced-motion: reduce) {
  .speaker-blast-panel-enter-active,
  .speaker-blast-panel-leave-active {
    transition: none;
  }
  .speaker-blast-panel-enter-from,
  .speaker-blast-panel-leave-to {
    transform: none;
  }
}
</style>
