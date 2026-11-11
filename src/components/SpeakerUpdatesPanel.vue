<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AppDropdown from '@/src/components/AppDropdown.vue';
import { usePhoneViewport } from '@/src/composables/usePhoneViewport';
import AppPagination from '@/src/components/AppPagination.vue';
import { fetchJson } from '@/src/lib/api';
import { notify } from '@/src/lib/notify';

type Campaign = { delivery_summary?: { total: number; statuses: Record<string, number> }; id: string; subject: string; message: string; version: number; state: 'draft' | 'queued' | 'complete'; created_at: string; updated_at: string };
type Candidate = { id: string; name: string; email: string; eligible?: boolean; reason?: string | null; missing_workspace_details?: string[] | null };
type Delivery = { id: string; name: string; recipient: string; status: string; last_error: string | null; attempt_count: number; last_attempt_at?: string | null; updated_at?: string | null };
type Recipient = { id: string; name: string; recipient: string; subject: string; preview_url: string };

const props = defineProps<{ year: string; configured: boolean; active: boolean; canManage: boolean; canSend: boolean; canRetry: boolean }>();
const campaigns = ref<Campaign[]>([]);
const candidates = ref<Candidate[]>([]);
const campaign = ref<Campaign | null>(null);
const deliveries = ref<Delivery[]>([]);
const selected = ref<string[]>([]);
const recipients = ref<Recipient[]>([]);
const previewToken = ref('');
const previewId = ref('');
const drawerOpen = ref(false);
const detailsOpen = ref(false);
const detailsDrawer = ref<HTMLElement | null>(null);
const detailsClose = ref<HTMLButtonElement | null>(null);
const historyFilter = ref('all');
const historyPage = ref(1);
const startingPoint = ref('blank');
const audienceMode = ref('selected');
const startOptions = computed(() => [
  { value: 'blank', label: 'Blank update' },
  { value: 'reminder', label: 'Workspace reminder' },
  ...campaigns.value.map(item => ({ value: item.id, label: `Copy: ${item.subject}` })),
]);
const audienceOptions = [
  { value: 'all', label: 'All eligible speakers' },
  { value: 'missing', label: 'Missing workspace details' },
  { value: 'selected', label: 'Selected speakers' },
];
const phone = usePhoneViewport();
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
const testError = ref('');
const page = ref(1);
const deliveryPage = ref(1);
const saved = ref('');
const pendingTests = new Map<string, string>();
let previousFocus: HTMLElement | null = null;
let detailsPreviousFocus: HTMLElement | null = null;
let previousOverflow = '';
let previousDocumentOverflow = '';
let testContextVersion = 0;
let detailsContextVersion = 0;

const base = computed(() => `/api/annual-conference/${props.year}/speaker-updates`);
const currentPreview = computed(() => recipients.value.find((item) => item.id === previewId.value));
const previewPosition = computed(() => recipients.value.findIndex(item => item.id === previewId.value) + 1);
const previewOptions = computed(() => recipients.value.map(item => ({ value: item.id, label: item.name })));
const dirty = computed(() => Boolean(campaign.value && (!campaign.value.id || JSON.stringify([campaign.value.subject, campaign.value.message]) !== saved.value)));
const filteredCampaigns = computed(() => campaigns.value.filter(item => historyFilter.value === 'all' || (historyFilter.value === 'drafts' ? item.state === 'draft' : item.state !== 'draft')));
const historyPageCount = computed(() => Math.max(1, Math.ceil(filteredCampaigns.value.length / 6)));
const visibleCampaigns = computed(() => filteredCampaigns.value.slice((historyPage.value - 1) * 6, historyPage.value * 6));
const missingCandidates = computed(() => eligibleCandidates.value.filter(item => item.missing_workspace_details?.length));

function historyLabel(item: Campaign) {
  if (item.state === 'draft') return 'Draft';
  if (item.delivery_summary?.statuses.sending) return 'Sending';
  if (item.delivery_summary?.statuses.queued) return 'Queued';
  if (['failed', 'bounced', 'complained', 'suppressed'].some(status => item.delivery_summary?.statuses[status])) return 'Needs attention';

  return 'Sent';
}

function historySummary(item: Campaign) {
  if (item.state === 'draft') return 'Not sent';
  const summary = item.delivery_summary;

  if (!summary) return 'Delivery details available';
  const statuses = Object.entries(summary.statuses).map(([status, count]) => `${count} ${deliveryStatus(status).toLowerCase()}`).join(', ');

  return `${summary.total} recipient${summary.total === 1 ? '' : 's'}${statuses ? ` · ${statuses}` : ''}`;
}

