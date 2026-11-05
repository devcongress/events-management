<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AppPagination from '@/src/components/AppPagination.vue';
import { fetchJson } from '@/src/lib/api';
import { notify } from '@/src/lib/notify';

type Campaign = { id: string; subject: string; message: string; version: number; state: 'draft' | 'queued' | 'complete'; created_at: string; updated_at: string };
type Candidate = { id: string; name: string; email: string; eligible?: boolean; reason?: string | null };
type Delivery = { id: string; name: string; recipient: string; status: string; last_error: string | null; attempt_count: number; last_attempt_at?: string | null; updated_at?: string | null };
type Recipient = { id: string; name: string; recipient: string; subject: string; html: string };

const props = defineProps<{ year: string; configured: boolean; active: boolean }>();
const campaigns = ref<Campaign[]>([]);
const candidates = ref<Candidate[]>([]);
const defaultDraft = ref({ subject: '', message: '' });
const campaign = ref<Campaign | null>(null);
const deliveries = ref<Delivery[]>([]);
const selected = ref<string[]>([]);
const recipients = ref<Recipient[]>([]);
const previewToken = ref('');
const previewId = ref('');
const drawerOpen = ref(false);
const testMode = ref(false);
const testEmailInput = ref<HTMLInputElement | null>(null);
const drawer = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const busy = ref(false);
const loading = ref(true);
const error = ref('');
const sendingEnabled = ref(false);
const sendUnavailableReason = ref('');
const testEmail = ref('');
const testFeedback = ref('');
const testError = ref('');
const page = ref(1);
const deliveryPage = ref(1);
const saved = ref('');
const pendingTests = new Map<string, string>();
let previousFocus: HTMLElement | null = null;
let previousOverflow = '';
let previousDocumentOverflow = '';

const base = computed(() => `/api/annual-conference/${props.year}/speaker-updates`);
const currentPreview = computed(() => recipients.value.find((item) => item.id === previewId.value));
const dirty = computed(() => Boolean(campaign.value && JSON.stringify([campaign.value.subject, campaign.value.message]) !== saved.value));
const pageCount = computed(() => Math.max(1, Math.ceil(candidates.value.length / 6)));
const visibleCandidates = computed(() => candidates.value.slice((page.value - 1) * 6, page.value * 6));
const deliveryPageCount = computed(() => Math.max(1, Math.ceil(deliveries.value.length / 6)));
const visibleDeliveries = computed(() => deliveries.value.slice((deliveryPage.value - 1) * 6, deliveryPage.value * 6));

function deliveryStatus(status: string) {
  const labels: Record<string, string> = { queued: 'Queued', sending: 'Sending', accepted: 'Accepted by provider', delivered: 'Delivered', failed: 'Failed', bounced: 'Bounced', complained: 'Complained', suppressed: 'Suppressed' };

  return labels[status] ?? status;
}

function deliveryTime(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return '';

  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Accra' }).format(new Date(value));
}

function clearPreview() {
  drawerOpen.value = false;
  recipients.value = [];
  previewToken.value = '';
  previewId.value = '';
}

function onDrawerKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    drawerOpen.value = false;

    return;
  }
  if (event.key !== 'Tab' || !drawer.value) return;
  const focusable = Array.from(drawer.value.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])')).filter((element) => element.getClientRects().length > 0);
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
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.addEventListener('keydown', onDrawerKeydown);
    await nextTick();
    if (drawerOpen.value) (testMode.value ? testEmailInput.value : closeButton.value)?.focus();
  } else {
    document.removeEventListener('keydown', onDrawerKeydown);
    document.body.style.overflow = previousOverflow;
    document.documentElement.style.overflow = previousDocumentOverflow;
    await nextTick();
    if (!drawerOpen.value) {
      if (previousFocus?.isConnected) previousFocus.focus();
      previousFocus = null;
      testMode.value = false;
    }
  }
});
watch([previewId, previewToken], () => { testEmail.value = ''; testFeedback.value = ''; testError.value = ''; });
watch(selected, clearPreview, { deep: true });
watch(() => props.active, (active) => { if (!active) clearPreview(); });
watch(() => props.year, () => { campaign.value = null; selected.value = []; clearPreview(); void load(); });
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDrawerKeydown);
  if (drawerOpen.value) {
    document.body.style.overflow = previousOverflow;
    document.documentElement.style.overflow = previousDocumentOverflow;
  }
});
onMounted(load);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const result = await fetchJson<{ campaigns: Campaign[]; candidates: Candidate[]; default_draft: { subject: string; message: string }; sending_enabled: boolean; send_unavailable_reason: string | null }>(base.value, { credentials: 'include' });

    campaigns.value = result.campaigns;
    candidates.value = result.candidates;
    defaultDraft.value = result.default_draft;
    sendingEnabled.value = result.sending_enabled;
    sendUnavailableReason.value = result.send_unavailable_reason ?? '';
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to load speaker updates.';
  } finally {
    loading.value = false;
  }
}

