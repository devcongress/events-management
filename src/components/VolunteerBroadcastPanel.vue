<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';

import AppPagination from '@/src/components/AppPagination.vue';
import { fetchJson } from '@/src/lib/api';
import { notify } from '@/src/lib/notify';

type AcceptedVolunteer = {
  id: string;
  name: string;
  email: string;
  decision_version: number;
};

type Blast = {
  id: string;
  subject: string;
  body: string;
  status: 'waiting' | 'preparing' | 'scheduled' | 'sent' | 'needs_capacity' | 'failed';
  recipient_count: number;
  prepared_recipient_count: number;
  scheduled_for: string | null;
  sent_at: string | null;
  preparation_error: string | null;
  retryable: boolean;
  created_at: string;
};

type BlastListResponse = {
  accepted_volunteers: AcceptedVolunteer[];
  blasts: Blast[];
  capacity: {
    known: boolean;
    safe_recipients_today: number | null;
  } | null;
};

type Preview = {
  preview_id: string;
  subject: string;
  body: string;
  scheduled_for: string | null;
  recipient_count: number;
  recipients: Array<{
    recipient_id: string;
    decision_version: number;
    name: string;
    email: string;
  }>;
  from: string;
  html: string;
  text: string;
};

const pageSize = 8;
const query = useQuery({
  queryKey: ['annual-conference', '2026', 'volunteer-follow-up', 'blasts'],
  queryFn: () => fetchJson<BlastListResponse>('/api/annual-conference/2026/volunteer-follow-up/blasts', { credentials: 'include' }),
  refetchInterval: 30_000,
});
const subject = ref('');
const body = ref('');
const scheduledFor = ref('');
const search = ref('');
const page = ref(1);
const selectedIds = ref(new Set<string>());
const preview = ref<Preview | null>(null);
const previewOpen = ref(false);
const previewLoading = ref(false);
const confirming = ref(false);
const retryingId = ref('');
const error = ref('');
const previewView = ref<'email' | 'text'>('email');
const drawer = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
let previousFocus: HTMLElement | null = null;
let previousBodyOverflow = '';

const accepted = computed(() => query.data.value?.accepted_volunteers ?? []);
const filtered = computed(() => {
  const term = search.value.trim().toLowerCase();

  if (!term) return accepted.value;

  return accepted.value.filter((recipient) => `${recipient.name} ${recipient.email}`.toLowerCase().includes(term));
});
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)));
const pageRecipients = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize));
const pageStart = computed(() => filtered.value.length ? (page.value - 1) * pageSize + 1 : 0);
const pageEnd = computed(() => Math.min(page.value * pageSize, filtered.value.length));
const selectedCount = computed(() => selectedIds.value.size);
const canPreview = computed(() => selectedCount.value > 0 && subject.value.trim() && body.value.trim() && !previewLoading.value);
const blasts = computed(() => query.data.value?.blasts ?? []);
const htmlPreview = computed(() => {
  const withoutLinks = (preview.value?.html ?? '')
    .replace(/<a\b([^>]*)>/giu, (_match, attributes: string) => `<span${attributes.replace(/\s+href\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, '')} aria-disabled="true">`)
    .replace(/<\/a\s*>/giu, '</span>');
  const policy = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https://em.devcongress.org https://devcongress.org data:; style-src \'unsafe-inline\'; form-action \'none\'; base-uri \'none\'">';

  return /<head[^>]*>/iu.test(withoutLinks)
    ? withoutLinks.replace(/<head([^>]*)>/iu, `<head$1>${policy}`)
    : `${policy}${withoutLinks}`;
});

watch(search, () => {
  page.value = 1;
});

watch(pageCount, (count) => {
  if (page.value > count) page.value = count;
});

watch(accepted, () => {
  const stillAccepted = new Set(accepted.value.map((recipient) => recipient.id));

  selectedIds.value = new Set([...selectedIds.value].filter((id) => stillAccepted.has(id)));
}, { deep: true });

watch(previewOpen, async (open, wasOpen) => {
  if (open && !wasOpen) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeydown);
    await nextTick();
    closeButton.value?.focus();
  } else if (!open && wasOpen) {
    releaseDrawer();
  }
});

function toggleRecipient(id: string): void {
  const next = new Set(selectedIds.value);

  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}