function setAudience(value: string | number | null) {
  const mode = String(value ?? 'selected');

  audienceMode.value = mode;
  if (mode === 'all') selected.value = eligibleCandidates.value.slice(0, 100).map(item => item.id);
  if (mode === 'missing') selected.value = missingCandidates.value.slice(0, 100).map(item => item.id);
  if (mode === 'selected') selected.value = [];
}

function applyStartingPoint(input: string | number | null) {
  const value = String(input ?? 'blank');

  if (!campaign.value || campaign.value.id) return;
  if ((campaign.value.subject || campaign.value.message) && !window.confirm('Replace the current subject and message?')) return;
  startingPoint.value = value;
  const reminder = {
    subject: 'A reminder to update your {edition} speaker details',
    message: `Hi {first_name},\n\nPlease confirm your participation and add your headshot and social media handles in your private speaker workspace${props.year === '2026' ? ' by 12 November' : ''}:\n\n{workspace_url}\n\nPlease keep your private link to yourself.\n\nThank you,\nDevCongress Event Organizers`,
  };
  const source = value === 'reminder' ? reminder : campaigns.value.find(item => item.id === value);

  campaign.value.subject = source?.subject ?? '';
  campaign.value.message = source?.message ?? '';
}

function closeDetails(force = false) {
  if (!force && dirty.value && !window.confirm('Discard unsaved changes to this update?')) return;
  detailsContextVersion += 1;
  detailsOpen.value = false;
  clearPreview();
  campaign.value = null;
}

const eligibleCandidates = computed(() => candidates.value.filter(item => item.eligible !== false));
const allEligibleSelected = computed(() => eligibleCandidates.value.length > 0
  && eligibleCandidates.value.length <= 100
  && eligibleCandidates.value.every(item => selected.value.includes(item.id)));
const partiallySelected = computed(() => selected.value.length > 0 && !allEligibleSelected.value);
const pageCount = computed(() => Math.max(1, Math.ceil(candidates.value.length / 6)));
const visibleCandidates = computed(() => candidates.value.slice((page.value - 1) * 6, page.value * 6));
const deliveryPageCount = computed(() => Math.max(1, Math.ceil(deliveries.value.length / 6)));
const visibleDeliveries = computed(() => deliveries.value.slice((deliveryPage.value - 1) * 6, deliveryPage.value * 6));

function selectEligible(event: Event) {
  const checked = (event.target as HTMLInputElement).checked;

  selected.value = checked ? eligibleCandidates.value.slice(0, 100).map(item => item.id) : [];
}