async function openCampaign(id: string, discardConfirmed = false) {
  if (!discardConfirmed && dirty.value && campaign.value?.id === id) return;
  if (!discardConfirmed && dirty.value && campaign.value?.id !== id && !window.confirm('Discard unsaved changes to this update?')) return;
  busy.value = true;
  clearPreview();
  selected.value = [];
  try {
    const result = await fetchJson<{ campaign: Campaign; deliveries: Delivery[] }>(`${base.value}/${id}`, { credentials: 'include' });

    campaign.value = result.campaign;
    deliveries.value = result.deliveries;
    saved.value = JSON.stringify([result.campaign.subject, result.campaign.message]);
    deliveryPage.value = 1;
  } catch (cause) {
    notify.error(cause instanceof Error ? cause.message : 'Unable to open the update.');
  } finally {
    busy.value = false;
  }
}

async function createDraft() {
  if (dirty.value && !window.confirm('Discard unsaved changes to this update?')) return;
  busy.value = true;
  try {
    const result = await fetchJson<{ campaign: Campaign }>(base.value, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(defaultDraft.value) });

    await load();
    await openCampaign(result.campaign.id, true);
  } catch (cause) {
    notify.error(cause instanceof Error ? cause.message : 'Unable to create an update.');
  } finally {
    busy.value = false;
  }
}