function selectAllAccepted(): void {
  selectedIds.value = new Set(accepted.value.map((recipient) => recipient.id));
}

function clearSelection(): void {
  selectedIds.value = new Set();
}

function toIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-GH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Accra',
  }).format(new Date(value));
}

function statusLabel(blast: Blast): string {
  if (blast.status === 'waiting') return 'Waiting for a send slot';
  if (blast.status === 'preparing') return `Preparing ${blast.prepared_recipient_count}/${blast.recipient_count}`;
  if (blast.status === 'needs_capacity') return 'Needs email capacity';
  if (blast.status === 'failed') return blast.retryable ? 'Needs attention' : 'Canceled in Resend';
  if (blast.status === 'scheduled') return 'Scheduled';

  return 'Sent';
}

async function openPreview(): Promise<void> {
  if (!canPreview.value) return;
  previewOpen.value = true;
  previewLoading.value = true;
  preview.value = null;
  previewView.value = 'email';
  error.value = '';

  try {
    preview.value = await fetchJson<Preview>('/api/annual-conference/2026/volunteer-follow-up/blasts/preview', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient_ids: [...selectedIds.value],
        subject: subject.value.trim(),
        body: body.value.trim(),
        scheduled_for: toIso(scheduledFor.value),
      }),
    });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to preview this volunteer update.';
  } finally {
    previewLoading.value = false;
  }
}

async function confirmBroadcast(): Promise<void> {
  if (!preview.value || confirming.value) return;
  confirming.value = true;
  error.value = '';

  try {
    const response = await fetchJson<{ blast: Blast; delivery: string }>('/api/annual-conference/2026/volunteer-follow-up/blasts/confirm', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preview_id: preview.value.preview_id }),
    });

    if (response.delivery === 'failed') {
      throw new Error('The update was saved, but background preparation was not queued. Use Retry in Broadcast activity.');
    }
    notify.success(response.delivery === 'needs_capacity'
      ? 'The update was saved and is waiting for email capacity.'
      : `${preview.value.recipient_count} volunteer${preview.value.recipient_count === 1 ? '' : 's'} queued for the Resend broadcast.`);
    closePreview();
    subject.value = '';
    body.value = '';
    scheduledFor.value = '';
    clearSelection();
    await query.refetch();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to queue this volunteer update.';
  } finally {
    confirming.value = false;
  }
}

async function retryBlast(blast: Blast): Promise<void> {
  if (retryingId.value) return;
  retryingId.value = blast.id;

  try {
    await fetchJson(`/api/annual-conference/2026/volunteer-follow-up/blasts/${blast.id}/retry`, {
      method: 'POST',
      credentials: 'include',
    });
    notify.success('The frozen volunteer broadcast was queued again.');
    await query.refetch();
  } catch (cause) {
    notify.error(cause instanceof Error ? cause.message : 'Unable to retry this volunteer update.');
  } finally {
    retryingId.value = '';
  }
}

function closePreview(): void {
  if (confirming.value) return;
  previewOpen.value = false;
  preview.value = null;
  error.value = '';
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    closePreview();

    return;
  }
  if (event.key !== 'Tab' || !drawer.value) return;
  const focusable = [...drawer.value.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])')]
    .filter((element) => element.getClientRects().length > 0);
  const first = focusable[0];
  const last = focusable.at(-1);

  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function releaseDrawer(): void {
  document.removeEventListener('keydown', handleKeydown);
  document.body.style.overflow = previousBodyOverflow;
  previousFocus?.focus();
  previousFocus = null;
}

onBeforeUnmount(() => {
  if (previewOpen.value) releaseDrawer();
});
</script>