function clearSelection() {
  selected.value = [];
}

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
    const openDropdown = drawer.value?.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"][aria-expanded="true"]');

    if (openDropdown) {
      event.preventDefault();
      openDropdown.click();
      openDropdown.focus();

      return;
    }
    event.preventDefault();
    drawerOpen.value = false;

    return;
  }
  if (event.key !== 'Tab' || !drawer.value) return;
  const focusable = Array.from(drawer.value.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')).filter((element) => element.getClientRects().length > 0);
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

function onDetailsKeydown(event: KeyboardEvent) {
  if (drawerOpen.value) return;
  if (event.key === 'Escape') {
    const openDropdown = detailsDrawer.value?.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"][aria-expanded="true"]');

    if (openDropdown) {
      event.preventDefault();
      openDropdown.click();
      openDropdown.focus();

      return;
    }
    event.preventDefault();
    closeDetails();
  } else if (event.key === 'Tab' && detailsDrawer.value) {
    const focusable = Array.from(detailsDrawer.value.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')).filter(element => element.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable.at(-1);

    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
}

watch(() => detailsOpen.value || drawerOpen.value, (open) => {
  if (open) {
    previousOverflow = document.body.style.overflow;
    previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = previousOverflow;
    document.documentElement.style.overflow = previousDocumentOverflow;
  }
}, { flush: 'sync' });

watch(detailsOpen, async (open) => {
  if (open) {
    detailsPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.addEventListener('keydown', onDetailsKeydown);
    await nextTick();
    detailsClose.value?.focus();
  } else {
    document.removeEventListener('keydown', onDetailsKeydown);
    await nextTick();
    if (detailsPreviousFocus?.isConnected) detailsPreviousFocus.focus();
    detailsPreviousFocus = null;
  }
});
watch(historyFilter, () => { historyPage.value = 1; });

watch(phone, async (isPhone) => {
  if (isPhone || !drawerOpen.value) return;
  const trigger = drawer.value?.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"][aria-expanded="true"]');
  const focusWasInPicker = Boolean(trigger || drawer.value?.querySelector('.recipient-picker')?.contains(document.activeElement));

  if (!focusWasInPicker) return;
  await nextTick();
  if (drawerOpen.value && !phone.value) drawer.value?.querySelector<HTMLButtonElement>('[role="group"][aria-label="Preview recipient"] button[aria-pressed="true"]')?.focus();
}, { flush: 'sync' });

watch(drawerOpen, async (open) => {
  if (open) {
    document.addEventListener('keydown', onDrawerKeydown);
    await nextTick();
    if (drawerOpen.value) (testMode.value ? testEmailInput.value : closeButton.value)?.focus();
  } else {
    document.removeEventListener('keydown', onDrawerKeydown);
    await nextTick();
    if (!drawerOpen.value) {
      if (previousFocus?.isConnected) previousFocus.focus();
      previousFocus = null;
      testMode.value = false;
    }
  }
});
watch([previewId, previewToken], () => { testEmail.value = ''; testError.value = ''; }, { flush: 'sync' });
watch([previewId, previewToken, drawerOpen, () => props.year], () => { testContextVersion += 1; }, { flush: 'sync' });
watch(selected, clearPreview, { deep: true });
watch(() => props.active, (active) => { if (!active) { detailsContextVersion += 1; clearPreview(); detailsOpen.value = false; } });
watch(() => props.year, () => { closeDetails(true); selected.value = []; void load(); });
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDrawerKeydown);
  document.removeEventListener('keydown', onDetailsKeydown);
  if (detailsOpen.value || drawerOpen.value) {
    document.body.style.overflow = previousOverflow;
    document.documentElement.style.overflow = previousDocumentOverflow;
  }
});
onMounted(load);

async function load() {
  loading.value = true;
  error.value = '';
  const year = props.year;

  try {
    const result = await fetchJson<{ campaigns: Campaign[]; candidates: Candidate[]; default_draft: { subject: string; message: string }; sending_enabled: boolean; send_unavailable_reason: string | null }>(base.value, { credentials: 'include' });

    if (props.year !== year) return;
    campaigns.value = [...result.campaigns].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    candidates.value = result.candidates;
    const eligibleIds = new Set(result.candidates.filter(item => item.eligible !== false).map(item => item.id));
    const retained = selected.value.filter(id => eligibleIds.has(id));

    if (retained.length !== selected.value.length) selected.value = retained;
    page.value = Math.min(page.value, Math.max(1, Math.ceil(result.candidates.length / 6)));
    sendingEnabled.value = result.sending_enabled;
    sendUnavailableReason.value = result.send_unavailable_reason ?? '';
  } catch (cause) {
    if (props.year === year) error.value = cause instanceof Error ? cause.message : 'Unable to load speaker updates.';
  } finally {
    if (props.year === year) loading.value = false;
  }
}

async function openCampaign(id: string, discardConfirmed = false) {
  if (!discardConfirmed && dirty.value && campaign.value?.id === id) {
    detailsOpen.value = true;

    return;
  }
  if (!discardConfirmed && dirty.value && campaign.value?.id !== id && !window.confirm('Discard unsaved changes to this update?')) return;
  busy.value = true;
  clearPreview();
  selected.value = [];
  audienceMode.value = 'selected';
  const year = props.year;
  const contextVersion = ++detailsContextVersion;

  try {
    const result = await fetchJson<{ campaign: Campaign; deliveries: Delivery[] }>(`${base.value}/${id}`, { credentials: 'include' });

    if (props.year !== year || !props.active || contextVersion !== detailsContextVersion) return;
    campaign.value = result.campaign;
    deliveries.value = result.deliveries;
    detailsOpen.value = true;
    saved.value = JSON.stringify([result.campaign.subject, result.campaign.message]);
    deliveryPage.value = 1;
  } catch (cause) {
    notify.error(cause instanceof Error ? cause.message : 'Unable to open the update.');
  } finally {
    busy.value = false;
  }
}

