<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { onBeforeRouteLeave, RouterLink, useRoute } from 'vue-router';
import AppDatePicker from '@/src/components/ui/AppDatePicker.vue';
import BlastEmailPreview from '@/src/components/ui/BlastEmailPreview.vue';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import {
  createEventBlast,
  fetchEventBlasts,
  fetchEventRegistrations,
  queryKeys,
  retryEventBlast,
} from '@/src/lib/api';
import { eventBlastStarters } from '@/src/lib/event-blast-workspace';
import { notify } from '@/src/lib/notify';
import { organizerPhoneEventPath } from '@/src/organizer-viewport';
import type { EventBlast } from '@/types';

const route = useRoute();
const queryClient = useQueryClient();
const eventId = computed(() => String(route.params.eventId ?? ''));
const composerOpen = ref(false);
const previewOpen = ref(false);
const blastPending = ref(false);
const blastRetryId = ref<string | null>(null);
const blastSubject = ref('');
const blastBody = ref('');
const blastScheduledFor = ref('');
const leaveConfirmationOpen = ref(false);
let resolvePendingLeave: ((shouldLeave: boolean) => void) | null = null;

const registrationQuery = useQuery({
  queryKey: computed(() => queryKeys.eventRegistrations(eventId.value)),
  queryFn: () => fetchEventRegistrations(eventId.value),
  enabled: computed(() => Boolean(eventId.value)),
  retry: false,
  refetchOnWindowFocus: true,
});
const blastsQuery = useQuery({
  queryKey: computed(() => queryKeys.eventBlasts(eventId.value)),
  queryFn: () => fetchEventBlasts(eventId.value),
  enabled: computed(() => Boolean(eventId.value) && registrationQuery.data.value?.managed_internally === true),
  retry: false,
  refetchOnWindowFocus: true,
});

const registrationData = computed(() => registrationQuery.data.value ?? null);
const event = computed(() => registrationData.value?.event ?? null);
const managedInternally = computed(() => registrationData.value?.managed_internally === true);
const confirmedRecipients = computed(() => (
  registrationData.value?.registrations.filter((registration) => registration.status === 'confirmed').length ?? 0
));
const blasts = computed(() => blastsQuery.data.value?.blasts ?? []);
const blastCapacity = computed(() => blastsQuery.data.value?.capacity ?? null);
const blastTemplates = computed(() => eventBlastStarters(
  event.value?.name ?? 'this event',
  event.value?.event_date ? formatDateTime(event.value.event_date) : 'the event day',
));
const canCreateBlast = computed(() => (
  managedInternally.value
  && confirmedRecipients.value > 0
  && confirmedRecipients.value <= 100
  && blastSubject.value.trim().length > 0
  && blastBody.value.trim().length > 0
));
const hasDraft = computed(() => Boolean(
  blastSubject.value.trim()
  || blastBody.value.trim()
  || blastScheduledFor.value,
));
const capacityWarning = computed(() => (
  blastCapacity.value?.known
  && confirmedRecipients.value > (blastCapacity.value.safe_recipients_today ?? 0)
));
const previewActionLabel = computed(() => (
  blastScheduledFor.value
    ? `SCHEDULE FOR ${formatDateTime(toIso(blastScheduledFor.value) ?? new Date().toISOString())}`
    : `SEND TO ${confirmedRecipients.value} GUEST${confirmedRecipients.value === 1 ? '' : 'S'}`
));

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-GH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Accra',
  }).format(new Date(value));
}