async function save() {
  if (!campaign.value) return;
  busy.value = true;
  try {
    const result = await fetchJson<{ campaign: Campaign }>(`${base.value}/${campaign.value.id}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: campaign.value.subject, message: campaign.value.message, version: campaign.value.version }) });

    campaign.value = result.campaign;
    saved.value = JSON.stringify([result.campaign.subject, result.campaign.message]);
    clearPreview();
    await load();
    notify.success('Speaker update saved.');
  } catch (cause) {
    notify.error(cause instanceof Error ? cause.message : 'Unable to save the update.');
  } finally {
    busy.value = false;
  }
}

async function prepare(event: MouseEvent, mode: 'review' | 'test' = 'review') {
  if (!campaign.value) return;
  previousFocus = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  testMode.value = mode === 'test';
  busy.value = true;
  try {
    const result = await fetchJson<{ preview_id: string; recipients: Recipient[] }>(`${base.value}/${campaign.value.id}/preview`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selected.value, version: campaign.value.version }) });

    if (!props.active) return;
    previewToken.value = result.preview_id;
    recipients.value = result.recipients;
    previewId.value = result.recipients[0]?.id ?? '';
    drawerOpen.value = Boolean(previewId.value);
  } catch (cause) {
    clearPreview();
    notify.error(cause instanceof Error ? cause.message : 'Unable to preview the update.');
  } finally {
    busy.value = false;
  }
}

async function sendTest() {
  if (!campaign.value || !currentPreview.value || !testEmail.value.trim()) return;
  busy.value = true;
  testFeedback.value = '';
  testError.value = '';
  const signature = JSON.stringify([previewToken.value, currentPreview.value.id, testEmail.value.trim().toLowerCase()]);
  const requestId = pendingTests.get(signature) ?? crypto.randomUUID();

  pendingTests.set(signature, requestId);
  try {
    const result = await fetchJson<{ recipient: string }>(`${base.value}/${campaign.value.id}/test`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preview_id: previewToken.value, recipient_id: currentPreview.value.id, email: testEmail.value.trim(), request_id: requestId }) });

    pendingTests.delete(signature);
    if (signature === JSON.stringify([previewToken.value, currentPreview.value?.id, testEmail.value.trim().toLowerCase()])) testFeedback.value = `Test accepted for ${result.recipient}. Check your inbox; delivery is not yet confirmed.`;
  } catch (cause) {
    if (signature === JSON.stringify([previewToken.value, currentPreview.value?.id, testEmail.value.trim().toLowerCase()])) testError.value = cause instanceof Error ? cause.message : 'Unable to confirm test delivery.';
  } finally {
    busy.value = false;
  }
}

async function send() {
  if (!campaign.value) return;
  const id = campaign.value.id;

  busy.value = true;
  try {
    const result = await fetchJson<{ queued: number }>(`${base.value}/${id}/send`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preview_id: previewToken.value, confirmed: true }) });

    clearPreview();
    selected.value = [];
    await load();
    await openCampaign(id);
    notify.success(`${result.queued} speaker update${result.queued === 1 ? '' : 's'} queued for delivery.`);
  } catch (cause) {
    notify.error(cause instanceof Error ? cause.message : 'Unable to send the update. Check delivery before retrying.');
  } finally {
    busy.value = false;
  }
}

async function retry(delivery: Delivery) {
  if (!campaign.value) return;
  const id = campaign.value.id;

  busy.value = true;
  try {
    await fetchJson(`${base.value}/${id}/deliveries/${delivery.id}/retry`, { method: 'POST', credentials: 'include' });
    await openCampaign(id);
    notify.success('Delivery queued for retry.');
  } catch (cause) {
    notify.error(cause instanceof Error ? cause.message : 'Unable to retry delivery.');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="mt-6 rounded-lg border border-dc-border bg-dc-paper p-5">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-xl font-bold">Speaker updates</h2>
        <p class="mt-1 text-sm text-dc-gray">Send a separate update to speakers who received an acceptance. The original acceptance and its delivery history stay unchanged.</p>
      </div>
      <button type="button" class="editorial-action update-primary" :disabled="busy || loading || !!error" @click="createDraft">New update</button>
    </div>
    <p v-if="loading" class="mt-4 text-sm text-dc-gray">Loading updates…</p>
    <p v-else-if="error" class="mt-4 text-sm text-red-700" role="alert">{{ error }} <button type="button" class="underline" @click="load">Try again</button></p>
    <template v-else>
      <div v-if="campaigns.length" class="mt-4 divide-y divide-dc-border border-y border-dc-border" aria-label="Update history">
        <button v-for="item in campaigns" :key="item.id" type="button" class="update-history-row" :aria-current="campaign?.id === item.id ? 'true' : undefined" :disabled="busy" @click="openCampaign(item.id)">
          <span class="min-w-0 break-words text-left font-semibold">{{ item.subject }}</span><span class="text-sm text-dc-gray">{{ item.state === 'draft' ? 'Draft' : item.state === 'queued' ? 'Queued' : 'Completed' }}</span>
        </button>
      </div>
      <p v-else class="mt-4 text-sm text-dc-gray">No speaker updates yet. Create an update to get started.</p>
      <template v-if="campaign">
        <div class="mt-5 grid gap-3">
          <h3 class="font-bold">{{ campaign.state === 'draft' ? 'Edit update' : 'Update details' }}</h3>
          <label class="text-sm font-semibold">Subject<input v-model="campaign.subject" class="app-form-control mt-1 w-full" maxlength="200" :disabled="campaign.state !== 'draft' || busy" @input="clearPreview"></label>
          <label class="text-sm font-semibold">Message<textarea v-model="campaign.message" class="app-form-control update-message mt-1 w-full" rows="7" maxlength="10000" :disabled="campaign.state !== 'draft' || busy" @input="clearPreview" /></label>
          <template v-if="campaign.state === 'draft'">
            <p class="text-xs text-dc-gray">Use {first_name}, {talk_title}, {edition}, {year}, {workspace_url} to personalize this update.</p>
            <div><button type="button" class="editorial-action update-primary" :disabled="busy || !dirty" @click="save">Save update</button></div>
          </template>
        </div>
        <div v-if="campaign.state === 'draft'" class="mt-6 border-t border-dc-border pt-4">
          <h3 class="font-bold">Choose recipients</h3>
          <p class="mt-1 text-sm text-dc-gray">Only speakers with a prior acceptance are eligible. Review the personalized update before sending.</p>
          <p v-if="!candidates.length" class="mt-3 text-sm text-dc-gray">No speakers are currently eligible for an update.</p>
          <div v-else class="mt-2 divide-y divide-dc-border border-y border-dc-border">
            <label v-for="item in visibleCandidates" :key="item.id" class="flex min-h-11 items-center gap-3 py-2 text-sm">
              <input v-model="selected" type="checkbox" class="accent-dc-pink" :value="item.id" :disabled="busy || item.eligible === false || (selected.length >= 100 && !selected.includes(item.id))">
              <span><strong>{{ item.name }}</strong> · {{ item.email }}<span v-if="item.eligible === false" class="block text-red-700">{{ item.reason || 'Not eligible for an update.' }}</span></span>
            </label>
          </div>
          <AppPagination v-model:page="page" :page-count="pageCount" :total="candidates.length" :range-start="candidates.length ? (page - 1) * 6 + 1 : 0" :range-end="Math.min(candidates.length, page * 6)" item-label="speakers" aria-label="Speaker update recipients" />
          <p v-if="dirty" class="mt-3 text-sm text-dc-gray">Save your changes before previewing or testing.</p>
          <p v-if="!selected.length" class="mt-3 text-sm text-dc-gray">Choose at least one speaker to personalize a preview or test.</p>
          <p v-if="!configured" class="mt-3 text-sm text-dc-gray">Email delivery is not configured for test emails.</p>
          <p v-if="!sendingEnabled" class="mt-3 text-sm text-dc-gray">{{ sendUnavailableReason || 'Sending speaker updates is unavailable.' }}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" class="editorial-action update-primary" :disabled="busy || dirty || !selected.length" @click="prepare($event)">Preview {{ selected.length }} selected</button>
            <button type="button" class="editorial-action" :disabled="busy || dirty || !selected.length || !configured" @click="prepare($event, 'test')">Send test email</button>
          </div>
        </div>
        <div v-else class="mt-6 border-t border-dc-border pt-4">
          <h3 class="font-bold">Update delivery</h3>
          <p class="mt-1 text-sm text-dc-gray">Provider acceptance is not confirmation of inbox delivery.</p>
          <p v-if="!sendingEnabled" class="mt-2 text-sm text-dc-gray">{{ sendUnavailableReason || 'Sending speaker updates is unavailable.' }}</p>
          <p v-if="!deliveries.length" class="mt-3 text-sm text-dc-gray">No delivery records yet.</p>
          <div v-else class="mt-3 divide-y divide-dc-border border-y border-dc-border">
            <div v-for="item in visibleDeliveries" :key="item.id" class="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div class="min-w-0 break-words"><strong>{{ item.name }}</strong> · {{ item.recipient }}<br><span class="text-dc-gray">{{ deliveryStatus(item.status) }} · {{ item.attempt_count }} attempt{{ item.attempt_count === 1 ? '' : 's' }}<template v-if="deliveryTime(item.last_attempt_at)"> · Last attempt {{ deliveryTime(item.last_attempt_at) }} (Accra)</template></span><span v-if="item.last_error" class="block text-red-700">{{ item.last_error }}</span></div>
              <button v-if="item.status === 'failed'" type="button" class="editorial-action" :disabled="busy || !sendingEnabled" @click="retry(item)">Retry</button>
            </div>
          </div>
          <AppPagination v-model:page="deliveryPage" :page-count="deliveryPageCount" :total="deliveries.length" :range-start="deliveries.length ? (deliveryPage - 1) * 6 + 1 : 0" :range-end="Math.min(deliveries.length, deliveryPage * 6)" item-label="deliveries" aria-label="Speaker update delivery pagination" />
        </div>
      </template>
    </template>
    <Teleport to="body">
      <div v-if="drawerOpen && currentPreview" class="update-backdrop" @click.self="drawerOpen = false">
        <section ref="drawer" class="update-drawer" role="dialog" aria-modal="true" aria-labelledby="update-preview-title" tabindex="-1">
          <header class="update-drawer-header"><div><p class="text-sm text-dc-gray">Owner preview · 10 minute snapshot</p><h2 id="update-preview-title" class="text-xl font-bold">{{ testMode ? 'Send test email' : 'Review speaker updates' }}</h2></div><button ref="closeButton" type="button" class="editorial-action" @click="drawerOpen = false">Close</button></header>
          <div class="update-drawer-body">
            <p class="text-sm text-dc-gray">Choose the speaker whose frozen email you want to {{ testMode ? 'test' : 'review' }}.</p>
            <div class="mt-2 flex flex-wrap gap-2" role="group" aria-label="Preview recipient"><button v-for="recipient in recipients" :key="recipient.id" type="button" class="editorial-action" :aria-pressed="previewId === recipient.id" @click="previewId = recipient.id">{{ recipient.name }}</button></div>
            <form class="mt-4 grid gap-2" @submit.prevent="sendTest">
              <label for="update-test-email" class="text-sm font-semibold">Test recipient</label>
              <input id="update-test-email" ref="testEmailInput" v-model="testEmail" class="app-form-control w-full" type="email" maxlength="254" :disabled="busy || !configured" required placeholder="you@example.com">
              <p class="text-sm text-dc-gray">The test includes this speaker's private link. It does not change the delivery queue.</p>
              <div><button type="submit" class="editorial-action" :class="{ 'update-primary': testMode }" :disabled="busy || !configured || !testEmail.trim()">Send test email</button></div>
              <p v-if="testFeedback" role="status">{{ testFeedback }}</p><p v-if="testError" role="alert">{{ testError }}</p>
            </form>
            <p class="mt-3 break-words text-sm"><template v-if="testMode"><strong>Personalized for:</strong> {{ currentPreview.name }} · {{ currentPreview.recipient }}</template><template v-else><strong>To:</strong> {{ currentPreview.recipient }}</template><br><strong>Subject:</strong> {{ currentPreview.subject }}</p>
            <iframe :srcdoc="currentPreview.html" sandbox="" tabindex="-1" title="Personalized speaker update preview" class="mt-3 h-96 w-full border border-dc-border bg-white" />

            <p v-if="!configured" class="mt-3 text-sm text-dc-gray">Email delivery is not configured for test emails.</p>
            <p v-if="!testMode && !sendingEnabled" class="mt-3 text-sm text-dc-gray">{{ sendUnavailableReason || 'Sending speaker updates is unavailable.' }}</p>
            <p v-if="!testMode" class="mt-4 text-sm text-dc-gray">Sending queues this update for {{ recipients.length }} speaker{{ recipients.length === 1 ? '' : 's' }}. Provider acceptance is not confirmation of delivery.</p>
          </div>
          <footer v-if="!testMode" class="update-drawer-footer"><button type="button" class="editorial-action update-primary" :disabled="busy || !sendingEnabled" @click="send">Send update to {{ recipients.length }} speaker{{ recipients.length === 1 ? '' : 's' }}</button></footer>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.editorial-action {
  min-height: 44px;
  padding: .55rem .85rem;
  border: 1px solid #d3d0c9;
  border-radius: 6px;
  background: #fff;
  box-shadow: none;
  color: #25231f;
  font-family: inherit;
  font-size: .875rem;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}

.editorial-action.update-primary {
  border-color: #c80d68;
  background: #c80d68;
  color: white;
}

.editorial-action[aria-pressed="true"] {
  border-color: #c80d68;
  color: #a50c57;
}

.editorial-action:focus-visible,
.update-history-row:focus-visible {
  outline: 2px solid #c80d68;
  outline-offset: 3px;
}

.update-history-row {
  display: flex;
  width: 100%;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: .6rem 0;
}

.update-history-row[aria-current="true"] {
  color: #c80d68;
}

.update-message {
  min-height: 170px;
  resize: vertical;
}

.update-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  justify-content: flex-end;
  background: rgb(25 23 20 / 38%);
}

.update-drawer {
  display: flex;
  width: min(42rem, 100%);
  height: 100%;
  flex-direction: column;
  background: white;
}

.update-drawer-header,
.update-drawer-footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem;
  border-bottom: 1px solid #e6e3dc;
}

.update-drawer-header button {
  flex: none;
  width: auto;
}

.update-drawer-footer {
  padding-bottom: max(1.25rem, env(safe-area-inset-bottom));
  border-top: 1px solid #e6e3dc;
  border-bottom: 0;
}

.update-drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem;
}
</style>
