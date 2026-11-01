<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { fetchJson } from '@/src/lib/api';
import { notify } from '@/src/lib/notify';
import type { AnnualConferenceSpeakerSubmission } from '@/lib/annual-conference-speakers';

type OutcomeMessage = { kind: 'acceptance' | 'rejection'; subject: string; message: string; version: number };
type Recipient = { id: string; name: string; recipient: string; from: string; replyTo: string; subject: string; html: string; text: string };

const props = defineProps<{ year: string; submissions: AnnualConferenceSpeakerSubmission[]; configured: boolean }>();
const emit = defineEmits<{ sent: [] }>();
const messages = ref<OutcomeMessage[]>([]);
const savedMessages = ref<Record<string, string>>({});
const kind = ref<'acceptance' | 'rejection'>('acceptance');
const selected = ref<string[]>([]);
const recipients = ref<Recipient[]>([]);
const previewToken = ref('');
const previewId = ref('');
const busy = ref(false);
const message = computed(() => messages.value.find((item) => item.kind === kind.value));
const hasUnsavedChanges = computed(() => messages.value.some((item) => savedMessages.value[item.kind] !== JSON.stringify(item)));
const eligible = computed(() => props.submissions.filter((item) => ['pending', 'failed'].includes(item.decision_email_status ?? '') && item.decision_email_attempt_count === 0 && !item.decision_email_queued_at && ['selected', 'not_selected'].includes(item.status)));
const currentPreview = computed(() => recipients.value.find((item) => item.id === previewId.value));
const base = computed(() => `/api/annual-conference/${props.year}/speaker-outcomes`);

function clearPreview() {
  recipients.value = [];
  previewToken.value = '';
  previewId.value = '';
}

watch(selected, clearPreview, { deep: true });
watch(() => props.year, () => { selected.value = []; clearPreview(); void load(); });
onMounted(load);

async function load() {
  try {
    messages.value = (await fetchJson<{ messages: OutcomeMessage[] }>(`${base.value}/messages`, { credentials: 'include' })).messages;
    savedMessages.value = Object.fromEntries(messages.value.map((item) => [item.kind, JSON.stringify(item)]));
  } catch (error) {
    notify.error(error instanceof Error ? error.message : 'Unable to load outcome messages.');
  }
}

async function save() {
  if (!message.value) return;
  busy.value = true;
  try {
    const result = await fetchJson<{ message: OutcomeMessage }>(`${base.value}/messages`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: message.value.kind, subject: message.value.subject, message: message.value.message, version: message.value.version }) });
    const index = messages.value.findIndex((item) => item.kind === result.message.kind);

    messages.value[index] = result.message;
    savedMessages.value[result.message.kind] = JSON.stringify(result.message);
    clearPreview();
    notify.success('Outcome message saved.');
  } catch (error) {
    notify.error(error instanceof Error ? error.message : 'Unable to save the outcome message.');
  } finally {
    busy.value = false;
  }
}

async function prepare() {
  busy.value = true;
  try {
    const result = await fetchJson<{ recipients: Recipient[]; preview_id: string }>(`${base.value}/preview`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selected.value }) });

    recipients.value = result.recipients;
    previewToken.value = result.preview_id;
    previewId.value = result.recipients[0]?.id ?? '';
  } catch (error) {
    clearPreview();
    notify.error(error instanceof Error ? error.message : 'Unable to preview these messages.');
  } finally {
    busy.value = false;
  }
}

async function send() {
  busy.value = true;
  try {
    const result = await fetchJson<{ queued: number }>(`${base.value}/send`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preview_id: previewToken.value }) });

    notify.success(`${result.queued} email${result.queued === 1 ? '' : 's'} queued for delivery.`);
    selected.value = [];
    clearPreview();
    emit('sent');
  } catch (error) {
    notify.error(error instanceof Error ? error.message : 'Unable to send the messages.');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="mt-6 rounded-lg border border-dc-border bg-dc-paper p-5">
    <h2 class="text-xl font-bold">Speaker outcome messages</h2>
    <p class="mt-1 text-sm text-dc-gray">Save the messages, select recipients, and review each personalized email before sending.</p>
    <div class="mt-4 flex gap-2" role="group" aria-label="Outcome message">
      <button v-for="option in ['acceptance', 'rejection'] as const" :key="option" type="button" class="editorial-action" :aria-pressed="kind === option" @click="kind = option">{{ option === 'acceptance' ? 'Acceptance' : 'Not selected' }}</button>
    </div>
    <div v-if="message" class="mt-4 grid gap-3">
      <label class="text-sm font-semibold">Subject<input v-model="message.subject" class="app-form-control mt-1 w-full" maxlength="200" @input="clearPreview"></label>
      <label class="text-sm font-semibold">Message<textarea v-model="message.message" class="app-form-control mt-1 min-h-48 w-full" maxlength="10000" @input="clearPreview" /></label>
      <p class="text-xs text-dc-gray">Placeholders: {first_name}, {talk_title}, {edition}, {deadline}, {workspace_url}. Acceptance requires {workspace_url}.</p>
      <div><button type="button" class="editorial-action" :disabled="busy" @click="save">Save message</button></div>
    </div>
    <div class="mt-6 border-t border-dc-border pt-4">
      <h3 class="font-bold">Ready to send</h3>
      <p v-if="!eligible.length" class="mt-2 text-sm text-dc-gray">No unsent decisions are ready.</p>
      <div v-else class="mt-2 max-h-64 overflow-y-auto">
        <label v-for="item in eligible" :key="item.id" class="flex min-h-11 items-center gap-3 border-b border-dc-border py-2 text-sm">
          <input v-model="selected" type="checkbox" :value="item.id" :disabled="busy || (selected.length >= 100 && !selected.includes(item.id))">
          <span><strong>{{ item.speaker_name }}</strong> · {{ item.title }} · {{ item.status === 'selected' ? 'Acceptance' : 'Not selected' }}</span>
        </label>
      </div>
      <p v-if="hasUnsavedChanges" class="mt-2 text-sm text-dc-gray">Save both edited messages before previewing.</p>
      <button type="button" class="editorial-action mt-3" :disabled="busy || !selected.length || !configured || hasUnsavedChanges" @click="prepare">Preview {{ selected.length }} selected</button>
    </div>
    <div v-if="recipients.length" class="mt-6 border-t border-dc-border pt-4">
      <h3 class="font-bold">Review personalized emails</h3>
      <div class="mt-2 flex flex-wrap gap-2">
        <button v-for="recipient in recipients" :key="recipient.id" type="button" class="editorial-action" :aria-pressed="previewId === recipient.id" @click="previewId = recipient.id">{{ recipient.name }}</button>
      </div>
      <template v-if="currentPreview">
        <p class="mt-3 break-words text-sm"><strong>From:</strong> {{ currentPreview.from }}<br><strong>Reply to:</strong> {{ currentPreview.replyTo }}<br><strong>To:</strong> {{ currentPreview.recipient }}<br><strong>Subject:</strong> {{ currentPreview.subject }}</p>
        <iframe :srcdoc="currentPreview.html" sandbox="" title="Personalized email preview" class="mt-3 h-96 w-full border border-dc-border bg-white" />
      </template>
      <p class="mt-3 text-sm text-dc-gray">Sending queues delivery for {{ recipients.length }} recipient{{ recipients.length === 1 ? '' : 's' }}. Provider acceptance is not confirmation of delivery.</p>
      <button type="button" class="editorial-action mt-3" :disabled="busy || !configured" @click="send">Send selected emails</button>
    </div>
  </section>
</template>
