<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { fetchJson } from '@/src/lib/api';
import { notify } from '@/src/lib/notify';
import { selectedMessagesAreDirty } from '@/src/lib/speaker-outcome-selection';
import type { AnnualConferenceSpeakerSubmission } from '@/lib/annual-conference-speakers';

type OutcomeSubmission = AnnualConferenceSpeakerSubmission & { workspace_access?: 'active' | 'revoked' | 'unavailable' };

type OutcomeMessage = { kind: 'acceptance' | 'rejection'; subject: string; message: string; version: number };
type Recipient = { id: string; name: string; recipient: string; from: string; replyTo: string; subject: string; html: string; text: string };

const props = defineProps<{ year: string; submissions: OutcomeSubmission[]; configured: boolean }>();
const emit = defineEmits<{ sent: [] }>();
const messages = ref<OutcomeMessage[]>([]);
const savedMessages = ref<Record<string, string>>({});
const kind = ref<'acceptance' | 'rejection'>('acceptance');
const selected = ref<string[]>([]);
const recipients = ref<Recipient[]>([]);
const previewToken = ref('');
const previewId = ref('');
const busy = ref(false);
const drawerOpen = ref(false);
const drawer = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const readyHeading = ref<HTMLElement | null>(null);
const testEmail = ref('');
const testMessage = ref('');
const testError = ref('');
const pendingTests = new Map<string, string>();
let previousFocus: HTMLElement | null = null;
let previousOverflow = '';
let previousDocumentOverflow = '';
let testContextVersion = 0;

function closeDrawer() {
  drawerOpen.value = false;
}

function onDrawerKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeDrawer();

    return;
  }
  if (event.key !== 'Tab' || !drawer.value) return;
  const focusable = Array.from(drawer.value.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), iframe, [tabindex]:not([tabindex="-1"])')).filter((element) => element.getClientRects().length > 0);
  const first = focusable[0];
  const last = focusable.at(-1);

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

watch(drawerOpen, async (open) => {
  if (open) {
    previousOverflow = document.body.style.overflow;
    previousDocumentOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onDrawerKeydown);
    await nextTick();
    if (drawerOpen.value) closeButton.value?.focus();
  } else {
    document.removeEventListener('keydown', onDrawerKeydown);
    document.body.style.overflow = previousOverflow;
    document.documentElement.style.overflow = previousDocumentOverflow;
    const opener = previousFocus;

    previousFocus = null;
    await nextTick();
    if (drawerOpen.value) return;
    if (opener?.isConnected && !opener.matches(':disabled') && !opener.closest('[inert]')) opener.focus();
    else readyHeading.value?.focus();
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDrawerKeydown);
  if (drawerOpen.value) {
    document.body.style.overflow = previousOverflow;
    document.documentElement.style.overflow = previousDocumentOverflow;
  }
});

async function sendTest() {
  if (!currentPreview.value || !testEmail.value.trim()) return;
  busy.value = true;
  testMessage.value = '';
  testError.value = '';
  const signature = JSON.stringify([previewToken.value, currentPreview.value.id, testEmail.value.trim().toLowerCase()]);
  const requestId = pendingTests.get(signature) ?? crypto.randomUUID();
  const contextVersion = testContextVersion;

  pendingTests.set(signature, requestId);
  try {
    const result = await fetchJson<{ recipient: string }>(`${base.value}/test`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preview_id: previewToken.value, recipient_id: currentPreview.value.id, email: testEmail.value.trim(), request_id: requestId }) });

    pendingTests.delete(signature);
    if (contextVersion === testContextVersion) testMessage.value = `Test accepted for ${result.recipient}. Check your inbox; delivery is not yet confirmed.`;
  } catch (error) {
    if (contextVersion === testContextVersion) testError.value = error instanceof Error ? error.message : 'Unable to confirm test delivery.';
  } finally {
    busy.value = false;
  }
}