function toIso(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function blastStatusLabel(status: EventBlast['status']): string {
  if (status === 'preparing') return 'Preparing safely';
  if (status === 'scheduled') return 'Scheduled';
  if (status === 'sent') return 'Sent';
  if (status === 'needs_capacity') return 'Needs capacity';
  return 'Needs attention';
}

function applyBlastTemplate(templateId: string) {
  const template = blastTemplates.value.find((item) => item.id === templateId);
  if (!template) return;
  blastSubject.value = template.subject;
  blastBody.value = template.body;
}

function openComposer() {
  if (!managedInternally.value || confirmedRecipients.value === 0 || confirmedRecipients.value > 100) return;
  composerOpen.value = true;
  if (!hasDraft.value) applyBlastTemplate('reminder');
}

function openPreview() {
  if (!canCreateBlast.value || blastPending.value) return;
  previewOpen.value = true;
}

async function refreshBlasts() {
  await queryClient.invalidateQueries({ queryKey: queryKeys.eventBlasts(eventId.value) });
}

async function sendBlast() {
  if (!canCreateBlast.value || blastPending.value) return;
  blastPending.value = true;
  try {
    const result = await createEventBlast(eventId.value, {
      subject: blastSubject.value.trim(),
      body: blastBody.value.trim(),
      scheduled_for: toIso(blastScheduledFor.value),
    });
    await refreshBlasts();
    previewOpen.value = false;
    composerOpen.value = false;
    blastSubject.value = '';
    blastBody.value = '';
    blastScheduledFor.value = '';
    notify.success(
      result.delivery === 'scheduled'
        ? `Blast scheduled for ${formatDateTime(result.blast.scheduled_for!)}`
        : result.delivery === 'sent'
          ? `Blast sent to ${result.blast.recipient_count} confirmed guests.`
          : result.error ?? 'Blast saved without sending so protected transactional capacity remains available.',
    );
  } catch (error) {
    notify.error(error instanceof Error ? error.message : 'Unable to create this blast.');
  } finally {
    blastPending.value = false;
  }
}

async function retryBlast(blast: EventBlast) {
  if (blastRetryId.value || blast.status !== 'failed' || !blast.provider_broadcast_id) return;
  blastRetryId.value = blast.id;
  try {
    const result = await retryEventBlast(eventId.value, blast.id);
    await refreshBlasts();
    notify.success(
      result.delivery === 'scheduled'
        ? `Blast scheduled for ${formatDateTime(result.blast.scheduled_for!)}`
        : `Blast sent to ${result.blast.recipient_count} confirmed guests.`,
    );
  } catch (error) {
    notify.error(error instanceof Error ? error.message : 'Unable to retry this blast.');
  } finally {
    blastRetryId.value = null;
  }
}

function warnBeforeBrowserExit(event: BeforeUnloadEvent) {
  if (!hasDraft.value) return;
  event.preventDefault();
  event.returnValue = '';
}

function finishPendingLeave(shouldLeave: boolean) {
  leaveConfirmationOpen.value = false;
  const resolve = resolvePendingLeave;
  resolvePendingLeave = null;
  resolve?.(shouldLeave);
}

onMounted(() => window.addEventListener('beforeunload', warnBeforeBrowserExit));
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeBrowserExit));

onBeforeRouteLeave(() => {
  if (!hasDraft.value) return true;
  if (resolvePendingLeave) return false;

  leaveConfirmationOpen.value = true;
  return new Promise<boolean>((resolve) => {
    resolvePendingLeave = resolve;
  });
});
</script>