function createDraft(source?: Campaign) {
  if (!source && !detailsOpen.value && campaign.value && !campaign.value.id) {
    detailsOpen.value = true;

    return;
  }
  if (dirty.value && !window.confirm('Discard unsaved changes to this update?')) return;
  detailsContextVersion += 1;
  clearPreview();
  selected.value = [];
  deliveries.value = [];
  audienceMode.value = 'selected';
  startingPoint.value = source?.id ?? 'blank';
  campaign.value = { id: '', subject: source?.subject ?? '', message: source?.message ?? '', version: 0, state: 'draft', created_at: '', updated_at: '' };
  saved.value = '';
  detailsOpen.value = true;
}

async function save() {
  if (!campaign.value) return;
  busy.value = true;
  const contextVersion = detailsContextVersion;
  const year = props.year;

  try {
    const isNew = !campaign.value.id;
    const payload = { subject: campaign.value.subject, message: campaign.value.message, ...(isNew ? {} : { version: campaign.value.version }) };
    const result = await fetchJson<{ campaign: Campaign }>(isNew ? base.value : `${base.value}/${campaign.value.id}`, { method: isNew ? 'POST' : 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

    if (contextVersion !== detailsContextVersion || year !== props.year) return;
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
  if (!campaign.value?.id) return;
  previousFocus = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  testMode.value = mode === 'test';
  busy.value = true;
  const context = JSON.stringify([props.year, campaign.value.id, campaign.value.version, selected.value, detailsContextVersion]);

  try {
    const result = await fetchJson<{ preview_id: string; recipients: Recipient[] }>(`${base.value}/${campaign.value.id}/preview`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selected.value, version: campaign.value.version }) });

    if (!props.active || context !== JSON.stringify([props.year, campaign.value?.id, campaign.value?.version, selected.value, detailsContextVersion]) || !detailsOpen.value) return;
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
  testError.value = '';
  const signature = JSON.stringify([previewToken.value, currentPreview.value.id, testEmail.value.trim().toLowerCase()]);
  const requestId = pendingTests.get(signature) ?? crypto.randomUUID();
  const contextVersion = testContextVersion;

  pendingTests.set(signature, requestId);
  try {
    const result = await fetchJson<{ recipient: string }>(`${base.value}/${campaign.value.id}/test`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preview_id: previewToken.value, recipient_id: currentPreview.value.id, email: testEmail.value.trim(), request_id: requestId }) });

    pendingTests.delete(signature);
    if (drawerOpen.value && contextVersion === testContextVersion && signature === JSON.stringify([previewToken.value, currentPreview.value?.id, testEmail.value.trim().toLowerCase()])) {
      clearPreview();
      closeDetails(true);
      notify.success(`Test email sent to ${result.recipient}.`);
    }
  } catch (cause) {
    if (drawerOpen.value && contextVersion === testContextVersion && signature === JSON.stringify([previewToken.value, currentPreview.value?.id, testEmail.value.trim().toLowerCase()])) testError.value = cause instanceof Error ? cause.message : 'Unable to confirm test delivery.';
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
  <section class="mt-2 overflow-hidden rounded-lg border border-dc-border bg-dc-paper">
    <div class="flex flex-wrap items-start justify-between gap-3 border-b border-dc-border px-5 py-4 sm:px-6">
      <div>
        <h2 class="text-xl font-bold">Speaker updates</h2>
        <p class="mt-1 text-sm text-dc-gray">Send a separate update to speakers who received an acceptance. The original acceptance and its delivery history stay unchanged.</p>
      </div>
      <button v-if="canManage" type="button" class="editorial-action update-primary" :disabled="busy || loading || !!error" @click="createDraft()">New update</button>
    </div>
    <p v-if="loading" class="px-5 py-4 text-sm text-dc-gray">Loading updates…</p>
    <p v-else-if="error" class="px-5 py-4 text-sm text-red-700" role="alert">{{ error }} <button type="button" class="underline" @click="load">Try again</button></p>
    <template v-else>
      <div class="flex flex-wrap gap-1.5 border-b border-dc-border px-5 py-3 sm:px-6" role="group" aria-label="Filter updates">
        <button v-for="filter in [{ key: 'all', label: 'All' }, { key: 'drafts', label: 'Drafts' }, { key: 'sent', label: 'Sent' }]" :key="filter.key" type="button" class="min-h-11 whitespace-nowrap rounded-md border px-3 py-2 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-dc-pink focus-visible:ring-offset-2" :class="historyFilter === filter.key ? 'border-dc-ink bg-dc-yellow text-dc-ink' : 'border-dc-border bg-dc-paper text-dc-gray'" :aria-pressed="historyFilter === filter.key" @click="historyFilter = filter.key">{{ filter.label }}</button>
      </div>
      <template v-if="visibleCampaigns.length">
        <table class="hidden w-full table-fixed border-collapse text-left md:table" aria-label="Update history">
          <thead class="border-b border-dc-border bg-dc-paper font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-pink">
            <tr><th scope="col" class="w-[30%] px-5 py-3 sm:px-6">Update</th><th scope="col" class="w-[16%] px-4 py-3">Status</th><th scope="col" class="w-[30%] px-4 py-3">Delivery</th><th scope="col" class="w-[19%] px-4 py-3">Updated</th><th scope="col" class="w-[5%] px-4 py-3"><span class="sr-only">Open update</span></th></tr>
          </thead>
          <tbody class="divide-y divide-dc-border bg-white">
            <tr v-for="item in visibleCampaigns" :key="item.id" class="h-14 cursor-pointer hover:bg-dc-paper-warm/40" @click="!busy && openCampaign(item.id)">
              <th scope="row" class="break-words px-5 py-2 text-sm font-semibold text-dc-ink sm:px-6"><button type="button" class="update-history-subject text-left" :disabled="busy" @click.stop="openCampaign(item.id)">{{ item.subject }}</button></th>
              <td class="break-words px-4 py-2 text-sm text-dc-gray">{{ historyLabel(item) }}</td>
              <td class="break-words px-4 py-2 text-sm text-dc-gray">{{ historySummary(item) }}</td>
              <td class="break-words px-4 py-2 text-sm text-dc-gray">{{ deliveryTime(item.updated_at) }}</td>
              <td class="px-4 py-2 text-right"><span aria-hidden="true" class="font-mono text-sm text-dc-gray">→</span></td>
            </tr>
          </tbody>
        </table>
        <ul class="update-history-mobile" aria-label="Update history">
          <li v-for="item in visibleCampaigns" :key="item.id">
            <button type="button" class="update-history-row" :disabled="busy" @click="openCampaign(item.id)">
              <strong class="break-words">{{ item.subject }}</strong>
              <span><span class="update-history-label">Status</span> {{ historyLabel(item) }}</span>
              <span><span class="update-history-label">Delivery</span> {{ historySummary(item) }}</span>
              <span><span class="update-history-label">Updated</span> {{ deliveryTime(item.updated_at) }}</span>
            </button>
          </li>
        </ul>
      </template>
      <p v-else class="px-5 py-5 text-sm text-dc-gray">{{ campaigns.length ? 'No updates in this view.' : 'No speaker updates yet. Create an update to get started.' }}</p>
      <AppPagination v-model:page="historyPage" :page-count="historyPageCount" :total="filteredCampaigns.length" :range-start="filteredCampaigns.length ? (historyPage - 1) * 6 + 1 : 0" :range-end="Math.min(filteredCampaigns.length, historyPage * 6)" item-label="updates" aria-label="Speaker update history" />
    </template>
    <Teleport to="body">
      <div v-if="detailsOpen && campaign" class="update-backdrop" @click.self="closeDetails()">
        <section ref="detailsDrawer" class="update-drawer" role="dialog" aria-modal="true" aria-labelledby="update-details-title" tabindex="-1">
          <header class="update-drawer-header"><div><p class="text-sm text-dc-gray">Speaker updates</p><h2 id="update-details-title" class="text-xl font-bold">{{ campaign.state === 'draft' ? (campaign.id ? 'Edit update' : 'New update') : 'Update details' }}</h2></div><button ref="detailsClose" type="button" class="update-close" aria-label="Close update" @click="closeDetails()">×</button></header>
          <div class="update-drawer-body">
      <template v-if="campaign">
        <div class="mt-5 grid gap-3">
          <AppDropdown v-if="!campaign.id" :model-value="startingPoint" :options="startOptions" label="Start with" menu-class="!z-[1201]" teleport @update:model-value="applyStartingPoint" />
          <label class="text-sm font-semibold">Subject<input v-model="campaign.subject" class="app-form-control mt-1 w-full" maxlength="200" :disabled="!canManage || campaign.state !== 'draft' || busy" @input="clearPreview"></label>
          <label class="text-sm font-semibold">Message<textarea v-model="campaign.message" class="app-form-control update-message mt-1 w-full" rows="7" maxlength="10000" :disabled="!canManage || campaign.state !== 'draft' || busy" @input="clearPreview" /></label>
          <template v-if="campaign.state === 'draft'">
            <p class="text-xs text-dc-gray">Use {first_name}, {talk_title}, {edition}, {year}, {workspace_url} to personalize this update.</p>
            <div v-if="canManage"><button type="button" class="editorial-action update-primary" :disabled="busy || !dirty" @click="save">Save update</button></div>
          </template>
        </div>
        <div v-if="campaign.state === 'draft' && (canManage || canSend)" class="mt-6 border-t border-dc-border pt-4">
          <h3 class="font-bold">Choose recipients</h3>
          <AppDropdown :model-value="audienceMode" :options="audienceOptions" label="Audience" menu-class="!z-[1201]" teleport @update:model-value="setAudience" />
          <p class="mt-2 text-sm text-dc-gray">{{ eligibleCandidates.length }} eligible · {{ candidates.length - eligibleCandidates.length }} excluded · {{ missingCandidates.length }} eligible missing confirmation, headshot or socials · {{ candidates.filter(item => item.missing_workspace_details === null).length }} workspace details unavailable</p>
          <p class="mt-1 text-sm text-dc-gray">Only speakers with a prior acceptance are eligible. Review the personalized update before sending.</p>
          <p v-if="!candidates.length" class="mt-3 text-sm text-dc-gray">No speakers are currently eligible for an update.</p>
          <div v-if="eligibleCandidates.length && audienceMode === 'selected'" class="mt-2 flex flex-wrap items-center justify-between gap-2">
            <label class="flex min-h-11 items-center gap-3 text-sm font-semibold">
              <input type="checkbox" class="accent-dc-pink" :checked="allEligibleSelected" :indeterminate.prop="partiallySelected" :disabled="busy" @change="selectEligible">
              {{ eligibleCandidates.length > 100 ? 'Select first 100 eligible' : 'Select all eligible' }}
            </label>
            <div class="flex items-center gap-3 text-sm"><span aria-live="polite">{{ selected.length }} selected</span><button type="button" class="min-h-11 font-semibold text-dc-pink underline disabled:opacity-50" :disabled="busy || !selected.length" @click="clearSelection">Clear all</button></div>
          </div>
          <p v-if="(audienceMode === 'all' && eligibleCandidates.length > 100) || (audienceMode === 'missing' && missingCandidates.length > 100) || (audienceMode === 'selected' && eligibleCandidates.length > 100)" class="text-sm text-dc-gray">Up to 100 speakers can be selected per update. The first 100 matching speakers are selected; choose recipients individually for another group.</p>
          <div v-if="candidates.length && audienceMode === 'selected'" class="mt-2 divide-y divide-dc-border border-y border-dc-border">
            <label v-for="item in visibleCandidates" :key="item.id" class="flex min-h-11 items-center gap-3 py-2 text-sm">
              <input v-model="selected" type="checkbox" class="accent-dc-pink" :value="item.id" :disabled="busy || item.eligible === false || (selected.length >= 100 && !selected.includes(item.id))">
              <span><strong>{{ item.name }}</strong> · {{ item.email }}<span v-if="item.missing_workspace_details === null" class="block text-dc-gray">Workspace details unavailable</span><span v-if="item.missing_workspace_details?.length" class="block text-dc-gray">Missing: {{ item.missing_workspace_details.join(', ') }}</span><span v-if="item.eligible === false" class="block text-red-700">{{ item.reason || 'Not eligible for an update.' }}</span></span>
            </label>
          </div>
          <AppPagination v-if="audienceMode === 'selected'" v-model:page="page" :page-count="pageCount" :total="candidates.length" :range-start="candidates.length ? (page - 1) * 6 + 1 : 0" :range-end="Math.min(candidates.length, page * 6)" item-label="speakers" aria-label="Speaker update recipients" />
          <p v-if="dirty" class="mt-3 text-sm text-dc-gray">Save this update before previewing or testing.</p>
          <p v-if="!selected.length" class="mt-3 text-sm text-dc-gray">Choose at least one speaker to personalize a preview or test.</p>
          <p v-if="!configured" class="mt-3 text-sm text-dc-gray">Email delivery is not configured for test emails.</p>
          <p v-if="!sendingEnabled" class="mt-3 text-sm text-dc-gray">{{ sendUnavailableReason || 'Sending speaker updates is unavailable.' }}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" class="editorial-action update-primary" :disabled="busy || dirty || !campaign.id || !selected.length" @click="prepare($event)">Preview {{ selected.length }} selected</button>
            <button v-if="canSend" type="button" class="editorial-action" :disabled="busy || dirty || !campaign.id || !selected.length || !configured" @click="prepare($event, 'test')">Send test email</button>
          </div>
        </div>
        <div v-else class="mt-6 border-t border-dc-border pt-4">
          <div class="flex flex-wrap items-center justify-between gap-2"><h3 class="font-bold">Update delivery</h3><button v-if="canManage" type="button" class="editorial-action" @click="createDraft(campaign)">Use as new update</button></div>
          <p class="mt-1 text-sm text-dc-gray">Provider acceptance is not confirmation of inbox delivery.</p>
          <p v-if="!sendingEnabled" class="mt-2 text-sm text-dc-gray">{{ sendUnavailableReason || 'Sending speaker updates is unavailable.' }}</p>
          <p v-if="!deliveries.length" class="mt-3 text-sm text-dc-gray">No delivery records yet.</p>
          <div v-else class="mt-3 divide-y divide-dc-border border-y border-dc-border">
            <div v-for="item in visibleDeliveries" :key="item.id" class="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div class="min-w-0 break-words"><strong>{{ item.name }}</strong> · {{ item.recipient }}<br><span class="text-dc-gray">{{ deliveryStatus(item.status) }} · {{ item.attempt_count }} attempt{{ item.attempt_count === 1 ? '' : 's' }}<template v-if="deliveryTime(item.last_attempt_at)"> · Last attempt {{ deliveryTime(item.last_attempt_at) }} (Accra)</template></span><span v-if="item.last_error" class="block text-red-700">{{ item.last_error }}</span></div>
              <button v-if="canRetry && item.status === 'failed'" type="button" class="editorial-action" :disabled="busy || !sendingEnabled" @click="retry(item)">Retry</button>
            </div>
          </div>
          <AppPagination v-model:page="deliveryPage" :page-count="deliveryPageCount" :total="deliveries.length" :range-start="deliveries.length ? (deliveryPage - 1) * 6 + 1 : 0" :range-end="Math.min(deliveries.length, deliveryPage * 6)" item-label="deliveries" aria-label="Speaker update delivery pagination" />
        </div>
      </template>
          </div>
        </section>
      </div>
      <div v-if="drawerOpen && currentPreview" class="update-backdrop" @click.self="drawerOpen = false">
        <section ref="drawer" class="update-drawer" role="dialog" aria-modal="true" aria-labelledby="update-preview-title" tabindex="-1">
          <header class="update-drawer-header"><div><p class="text-sm text-dc-gray">Owner preview · 10 minute snapshot</p><h2 id="update-preview-title" class="text-xl font-bold">{{ testMode ? 'Send test email' : 'Review speaker updates' }}</h2></div><button ref="closeButton" type="button" class="editorial-action" @click="drawerOpen = false">Close</button></header>
          <div class="update-drawer-body">
            <p class="text-sm text-dc-gray">Choose the speaker whose frozen email you want to {{ testMode ? 'test' : 'review' }}.</p>
            <div v-if="phone" class="recipient-picker mt-2">
              <AppDropdown v-model="previewId" :options="previewOptions" label="Preview recipient" menu-class="!z-[1201]" teleport />
              <p class="mt-1 text-sm text-dc-gray" aria-live="polite">{{ previewPosition }} of {{ recipients.length }} speakers</p>
            </div>
            <div class="mt-2 hidden flex-wrap gap-2 md:flex" role="group" aria-label="Preview recipient"><button v-for="recipient in recipients" :key="recipient.id" type="button" class="editorial-action" :aria-pressed="previewId === recipient.id" @click="previewId = recipient.id">{{ recipient.name }}</button></div>
            <form v-if="testMode" class="mt-4 grid gap-2" @submit.prevent="sendTest">
              <label for="update-test-email" class="text-sm font-semibold">Test recipient</label>
              <input id="update-test-email" ref="testEmailInput" v-model="testEmail" class="app-form-control w-full" type="email" maxlength="254" :disabled="busy || !configured" required placeholder="you@example.com">
              <p class="text-sm text-dc-gray">The test includes this speaker's private link. It does not change the delivery queue.</p>
              <div><button type="submit" class="editorial-action" :class="{ 'update-primary': testMode }" :disabled="busy || !configured || !testEmail.trim()">Send test email</button></div>
              <p v-if="testError" role="alert">{{ testError }}</p>
            </form>
            <p class="mt-3 break-words text-sm"><template v-if="testMode"><strong>Personalized for:</strong> {{ currentPreview.name }} · {{ currentPreview.recipient }}</template><template v-else><strong>To:</strong> {{ currentPreview.recipient }}</template><br><strong>Subject:</strong> {{ currentPreview.subject }}</p>
            <iframe :src="currentPreview.preview_url" sandbox="" referrerpolicy="no-referrer" tabindex="-1" title="Personalized speaker update preview" class="mt-3 h-96 w-full border border-dc-border bg-white" />

            <p v-if="testMode && !configured" class="mt-3 text-sm text-dc-gray">Email delivery is not configured for test emails.</p>
            <p v-if="!testMode && !sendingEnabled" class="mt-3 text-sm text-dc-gray">{{ sendUnavailableReason || 'Sending speaker updates is unavailable.' }}</p>
            <p v-if="!testMode" class="mt-4 text-sm text-dc-gray">Sending queues this update for {{ recipients.length }} speaker{{ recipients.length === 1 ? '' : 's' }}. Provider acceptance is not confirmation of delivery.</p>
          </div>
          <footer v-if="!testMode && canSend" class="update-drawer-footer"><button type="button" class="editorial-action update-primary" :disabled="busy || !sendingEnabled" @click="send">Send update to {{ recipients.length }} speaker{{ recipients.length === 1 ? '' : 's' }}</button></footer>
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

@media (hover: hover) and (pointer: fine) {
  .editorial-action:not(.update-primary):not(:disabled):hover {
    background: #f5f2e8;
  }

  .editorial-action.update-primary:not(:disabled):hover {
    background: #a50c57;
  }
}

.editorial-action[aria-pressed="true"] {
  border-color: #c80d68;
  color: #a50c57;
}

.editorial-action:focus-visible,
.update-history-row:focus-visible,
.update-history-subject:focus-visible,
.update-close:focus-visible,
.update-drawer input:focus-visible,
.update-drawer textarea:focus-visible {
  outline: 2px solid #c80d68;
  outline-offset: 3px;
}

.update-close {
  min-width: 44px;
  min-height: 44px;
  border-radius: 6px;
  color: #e8117f;
  font-size: 1.75rem;
  line-height: 1;
}

.update-history-mobile {
  display: none;
}

.update-history-label {
  color: var(--dc-gray, #555);
  font-weight: 600;
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
  height: 100dvh;
  min-height: 0;
  flex-direction: column;
  background: #f5f2e8;
  color: #111;
}

.update-drawer input[type="checkbox"] {
  accent-color: #e8117f;
}

.update-drawer-header,
.update-drawer-footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem;
  border-bottom: 1px solid #e0ddd4;
}

.update-drawer-header {
  background: #fefce8;
  padding-top: max(1.25rem, env(safe-area-inset-top));
}

.update-drawer-header button {
  flex: none;
  width: auto;
}

.update-drawer-footer {
  padding-bottom: max(1.25rem, env(safe-area-inset-bottom));
  border-top: 1px solid #e0ddd4;
  border-bottom: 0;
}

.update-drawer-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1.25rem;
}