const message = computed(() => messages.value.find((item) => item.kind === kind.value));
const hasUnsavedChanges = computed(() => selectedMessagesAreDirty(messages.value, savedMessages.value, props.submissions, selected.value));
const eligible = computed(() => props.submissions.filter((item) => ['pending', 'failed'].includes(item.decision_email_status ?? '') && item.decision_email_attempt_count === 0 && !item.decision_email_queued_at && (item.status === 'not_selected' || (item.status === 'selected' && item.workspace_access === 'active'))));
const currentPreview = computed(() => recipients.value.find((item) => item.id === previewId.value));
const base = computed(() => `/api/annual-conference/${props.year}/speaker-outcomes`);

function clearPreview() {
  recipients.value = [];
  previewToken.value = '';
  previewId.value = '';
  drawerOpen.value = false;
}

watch([previewId, previewToken, () => props.year], () => {
  testContextVersion += 1;
  testEmail.value = '';
  testMessage.value = '';
  testError.value = '';
}, { flush: 'sync' });

watch(selected, clearPreview, { deep: true });
watch(eligible, (items) => {
  const eligibleIds = new Set(items.map((item) => item.id));
  const remaining = selected.value.filter((id) => eligibleIds.has(id));

  if (remaining.length !== selected.value.length) selected.value = remaining;
});
watch(() => props.year, () => { selected.value = []; clearPreview(); void load(); });
onMounted(load);

async function load() {
  try {
    const result = await fetchJson<{ messages: OutcomeMessage[]; suggested_acceptance: OutcomeMessage; legacy_acceptance: boolean }>(`${base.value}/messages`, { credentials: 'include' });

    messages.value = result.messages;
    savedMessages.value = Object.fromEntries(messages.value.map((item) => [item.kind, JSON.stringify(item)]));
    if (result.legacy_acceptance) {
      const acceptance = messages.value.find((item) => item.kind === 'acceptance');

      if (acceptance) {
        acceptance.subject = result.suggested_acceptance.subject;
        acceptance.message = result.suggested_acceptance.message;
      }
    }
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

async function prepare(event: MouseEvent) {
  previousFocus = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  busy.value = true;
  try {
    const result = await fetchJson<{ recipients: Recipient[]; preview_id: string }>(`${base.value}/preview`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selected.value }) });

    recipients.value = result.recipients;
    previewToken.value = result.preview_id;
    previewId.value = result.recipients[0]?.id ?? '';
    drawerOpen.value = !!previewId.value;
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
      <label class="text-sm font-semibold">Message<textarea v-model="message.message" class="app-form-control speaker-outcome-message mt-1 w-full" rows="6" maxlength="10000" @input="clearPreview" /></label>
      <p class="text-xs text-dc-gray">Placeholders: {first_name}, {talk_title}, {edition}, {year}, {session_format}, {session_duration}, {conference_date}, {conference_venue}, {deadline}, {workspace_url}. The deadline applies to confirmation and materials. Acceptance requires {workspace_url}.</p>
      <div><button type="button" class="editorial-action" :disabled="busy" @click="save">Save message</button></div>
    </div>
    <div class="mt-6 border-t border-dc-border pt-4">
      <h3 ref="readyHeading" class="font-bold" tabindex="-1">Ready to send</h3>
      <p v-if="!eligible.length" class="mt-2 text-sm text-dc-gray">No unsent decisions are ready.</p>
      <div v-else class="speaker-outcome-recipients mt-2 max-h-64 overflow-y-auto">
        <label v-for="item in eligible" :key="item.id" class="flex min-h-11 items-center gap-3 border-b border-dc-border py-2 text-sm">
          <input v-model="selected" type="checkbox" :value="item.id" :disabled="busy || (selected.length >= 100 && !selected.includes(item.id))">
          <span><strong>{{ item.speaker_name }}</strong> · {{ item.title }} · {{ item.status === 'selected' ? 'Acceptance' : 'Not selected' }}</span>
        </label>
      </div>
      <p v-if="hasUnsavedChanges" class="mt-2 text-sm text-dc-gray">Save the edited messages for the selected recipients before previewing.</p>
      <button type="button" class="editorial-action mt-3" :disabled="busy || !selected.length || !configured || hasUnsavedChanges" @click="prepare">Preview {{ selected.length }} selected</button>
    </div>
    <Teleport to="body">
      <div v-if="drawerOpen && currentPreview" class="speaker-backdrop" @click.self="closeDrawer">
        <section ref="drawer" class="speaker-drawer" role="dialog" aria-modal="true" aria-labelledby="speaker-preview-title" tabindex="-1">
          <header class="speaker-drawer-header">
            <div><p class="text-sm text-dc-gray">Owner preview · 10 minute snapshot</p><h2 id="speaker-preview-title" class="text-xl font-bold">Review personalized emails</h2></div>
            <button ref="closeButton" type="button" class="editorial-action" @click="closeDrawer">Close</button>
          </header>
          <div class="speaker-drawer-body">
            <p class="text-sm text-dc-gray">Choose a speaker to review their frozen email.</p>
            <div class="mt-2 flex flex-wrap gap-2" role="group" aria-label="Preview recipient">
              <button v-for="recipient in recipients" :key="recipient.id" type="button" class="editorial-action" :aria-pressed="previewId === recipient.id" @click="previewId = recipient.id">{{ recipient.name }}</button>
            </div>
            <p class="mt-3 break-words text-sm"><strong>From:</strong> {{ currentPreview.from }}<br><strong>Reply to:</strong> {{ currentPreview.replyTo }}<br><strong>To:</strong> {{ currentPreview.recipient }}<br><strong>Subject:</strong> {{ currentPreview.subject }}</p>
            <iframe :srcdoc="currentPreview.html" sandbox="" tabindex="-1" title="Personalized email preview" class="mt-3 h-96 w-full border border-dc-border bg-white" />
            <form class="mt-4 grid gap-2" @submit.prevent="sendTest">
              <label for="speaker-test-email" class="text-sm font-semibold">Test recipient</label>
              <input id="speaker-test-email" v-model="testEmail" class="app-form-control w-full" type="email" maxlength="254" required placeholder="you@example.com">
              <p class="text-sm text-dc-gray">This sends the exact personalized email, including any private speaker link, to the address above. Speaker decisions and the delivery queue stay unchanged.</p>
              <div><button type="submit" class="editorial-action" :disabled="busy">Send test email</button></div>
              <p v-if="testMessage" role="status">{{ testMessage }}</p><p v-if="testError" role="alert">{{ testError }}</p>
            </form>
            <p class="mt-4 text-sm text-dc-gray">Sending queues delivery for {{ recipients.length }} recipient{{ recipients.length === 1 ? '' : 's' }}. Provider acceptance is not confirmation of delivery.</p>
          </div>
          <footer class="speaker-drawer-footer"><button type="button" class="editorial-action" :disabled="busy || !configured" @click="send">Send selected emails</button></footer>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.speaker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  justify-content: flex-end;
  background: rgb(25 23 20 / 38%);
}