<template>
  <section class="volunteer-blasts" aria-labelledby="volunteer-blasts-title">
    <header class="volunteer-blasts__heading">
      <div>
        <p class="editorial-label">Owner · Selected volunteers</p>
        <h3 id="volunteer-blasts-title">Volunteer updates</h3>
        <p>Write an update, choose accepted volunteers, and review it before sending.</p>
      </div>
      <span class="volunteer-blasts__count">{{ selectedCount }} selected of {{ accepted.length }}</span>
    </header>

    <p v-if="query.isPending.value" class="volunteer-blasts__empty" role="status">Loading accepted volunteers and Broadcast activity…</p>
    <p v-else-if="query.isError.value && !query.data.value" class="volunteer-blasts__error" role="alert">Unable to load volunteer Broadcasts. Refresh and try again.</p>
    <div v-else-if="accepted.length" class="volunteer-blasts__composer">
      <div class="volunteer-blasts__fields">
        <label>
          <span>Subject</span>
          <input v-model="subject" class="editorial-input" maxlength="160" placeholder="Volunteer orientation and next steps">
        </label>
        <label>
          <span>Message</span>
          <textarea v-model="body" class="editorial-input" rows="6" maxlength="5000" placeholder="Write the update the selected volunteers should receive."></textarea>
        </label>
        <label>
          <span>Schedule (optional)</span>
          <input v-model="scheduledFor" class="editorial-input" type="datetime-local">
        </label>
      </div>

      <div class="volunteer-blasts__audience">
        <div class="volunteer-blasts__audience-toolbar">
          <label>
            <span class="sr-only">Search accepted volunteers</span>
            <input v-model="search" type="search" placeholder="Search accepted volunteers">
          </label>
          <div>
            <button type="button" class="volunteer-blasts__secondary" @click="selectAllAccepted">Select all accepted</button>
            <button type="button" class="volunteer-blasts__secondary" :disabled="!selectedCount" @click="clearSelection">Clear</button>
          </div>
        </div>

        <p class="volunteer-blasts__safety">No one is selected automatically. Your selection stays intact while you search or change pages.</p>
        <ul class="volunteer-blasts__people">
          <li v-for="recipient in pageRecipients" :key="recipient.id">
            <label>
              <input type="checkbox" :checked="selectedIds.has(recipient.id)" @change="toggleRecipient(recipient.id)">
              <span><strong>{{ recipient.name }}</strong><small>{{ recipient.email }}</small></span>
            </label>
          </li>
        </ul>
        <p v-if="!pageRecipients.length" class="volunteer-blasts__empty">No accepted volunteers match this search.</p>
        <AppPagination
          v-if="filtered.length > pageSize"
          v-model:page="page"
          :page-count="pageCount"
          :range-start="pageStart"
          :range-end="pageEnd"
          :total="filtered.length"
          item-label="accepted volunteers"
        />
      </div>

      <button type="button" class="volunteer-blasts__primary" :disabled="!canPreview" @click="openPreview">
        Preview update for {{ selectedCount }} volunteer{{ selectedCount === 1 ? '' : 's' }}
      </button>
    </div>
    <p v-else class="volunteer-blasts__empty">No accepted volunteers are available yet. Save accepted decisions in Reviews first.</p>

    <section v-if="query.data.value" class="volunteer-blasts__history" aria-labelledby="volunteer-blasts-history-title">
      <div class="volunteer-blasts__history-heading">
        <h4 id="volunteer-blasts-history-title">Broadcast activity</h4>
        <span v-if="query.data.value?.capacity?.known">{{ query.data.value.capacity.safe_recipients_today ?? 0 }} safe recipients available today</span>
      </div>
      <ul v-if="blasts.length">
        <li v-for="blast in blasts" :key="blast.id">
          <div>
            <strong>{{ blast.subject }}</strong>
            <span>{{ blast.recipient_count }} volunteer{{ blast.recipient_count === 1 ? '' : 's' }} · {{ statusLabel(blast) }}</span>
            <small>{{ formatDateTime(blast.sent_at ?? blast.scheduled_for ?? blast.created_at) }}</small>
            <p v-if="blast.preparation_error">{{ blast.preparation_error }}</p>
          </div>
          <button v-if="blast.retryable" type="button" class="volunteer-blasts__secondary" :disabled="Boolean(retryingId)" @click="retryBlast(blast)">
            {{ retryingId === blast.id ? 'Retrying…' : 'Retry' }}
          </button>
        </li>
      </ul>
      <p v-else class="volunteer-blasts__empty">No selected-volunteer broadcasts yet.</p>
    </section>

    <Teleport to="body">
      <Transition name="volunteer-blast-drawer">
        <div v-if="previewOpen" class="volunteer-blasts__backdrop" role="presentation" @click.self="closePreview">
          <section ref="drawer" class="volunteer-blasts__drawer" role="dialog" aria-modal="true" aria-labelledby="volunteer-blast-preview-title" tabindex="-1">
            <header>
              <div>
                <p class="editorial-label">Owner preview · 10 minute snapshot</p>
                <h2 id="volunteer-blast-preview-title">Selected-volunteer update</h2>
              </div>
              <button ref="closeButton" type="button" aria-label="Close preview" :disabled="confirming" @click="closePreview">×</button>
            </header>
            <div class="volunteer-blasts__drawer-body">
              <p v-if="previewLoading" role="status">Freezing the selected volunteers and production email…</p>
              <p v-else-if="error && !preview" class="volunteer-blasts__error" role="alert">{{ error }}</p>
              <template v-else-if="preview">
                <div class="volunteer-blasts__preview-meta">
                  <span>Recipients</span><strong>{{ preview.recipient_count }}</strong>
                  <span>From</span><strong>{{ preview.from }}</strong>
                  <span>Delivery</span><strong>{{ preview.scheduled_for ? formatDateTime(preview.scheduled_for) : 'Send after confirmation' }}</strong>
                </div>
                <details open>
                  <summary>Frozen selected volunteers ({{ preview.recipients.length }})</summary>
                  <ol class="volunteer-blasts__frozen-list">
                    <li v-for="recipient in preview.recipients" :key="recipient.recipient_id">
                      <strong>{{ recipient.name }}</strong><span>{{ recipient.email }}</span>
                    </li>
                  </ol>
                </details>
                <div class="volunteer-blasts__tabs" role="tablist" aria-label="Email format">
                  <button type="button" role="tab" :aria-selected="previewView === 'email'" @click="previewView = 'email'">Rendered email</button>
                  <button type="button" role="tab" :aria-selected="previewView === 'text'" @click="previewView = 'text'">Plain text</button>
                </div>
                <iframe v-if="previewView === 'email'" title="Rendered volunteer broadcast preview" :srcdoc="htmlPreview" sandbox="allow-same-origin" referrerpolicy="no-referrer" />
                <pre v-else>{{ preview.text }}</pre>
                <p class="volunteer-blasts__safety">Only these volunteers will be added to the reusable Resend segment. A changed decision makes confirmation fail instead of silently changing this audience.</p>
              </template>
              <p v-if="error && preview" class="volunteer-blasts__error" role="alert">{{ error }}</p>
            </div>
            <footer>
              <button type="button" class="volunteer-blasts__primary" :disabled="confirming || previewLoading || !preview" @click="confirmBroadcast">
                {{ confirming ? 'Queueing…' : `${preview?.scheduled_for ? 'Schedule' : 'Queue'} Resend Broadcast for ${preview?.recipient_count ?? 0}` }}
              </button>
            </footer>
          </section>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