<template>
  <section class="mobile-blasts-page">
    <div class="mobile-blasts-wrap">
      <div class="mobile-blasts-back-bar">
        <RouterLink :to="organizerPhoneEventPath(eventId)" class="mobile-blasts-back">
          <span aria-hidden="true">←</span>
          Event overview
        </RouterLink>
      </div>

      <section class="mobile-blasts-hero">
        <span>Guest communications</span>
        <h1>Email guests</h1>
        <p>{{ event?.name ?? 'Event update' }}</p>
      </section>

      <section v-if="registrationQuery.isPending.value" class="mobile-blasts-state" role="status">
        Loading event audience…
      </section>
      <section v-else-if="registrationQuery.isError.value" class="mobile-blasts-state mobile-blasts-state--error">
        <strong>The event audience could not be loaded.</strong>
        <button type="button" @click="registrationQuery.refetch()">Try again</button>
      </section>
      <section v-else-if="!managedInternally" class="mobile-blasts-state">
        <strong>No internal guest audience</strong>
        <p>Registration for this event was managed outside EMS, so there is no confirmed guest list to message here.</p>
      </section>

      <template v-else>
        <section class="mobile-blasts-audience">
          <div>
            <span>Audience</span>
            <strong>{{ confirmedRecipients }}</strong>
            <p>confirmed guest{{ confirmedRecipients === 1 ? '' : 's' }}</p>
          </div>
          <div>
            <span>Safe today</span>
            <strong>{{ blastCapacity?.known ? blastCapacity.safe_recipients_today ?? 0 : '—' }}</strong>
            <p>{{ blastCapacity?.known ? `${blastCapacity.protected_reserve} reserved` : 'awaiting provider' }}</p>
          </div>
        </section>

        <section v-if="confirmedRecipients === 0" class="mobile-blasts-notice">
          A blast becomes available once at least one guest has a confirmed place.
        </section>
        <section v-else-if="confirmedRecipients > 100" class="mobile-blasts-notice mobile-blasts-notice--warning">
          This event has {{ confirmedRecipients }} confirmed guests. Blasts stop at 100 recipients so EMS never sends a partial update.
        </section>
        <section v-else-if="capacityWarning" class="mobile-blasts-notice mobile-blasts-notice--warning">
          Sending now would use protected registration-email capacity. Schedule this update for later, or preview it knowing EMS will save it without sending if capacity remains unsafe.
        </section>

        <section class="mobile-blasts-compose">
          <header>
            <div><span>New message</span><h2>{{ composerOpen ? 'Write the update' : 'Send an event update' }}</h2></div>
            <button v-if="composerOpen" type="button" class="mobile-blasts-quiet-action" @click="composerOpen = false">Close</button>
          </header>

          <button
            v-if="!composerOpen"
            type="button"
            class="mobile-blasts-create"
            :disabled="confirmedRecipients === 0 || confirmedRecipients > 100"
            @click="openComposer"
          >
            Create blast <span aria-hidden="true">→</span>
          </button>

          <form v-else @submit.prevent="openPreview">
            <fieldset>
              <legend>Start with</legend>
              <div class="mobile-blasts-templates">
                <button v-for="template in blastTemplates" :key="template.id" type="button" @click="applyBlastTemplate(template.id)">{{ template.label }}</button>
              </div>
            </fieldset>

            <label for="mobile-blast-subject">
              <span>Subject</span>
              <input id="mobile-blast-subject" v-model="blastSubject" maxlength="160" autocomplete="off" required>
            </label>

            <AppDatePicker v-model="blastScheduledFor" label="Send later (optional)" mode="datetime" />

            <label for="mobile-blast-body">
              <span>Message</span>
              <textarea id="mobile-blast-body" v-model="blastBody" maxlength="5000" rows="9" required />
            </label>

            <p class="mobile-blasts-recipient-note">{{ confirmedRecipients }} confirmed guest{{ confirmedRecipients === 1 ? '' : 's' }} will receive this email. Waitlisted and cancelled guests are excluded.</p>
            <button type="submit" class="mobile-blasts-preview" :disabled="!canCreateBlast || blastPending">Preview email <span aria-hidden="true">→</span></button>
          </form>
        </section>

        <section class="mobile-blasts-history">
          <header><span>Delivery history</span><h2>Recent blasts</h2></header>
          <p v-if="blastsQuery.isPending.value" class="mobile-blasts-history-state" role="status">Loading blast history…</p>
          <div v-else-if="blastsQuery.isError.value" class="mobile-blasts-history-state mobile-blasts-history-state--error">
            <p>Blast history could not load.</p>
            <button type="button" @click="blastsQuery.refetch()">Try again</button>
          </div>
          <p v-else-if="blasts.length === 0" class="mobile-blasts-history-state">No event updates yet.</p>
          <ul v-else>
            <li v-for="blast in blasts" :key="blast.id">
              <div><strong>{{ blast.subject }}</strong><span>{{ blast.recipient_count }} guests · {{ blast.scheduled_for ? formatDateTime(blast.scheduled_for) : blast.sent_at ? formatDateTime(blast.sent_at) : 'Not sent' }}</span></div>
              <div class="mobile-blasts-history-actions">
                <span class="mobile-blasts-status" :class="`mobile-blasts-status--${blast.status}`">{{ blastStatusLabel(blast.status) }}</span>
                <button v-if="blast.status === 'failed' && blast.provider_broadcast_id" type="button" :disabled="blastRetryId === blast.id" @click="retryBlast(blast)">{{ blastRetryId === blast.id ? 'Retrying…' : 'Retry send' }}</button>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </div>

    <BlastEmailPreview
      :open="previewOpen"
      :subject="blastSubject"
      :body="blastBody"
      :event="event"
      :action-label="previewActionLabel"
      :busy="blastPending"
      @close="previewOpen = false"
      @confirm="sendBlast"
    />

    <ConfirmDialog
      :open="leaveConfirmationOpen"
      title="Discard this draft?"
      message="Your unsent blast will be discarded if you leave this page."
      confirm-label="Discard draft"
      cancel-label="Keep editing"
      danger
      @confirm="finishPendingLeave(true)"
      @cancel="finishPendingLeave(false)"
    />
  </section>