/* Match the neutral, thin scrollbars used by speaker outcome controls. */
.update-drawer-body,
.update-message {
  scrollbar-width: thin;
  scrollbar-color: #767676 #f5f2e8;
}

.update-message {
  scrollbar-color: #767676 #fff;
}

.update-drawer-body::-webkit-scrollbar,
.update-message::-webkit-scrollbar {
  width: 8px;
}

.update-drawer-body::-webkit-scrollbar-track {
  background: #f5f2e8;
}

.update-message::-webkit-scrollbar-track {
  background: #fff;
}

.update-drawer-body::-webkit-scrollbar-thumb,
.update-message::-webkit-scrollbar-thumb {
  border: 1px solid #f5f2e8;
  border-radius: 8px;
  background: #767676;
}

.update-message::-webkit-scrollbar-thumb {
  border-color: #fff;
}

@media (hover: hover) and (pointer: fine) {
  .update-close:hover {
    background: rgb(232 17 127 / 10%);
  }
}

@media (max-width: 767px) {
  .update-history-mobile {
    display: block;
  }

  .update-history-mobile li + li {
    border-top: 1px solid var(--dc-border, #dedbd3);
  }

  .update-history-row {
    display: grid;
    width: 100%;
    gap: .25rem;
    padding: .85rem 1.25rem;
    text-align: left;
    font-size: .875rem;
  }

  .update-history-label {
    display: inline-block;
    min-width: 4.5rem;
  }

  .update-drawer-header,
  .update-drawer-body,
  .update-drawer-footer {
    padding-inline: 1rem;
  }

  .update-drawer-footer > button {
    width: 100%;
  }
}
</style>