.volunteer-blasts {
  margin-top: 1.25rem;
  padding: 1.15rem;
  border: 1px solid #e2dfd8;
  border-radius: 8px;
  background: #fff;
  color: #25231f;
}

.volunteer-blasts__heading,
.volunteer-blasts__audience-toolbar,
.volunteer-blasts__history-heading,
.volunteer-blasts__history li,
.volunteer-blasts__drawer > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.volunteer-blasts h3,
.volunteer-blasts h4,
.volunteer-blasts__drawer h2 {
  margin: 0.3rem 0;
  font-weight: 700;
}

.volunteer-blasts__heading p:not(.editorial-label) {
  max-width: 44rem;
  margin: 0;
  color: #69665f;
  font-size: 0.84rem;
  line-height: 1.5;
}

.volunteer-blasts__count {
  flex: none;
  padding: 0.45rem 0.65rem;
  border: 1px solid #d8d2c4;
  border-radius: 8px;
  background: #faf5e9;
  font: 700 0.72rem/1.2 var(--font-mono), monospace;
}

.volunteer-blasts__composer {
  display: grid;
  gap: 1rem;
  margin-top: 1rem;
}

.volunteer-blasts__fields {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: minmax(0, 1fr) minmax(12rem, 0.38fr);
}

.volunteer-blasts__fields label:nth-child(2) {
  grid-column: 1 / -1;
  grid-row: 2;
}

.volunteer-blasts label {
  display: grid;
  gap: 0.35rem;
  color: #69665f;
  font: 700 0.68rem/1.2 var(--font-mono), monospace;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.volunteer-blasts input,
.volunteer-blasts textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid #d3d0c9;
  border-radius: 8px;
  background: #fff;
  color: #25231f;
  font: 500 0.88rem/1.45 var(--font-sans), sans-serif;
  letter-spacing: 0;
  text-transform: none;
}