.speaker-drawer {
  display: flex;
  width: min(42rem, 100%);
  height: 100%;
  flex-direction: column;
  background: white;
}

.speaker-drawer-header,
.speaker-drawer-footer {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem;
  border-bottom: 1px solid #e6e3dc;
}

.speaker-drawer-footer {
  padding-bottom: max(1.25rem, env(safe-area-inset-bottom));
  border-top: 1px solid #e6e3dc;
  border-bottom: 0;
}

.speaker-drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem;
}

textarea.speaker-outcome-message.app-form-control {
  min-height: min(170px, 45dvh);
  max-height: min(260px, 45dvh);
  field-sizing: content;
  overflow-y: auto;
  resize: none;
}

.speaker-outcome-message,
.speaker-outcome-recipients {
  scrollbar-width: thin;
  scrollbar-color: #767676 #fff;
}

.speaker-outcome-message::-webkit-scrollbar,
.speaker-outcome-recipients::-webkit-scrollbar {
  width: 8px;
}

.speaker-outcome-message::-webkit-scrollbar-track,
.speaker-outcome-recipients::-webkit-scrollbar-track {
  background: #fff;
}

.speaker-outcome-message::-webkit-scrollbar-thumb,
.speaker-outcome-recipients::-webkit-scrollbar-thumb {
  border: 1px solid #fff;
  border-radius: 8px;
  background: #767676;
}
</style>