</template>

<style scoped>
.mobile-blasts-page { min-height: 100%; background: #f5f2e8; color: #111; }
.mobile-blasts-wrap { display: grid; width: min(100%, 42rem); margin: 0 auto; gap: .75rem; padding: max(.75rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1.5rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left)); }
.mobile-blasts-back-bar { position: sticky; top: env(safe-area-inset-top); z-index: 20; display: flex; padding-block: .2rem; background: rgb(245 242 232 / .95); }
.mobile-blasts-back { display: inline-flex; min-height: 2.75rem; align-items: center; gap: .45rem; border: 1px solid #b8b3a9; border-radius: 8px; background: #fff; padding: .65rem .8rem; color: #111; font-family: var(--font-mono), monospace; font-size: .7rem; font-weight: 700; text-transform: uppercase; }
.mobile-blasts-hero, .mobile-blasts-audience, .mobile-blasts-compose, .mobile-blasts-history, .mobile-blasts-state, .mobile-blasts-notice { overflow: hidden; border: 1px solid #d9d5cc; border-radius: 12px; background: #fff; }
.mobile-blasts-hero { padding: 1rem; }
.mobile-blasts-hero > span, .mobile-blasts-compose header span, .mobile-blasts-history header span, .mobile-blasts-audience span, .mobile-blasts-compose label > span, .mobile-blasts-compose legend { color: #77736b; font-family: var(--font-mono), monospace; font-size: .58rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.mobile-blasts-hero h1 { margin: .3rem 0 0; font-size: 1.8rem; font-weight: 800; letter-spacing: -.035em; line-height: 1.05; }
.mobile-blasts-hero p { margin: .55rem 0 0; color: #5f5b54; font-size: .84rem; font-weight: 600; }
.mobile-blasts-audience { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.mobile-blasts-audience > div { display: grid; min-height: 7rem; align-content: center; gap: .25rem; padding: 1rem; }
.mobile-blasts-audience > div + div { border-left: 1px solid #e1ddd4; }
.mobile-blasts-audience strong { color: #e8117f; font-size: 1.75rem; line-height: 1; }
.mobile-blasts-audience p { margin: 0; color: #5f5b54; font-size: .72rem; line-height: 1.35; }
.mobile-blasts-state, .mobile-blasts-notice { padding: 1.15rem 1rem; color: #5f5b54; font-size: .84rem; line-height: 1.55; text-align: center; }
.mobile-blasts-state strong, .mobile-blasts-state p { display: block; margin: 0; }
.mobile-blasts-state button, .mobile-blasts-history-state button { min-height: 2.75rem; margin-top: .8rem; border: 2px solid #111; border-radius: 8px; background: #f5e642; padding: .65rem .9rem; color: #111; font-family: var(--font-mono), monospace; font-size: .65rem; font-weight: 700; text-transform: uppercase; }
.mobile-blasts-state--error, .mobile-blasts-history-state--error { color: #b91c1c; }
.mobile-blasts-notice--warning { border-color: #e7c96d; background: #fff8dc; color: #755300; text-align: left; }
.mobile-blasts-compose > header, .mobile-blasts-history > header { display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding: 1rem; }
.mobile-blasts-compose h2, .mobile-blasts-history h2 { margin: .3rem 0 0; font-size: 1.1rem; letter-spacing: -.02em; }
.mobile-blasts-quiet-action { min-height: 2.75rem; border: 0; background: transparent; color: #5f5b54; font-family: var(--font-mono), monospace; font-size: .62rem; font-weight: 700; text-transform: uppercase; }
.mobile-blasts-create, .mobile-blasts-preview { display: flex; width: 100%; min-height: 3.25rem; align-items: center; justify-content: space-between; gap: 1rem; border: 0; border-top: 1px solid #e1ddd4; background: #e8117f; padding: .85rem 1rem; color: #fff; font-size: .84rem; font-weight: 800; }
.mobile-blasts-create:disabled, .mobile-blasts-preview:disabled { opacity: .45; }
.mobile-blasts-compose form { display: grid; gap: 1rem; border-top: 1px solid #e1ddd4; padding: 1rem; }
.mobile-blasts-compose fieldset { min-width: 0; margin: 0; border: 0; padding: 0; }
.mobile-blasts-compose legend { padding: 0; }
.mobile-blasts-templates { display: flex; gap: .45rem; overflow-x: auto; margin-top: .5rem; padding-bottom: .2rem; scrollbar-width: none; }
.mobile-blasts-templates::-webkit-scrollbar { display: none; }
.mobile-blasts-templates button { min-height: 2.75rem; flex: 0 0 auto; border: 1px solid #b8b3a9; border-radius: 7px; background: #fefce8; padding: 0 .75rem; color: #111; font-family: var(--font-mono), monospace; font-size: .6rem; font-weight: 700; text-transform: uppercase; }
.mobile-blasts-compose label { display: grid; gap: .45rem; }
.mobile-blasts-compose input, .mobile-blasts-compose textarea { width: 100%; border: 1px solid #b8b3a9; border-radius: 8px; background: #fff; padding: .8rem; color: #111; font-size: 1rem; outline: none; }
.mobile-blasts-compose input { min-height: 3rem; }
.mobile-blasts-compose textarea { min-height: 12rem; resize: vertical; line-height: 1.5; }
.mobile-blasts-compose input:focus, .mobile-blasts-compose textarea:focus { border-color: #e8117f; box-shadow: 0 0 0 3px rgb(232 17 127 / .12); }
.mobile-blasts-recipient-note { margin: 0; color: #5f5b54; font-size: .74rem; line-height: 1.5; }
.mobile-blasts-preview { min-height: 3rem; border: 2px solid #111; border-radius: 8px; box-shadow: 2px 2px 0 #111; }
.mobile-blasts-history-state { margin: 0; border-top: 1px solid #e1ddd4; padding: 1.15rem 1rem; color: #5f5b54; font-size: .82rem; line-height: 1.5; text-align: center; }
.mobile-blasts-history-state p { margin: 0; }
.mobile-blasts-history ul { margin: 0; border-top: 1px solid #e1ddd4; padding: 0; list-style: none; }
.mobile-blasts-history li { display: grid; gap: .75rem; padding: 1rem; }
.mobile-blasts-history li + li { border-top: 1px solid #e1ddd4; }
.mobile-blasts-history li > div:first-child { min-width: 0; }
.mobile-blasts-history li strong, .mobile-blasts-history li span { display: block; overflow-wrap: anywhere; }
.mobile-blasts-history li strong { font-size: .86rem; }
.mobile-blasts-history li > div:first-child > span { margin-top: .25rem; color: #6d685f; font-size: .72rem; }
.mobile-blasts-history-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .55rem; }
.mobile-blasts-status { width: fit-content; border-radius: 999px; background: #f5f2e8; padding: .38rem .55rem; color: #5f5b54; font-family: var(--font-mono), monospace; font-size: .54rem; font-weight: 700; text-transform: uppercase; }
.mobile-blasts-status--sent { background: #eaf7ee; color: #15803d; }
.mobile-blasts-status--scheduled { background: #e8f2ff; color: #1d4ed8; }
.mobile-blasts-status--needs_capacity { background: #fff7d6; color: #8a5a00; }
.mobile-blasts-status--failed { background: #feecec; color: #b91c1c; }
.mobile-blasts-history-actions button { min-height: 2.75rem; border: 1px solid #b91c1c; border-radius: 8px; background: #fff; padding: .65rem .8rem; color: #b91c1c; font-family: var(--font-mono), monospace; font-size: .62rem; font-weight: 700; text-transform: uppercase; }
.mobile-blasts-back:active, .mobile-blasts-state button:active, .mobile-blasts-quiet-action:active, .mobile-blasts-create:active, .mobile-blasts-templates button:active, .mobile-blasts-preview:active, .mobile-blasts-history-state button:active, .mobile-blasts-history-actions button:active { transform: scale(.97); }
.mobile-blasts-back:focus-visible, .mobile-blasts-state button:focus-visible, .mobile-blasts-quiet-action:focus-visible, .mobile-blasts-create:focus-visible, .mobile-blasts-templates button:focus-visible, .mobile-blasts-preview:focus-visible, .mobile-blasts-history-state button:focus-visible, .mobile-blasts-history-actions button:focus-visible { outline: 2px solid #e8117f; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .mobile-blasts-back, .mobile-blasts-state button, .mobile-blasts-quiet-action, .mobile-blasts-create, .mobile-blasts-templates button, .mobile-blasts-preview, .mobile-blasts-history-state button, .mobile-blasts-history-actions button { transition: none; }
}
</style>