.volunteer-blasts__audience {
  padding: 1rem;
  border: 1px solid #e7dcc5;
  border-radius: 8px;
  background: #faf5e9;
}

.volunteer-blasts__audience-toolbar {
  align-items: center;
}

.volunteer-blasts__audience-toolbar > label {
  flex: 1;
}

.volunteer-blasts__audience-toolbar input {
  min-height: 2.75rem;
  padding: 0.65rem 0.75rem;
}

.volunteer-blasts__audience-toolbar > div {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

@container (min-width: 54rem) {
  .volunteer-blasts__composer {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
  }

  .volunteer-blasts__fields {
    grid-template-columns: minmax(0, 1fr);
  }

  .volunteer-blasts__audience {
    grid-column: 2;
    grid-row: 1 / span 2;
  }

  .volunteer-blasts__composer > .volunteer-blasts__primary {
    grid-column: 1;
  }

  .volunteer-blasts__audience-toolbar {
    flex-wrap: wrap;
  }

  .volunteer-blasts__audience-toolbar > label {
    flex-basis: 100%;
  }
}

.volunteer-blasts__safety,
.volunteer-blasts__empty {
  margin: 0.7rem 0 0;
  color: #69665f;
  font-size: 0.78rem;
  line-height: 1.5;
}

.volunteer-blasts__people,
.volunteer-blasts__history ul,
.volunteer-blasts__frozen-list {
  margin: 0.8rem 0 0;
  padding: 0;
  list-style: none;
}

.volunteer-blasts__people {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.45rem;
}

.volunteer-blasts__people li {
  min-width: 0;
}

.volunteer-blasts__people label {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  padding: 0.7rem;
  border: 1px solid #dedbd4;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  text-transform: none;
}

.volunteer-blasts__people input {
  width: 1rem;
  margin: 0.15rem 0 0;
  accent-color: #c80d68;
}

.volunteer-blasts__people span {
  display: grid;
  min-width: 0;
  gap: 0.18rem;
}

.volunteer-blasts__people strong,
.volunteer-blasts__people small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.volunteer-blasts__people strong {
  color: #25231f;
  font: 700 0.83rem/1.3 var(--font-sans), sans-serif;
}

.volunteer-blasts__people small {
  color: #69665f;
  font: 500 0.72rem/1.3 var(--font-sans), sans-serif;
}

.volunteer-blasts__primary,
.volunteer-blasts__secondary,
.volunteer-blasts__drawer header button,
.volunteer-blasts__tabs button {
  min-height: 2.55rem;
  border: 1px solid #d3d0c9;
  border-radius: 8px;
  background: #fff;
  color: #25231f;
  font: 700 0.78rem/1 var(--font-sans), sans-serif;
  cursor: pointer;
}

.volunteer-blasts__primary {
  justify-self: start;
  padding: 0.7rem 1rem;
  border-color: #c80d68;
  background: #c80d68;
  color: #fff;
}

.volunteer-blasts__secondary {
  padding: 0.6rem 0.75rem;
}

.volunteer-blasts button:active {
  transform: scale(0.97);
}

.volunteer-blasts button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
  transform: none;
}

.volunteer-blasts__history {
  margin-top: 1.2rem;
  padding-top: 1rem;
  border-top: 1px solid #e6e3dc;
}

.volunteer-blasts__history-heading {
  align-items: baseline;
}

.volunteer-blasts__history-heading span {
  color: #69665f;
  font-size: 0.72rem;
}

.volunteer-blasts__history li {
  align-items: center;
  padding: 0.75rem 0;
  border-top: 1px solid #eeeae2;
}

.volunteer-blasts__history li > div {
  display: grid;
  gap: 0.2rem;
}

.volunteer-blasts__history li span,
.volunteer-blasts__history li small {
  color: #69665f;
  font-size: 0.74rem;
}

.volunteer-blasts__history li p {
  margin: 0.2rem 0 0;
  color: #9a3b2d;
  font-size: 0.74rem;
}

.volunteer-blasts__backdrop {
  position: fixed;
  z-index: 1100;
  inset: 0;
  display: flex;
  justify-content: flex-end;
  background: rgb(25 23 20 / 38%);
}

.volunteer-blasts__drawer {
  display: flex;
  width: min(44rem, 100%);
  height: 100%;
  flex-direction: column;
  background: #fff;
  box-shadow: -12px 0 36px rgb(20 18 16 / 16%);
}

.volunteer-blasts__drawer > header {
  padding: 1.2rem 1.35rem;
  border-bottom: 1px solid #e6e3dc;
}

.volunteer-blasts__drawer > header button {
  width: 2.5rem;
  padding: 0;
  font-size: 1.35rem;
}

.volunteer-blasts__drawer-body {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 1.1rem 1.35rem 2rem;
}

.volunteer-blasts__drawer footer {
  padding: 1rem 1.35rem;
  border-top: 1px solid #e6e3dc;
}

.volunteer-blasts__preview-meta {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.45rem 1rem;
  padding: 0.85rem;
  border: 1px solid #e6e3dc;
  border-radius: 8px;
  font-size: 0.78rem;
}

.volunteer-blasts__preview-meta span,
.volunteer-blasts__frozen-list span {
  color: #69665f;
}

.volunteer-blasts__drawer details {
  margin-top: 1rem;
  border: 1px solid #e6e3dc;
  border-radius: 8px;
}

.volunteer-blasts__drawer summary {
  padding: 0.75rem;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 700;
}

.volunteer-blasts__frozen-list {
  max-height: 14rem;
  overflow: auto;
  border-top: 1px solid #e6e3dc;
}

.volunteer-blasts__frozen-list li {
  display: grid;
  gap: 0.15rem;
  padding: 0.65rem 0.75rem;
  border-bottom: 1px solid #eeeae2;
  font-size: 0.78rem;
}

.volunteer-blasts__tabs {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}

.volunteer-blasts__tabs button {
  padding: 0.6rem 0.75rem;
}

.volunteer-blasts__tabs button[aria-selected="true"] {
  border-color: #25231f;
  background: #25231f;
  color: #fff;
}

.volunteer-blasts__drawer iframe,
.volunteer-blasts__drawer pre {
  width: 100%;
  min-height: 25rem;
  margin-top: 0.75rem;
  border: 1px solid #e6e3dc;
  border-radius: 8px;
  background: #faf9f6;
}

.volunteer-blasts__drawer pre {
  overflow: auto;
  padding: 1rem;
  white-space: pre-wrap;
}

.volunteer-blasts__error {
  color: #9a3b2d;
}

.volunteer-blast-drawer-enter-active,
.volunteer-blast-drawer-leave-active {
  transition: opacity 180ms cubic-bezier(0.4, 0, 0.2, 1);
}

.volunteer-blast-drawer-enter-active .volunteer-blasts__drawer,
.volunteer-blast-drawer-leave-active .volunteer-blasts__drawer {
  transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1);
}

.volunteer-blast-drawer-enter-from,
.volunteer-blast-drawer-leave-to {
  opacity: 0;
}

.volunteer-blast-drawer-enter-from .volunteer-blasts__drawer,
.volunteer-blast-drawer-leave-to .volunteer-blasts__drawer {
  transform: translate3d(100%, 0, 0);
}

@media (max-width: 640px) {
  .volunteer-blasts__heading,
  .volunteer-blasts__audience-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .volunteer-blasts__count {
    align-self: flex-start;
  }

  .volunteer-blasts__fields,
  .volunteer-blasts__people {
    grid-template-columns: 1fr;
  }

  .volunteer-blasts__fields label:nth-child(2) {
    grid-column: auto;
    grid-row: auto;
  }
}

@media (hover: hover) and (pointer: fine) {
  .volunteer-blasts__primary,
  .volunteer-blasts__secondary,
  .volunteer-blasts__tabs button {
    transition:
      transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1),
      border-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .volunteer-blasts__primary:hover,
  .volunteer-blasts__secondary:hover {
    transform: translateY(-1px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .volunteer-blast-drawer-enter-active,
  .volunteer-blast-drawer-leave-active,
  .volunteer-blast-drawer-enter-active .volunteer-blasts__drawer,
  .volunteer-blast-drawer-leave-active .volunteer-blasts__drawer,
  .volunteer-blasts__primary,
  .volunteer-blasts__secondary,
  .volunteer-blasts__tabs button {
    transition: none;
  }
}
</style>
