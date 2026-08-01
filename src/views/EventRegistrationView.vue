<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { computed, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import TurnstileWidget from '@/src/components/TurnstileWidget.vue';
import { safeGoogleMapsUrl } from '@/lib/location-links';
import { turnstileEnabled } from '@/src/lib/turnstile';
import { EVENT_REGISTRATION_TURNSTILE_ACTION } from '@/lib/turnstile';
import { registrationFirstName } from '@/src/lib/registration-workspace';
import {
  fetchPublicEventRegistration,
  queryKeys,
  submitEventRegistration,
} from '@/src/lib/api';
import { versionPublicMeetupMediaUrl } from '@/src/lib/public-meetup-media';

const route = useRoute();
const eventKey = computed(() => String(route.params.eventKey ?? route.params.eventId ?? ''));
const eventDetailsView = computed(() => route.query.view === 'details');
const logoSrc = '/brand/dev-con-logo.png';
const form = reactive({ name: '', email: '' });
const submitting = ref(false);
const error = ref('');
const receipt = ref<{ name: string } | null>(null);
const receiptFirstName = computed(() => registrationFirstName(receipt.value?.name ?? ''));
const turnstileWidget = ref<InstanceType<typeof TurnstileWidget> | null>(null);
const turnstileToken = ref('');
const turnstileError = ref('');
const turnstileActive = turnstileEnabled();

const registrationQuery = useQuery({
  queryKey: computed(() => queryKeys.publicEventRegistration(eventKey.value)),
  queryFn: () => fetchPublicEventRegistration(eventKey.value),
  enabled: computed(() => Boolean(eventKey.value)),
  retry: false,
});
const registration = computed(() => registrationQuery.data.value ?? null);
const registrationCoverSrc = computed(() => {
  const event = registration.value?.event;
  if (!event?.cover) return null;
  return versionPublicMeetupMediaUrl(event.cover, event.updated_at);
});
const detailsMapUrl = computed(() => safeGoogleMapsUrl(registration.value?.event.location?.url));
const canSubmit = computed(() => (
  registration.value?.available === true
  && form.name.trim().length > 0
  && form.email.trim().length > 0
  && (!turnstileActive || turnstileToken.value.length > 0)
  && !submitting.value
));

function formatEventDate(value: string): string {
  return new Intl.DateTimeFormat('en-GH', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Africa/Accra',
  }).format(new Date(value));
}

function unavailableMessage(reason: string | null | undefined): string {
  if (reason === 'not_open') return 'Registration has not opened yet.';
  if (reason === 'ended' || reason === 'closed') return 'Registration is closed.';
  return 'Registration is not open yet.';
}

async function submitRegistration() {
  if (!canSubmit.value) return;
  submitting.value = true;
  error.value = '';

  try {
    await submitEventRegistration(eventKey.value, {
      name: form.name,
      email: form.email,
      turnstile_action: turnstileActive ? EVENT_REGISTRATION_TURNSTILE_ACTION : undefined,
      turnstile_token: turnstileActive ? turnstileToken.value : undefined,
    });
    receipt.value = { name: form.name.trim() };
  } catch (submitError) {
    error.value = submitError instanceof Error
      ? submitError.message
      : 'We could not save your registration. Please try again.';
    if (turnstileActive) {
      turnstileToken.value = '';
      turnstileWidget.value?.reset();
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="registration-page">
    <div class="registration-shell">
      <header class="registration-brand">
        <img :src="logoSrc" alt="DevCongress" class="registration-brand-logo">
        <div>
          <p class="registration-brand-name">DevCongress</p>
          <p class="registration-brand-copy">{{ eventDetailsView ? 'Community meetup details' : 'Community meetup registration' }}</p>
        </div>
      </header>

      <div v-if="registrationQuery.isPending.value" class="registration-state-card editorial-panel animate-pulse" aria-label="Loading event registration" />

      <section v-else-if="registrationQuery.isError.value || !registration" class="registration-state-card editorial-panel">
        <p class="editorial-eyebrow">registration unavailable</p>
        <h1>This registration link is not active.</h1>
        <p>Check the link or contact a DevCongress organizer.</p>
      </section>

      <div v-else class="registration-workspace editorial-panel">
        <section
          class="registration-event-card"
          :class="{ 'registration-event-card--with-cover': registrationCoverSrc }"
        >
          <img
            v-if="registrationCoverSrc"
            :src="registrationCoverSrc"
            :alt="`${registration.event.name} cover`"
            class="registration-cover"
          >
          <div class="registration-event-body">
            <p class="editorial-eyebrow">free monthly meetup</p>
            <h1 class="registration-event-title">{{ registration.event.name }}</h1>
            <p v-if="registration.event.description" class="registration-event-description">{{ registration.event.description }}</p>
            <dl class="registration-event-meta">
              <div>
                <dt>When</dt>
                <dd>{{ formatEventDate(registration.event.event_date) }}</dd>
              </div>
              <div>
                <dt>Where</dt>
                <dd>{{ registration.event.location?.label ?? registration.event.location?.name ?? 'To be announced' }}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section
          v-if="eventDetailsView"
          class="registration-action-card"
        >
          <div class="registration-stub-header">
            <p class="editorial-eyebrow">event details</p>
            <span class="registration-stub-code" aria-hidden="true">DEVCONGRESS / ACCRA</span>
          </div>
          <h2 class="registration-action-title">Everything for the day.</h2>
          <p class="registration-action-copy">
            You’ll find the event time, venue, and calendar actions here and in your confirmation email.
          </p>
          <a
            v-if="detailsMapUrl"
            :href="detailsMapUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="registration-details-map editorial-secondary-action"
          >
            OPEN MAP
          </a>
        </section>

        <section
          v-else-if="receipt"
          class="registration-action-card"
          aria-live="polite"
        >
          <div class="registration-stub-header">
            <p class="editorial-eyebrow">request received</p>
            <span class="registration-stub-code" aria-hidden="true">RSVP / CHECK EMAIL</span>
          </div>
          <h2 class="registration-action-title">Thanks, {{ receiptFirstName }}.</h2>
          <p class="registration-action-copy">
            If this email can be registered, a confirmation or waitlist update will arrive shortly.
          </p>
        </section>

        <section v-else-if="registration.available" class="registration-action-card">
          <div class="registration-stub-header">
            <p class="editorial-eyebrow">your details</p>
            <span class="registration-stub-code" aria-hidden="true">RSVP / FREE</span>
          </div>
          <h2 class="registration-action-title">Save your place</h2>
          <form class="registration-form" @submit.prevent="submitRegistration">
            <div class="registration-field">
              <label for="registration-name" class="editorial-label">Name</label>
              <input
                id="registration-name"
                v-model="form.name"
                name="name"
                autocomplete="name"
                maxlength="120"
                required
                class="editorial-input"
                placeholder="Attendee name"
              >
            </div>
            <div class="registration-field">
              <label for="registration-email" class="editorial-label">Email</label>
              <input
                id="registration-email"
                v-model="form.email"
                name="email"
                type="email"
                autocomplete="email"
                maxlength="254"
                required
                class="editorial-input"
                placeholder="name@example.com"
              >
            </div>
            <TurnstileWidget
              v-if="turnstileActive"
              ref="turnstileWidget"
              :action="EVENT_REGISTRATION_TURNSTILE_ACTION"
              @token-change="turnstileToken = $event"
              @error="turnstileError = $event ?? ''"
            />
            <p v-if="error || turnstileError" class="registration-form-note registration-form-note--error" role="alert">{{ error || turnstileError }}</p>
            <p v-else class="registration-form-note">
              Only used for registration and event check-in.
            </p>
            <button type="submit" class="registration-submit editorial-action" :disabled="!canSubmit">
              {{ submitting ? 'SAVING…' : 'REGISTER' }}
            </button>
          </form>
        </section>

        <section v-else class="registration-action-card">
          <div class="registration-stub-header">
            <p class="editorial-eyebrow">registration</p>
            <span class="registration-stub-code" aria-hidden="true">RSVP / CLOSED</span>
          </div>
          <h2 class="registration-action-title">{{ unavailableMessage(registration.unavailable_reason) }}</h2>
          <p class="registration-action-copy">Contact a DevCongress organizer if you expected registration to be open.</p>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped>
:global(.app-shell--standalone) {
  height: 100vh;
  height: 100svh;
  min-height: 100vh;
  min-height: 100svh;
  max-height: 100vh;
  max-height: 100svh;
  overflow: hidden !important;
}

:global(.app-shell--standalone .app-main) {
  height: auto;
  flex: 1 1 auto !important;
  min-height: 0 !important;
  overflow: hidden !important;
}

:global(.app-shell--standalone .page-route-stack),
:global(.app-shell--standalone .page-route-stack > .page-view),
:global(.app-shell--standalone .page-view) {
  height: 100%;
  min-height: 0 !important;
}

.registration-page {
  box-sizing: border-box;
  display: flex;
  height: 100%;
  align-items: center;
  align-items: safe center;
  justify-content: center;
  overflow: hidden;
  background: #f5f2e8;
  padding:
    clamp(1rem, 3svh, 2rem)
    max(clamp(1rem, 3vw, 2rem), env(safe-area-inset-right))
    max(clamp(1rem, 3svh, 2rem), env(safe-area-inset-bottom))
    max(clamp(1rem, 3vw, 2rem), env(safe-area-inset-left));
  color: #111111;
}

.registration-shell {
  display: grid;
  width: min(100%, 70rem);
  height: auto;
  max-height: 100%;
  min-height: 0;
  grid-template-rows: auto auto;
  gap: clamp(0.75rem, 2svh, 1.25rem);
}

.registration-brand {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.65rem;
}

.registration-brand-logo {
  width: 2.25rem;
  height: 2.25rem;
  flex: 0 0 auto;
  border-radius: 6px;
  object-fit: contain;
}

.registration-brand-name,
.registration-event-meta dt {
  color: #e8117f;
  font-family: var(--font-mono), monospace;
  font-size: 0.68rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.08em;
  line-height: 1.15;
  text-transform: uppercase;
}

.registration-brand-copy {
  margin-top: 0.18rem;
  color: #555555;
  font-size: 0.82rem;
  font-weight: var(--font-weight-label);
  line-height: 1.2;
}

.registration-state-card {
  display: grid;
  min-height: 0;
  align-content: center;
  background: #ffffff;
  padding: clamp(1.25rem, 4vw, 3rem);
}

.registration-state-card h1 {
  margin-top: 0.4rem;
  font-size: clamp(1.8rem, 5vw, 3.5rem);
  font-weight: var(--font-weight-heading);
  letter-spacing: -0.035em;
  line-height: 0.98;
}

.registration-state-card > p:last-child {
  margin-top: 0.85rem;
  color: #555555;
  line-height: 1.5;
}

.registration-workspace {
  display: grid;
  position: relative;
  min-width: 0;
  min-height: 0;
  grid-template-columns: minmax(0, 1.08fr) minmax(20rem, 0.92fr);
  gap: 0;
  align-items: stretch;
  overflow: hidden;
  background: #ffffff;
}

.registration-event-card,
.registration-action-card {
  position: relative;
  min-width: 0;
  min-height: 0;
  align-self: stretch;
  overflow: hidden;
  background: #ffffff;
}

.registration-event-card {
  display: grid;
  align-content: stretch;
  background: #ffffff;
}

.registration-event-card--with-cover {
  grid-template-rows: minmax(0, auto) minmax(0, 1fr);
}

.registration-cover {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-bottom: 2px solid #111111;
  object-fit: cover;
}

.registration-event-body,
.registration-action-card {
  padding: clamp(1.25rem, 3vw, 2rem);
}

.registration-event-body {
  display: flex;
  min-height: 0;
  flex-direction: column;
}

.registration-event-body .editorial-eyebrow,
.registration-action-card .editorial-eyebrow,
.registration-state-card .editorial-eyebrow {
  margin-bottom: 0;
}

.registration-event-title {
  display: -webkit-box;
  margin-top: 0.65rem;
  overflow: hidden;
  color: #111111;
  font-size: clamp(2rem, 4vw, 3.75rem);
  font-weight: var(--font-weight-heading);
  letter-spacing: -0.035em;
  line-height: 1;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.registration-event-description {
  display: -webkit-box;
  margin-top: 0.9rem;
  overflow: hidden;
  color: #555555;
  font-size: 0.95rem;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.registration-event-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  margin-top: auto;
  border-top: 1px solid #dedad1;
  padding-top: 1rem;
}

.registration-event-meta dt {
  color: #555555;
  font-size: 0.62rem;
}

.registration-event-meta dd {
  display: -webkit-box;
  margin-top: 0.35rem;
  overflow: hidden;
  font-size: 0.82rem;
  font-weight: var(--font-weight-heading);
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.registration-action-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  border-left: 1px dashed #b8b1a2;
  background: #fffced;
}

.registration-action-card::before,
.registration-action-card::after {
  position: absolute;
  left: 0;
  z-index: 2;
  width: 1.15rem;
  height: 1.15rem;
  border: 2px solid #111111;
  border-radius: 50%;
  background: #f5f2e8;
  content: "";
}

.registration-action-card::before {
  top: 0;
  transform: translate(-50%, -50%);
}

.registration-action-card::after {
  bottom: 0;
  transform: translate(-50%, 50%);
}

.registration-action-card--celebration > :not(.registration-celebration) {
  position: relative;
  z-index: 1;
}

.registration-celebration {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.registration-confetti {
  --confetti-x: 0rem;
  --confetti-y: 0rem;
  --confetti-rotate: 0deg;
  position: absolute;
  top: 48%;
  left: 50%;
  width: 0.42rem;
  height: 0.9rem;
  border-radius: 2px;
  background: #eb007d;
  opacity: 0;
  animation: registration-confetti-burst 700ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.registration-confetti:nth-child(2n) {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: #f5e642;
}

.registration-confetti:nth-child(3n) {
  background: #7c3aed;
}

.registration-confetti:nth-child(4n) {
  background: #111111;
}

.registration-confetti:nth-child(1) { --confetti-x: -11rem; --confetti-y: -7.5rem; --confetti-rotate: -42deg; }
.registration-confetti:nth-child(2) { --confetti-x: -7.5rem; --confetti-y: -10rem; --confetti-rotate: 64deg; animation-delay: 30ms; }
.registration-confetti:nth-child(3) { --confetti-x: -3.5rem; --confetti-y: -8rem; --confetti-rotate: 118deg; animation-delay: 70ms; }
.registration-confetti:nth-child(4) { --confetti-x: 2.5rem; --confetti-y: -9.5rem; --confetti-rotate: -72deg; animation-delay: 20ms; }
.registration-confetti:nth-child(5) { --confetti-x: 7rem; --confetti-y: -7rem; --confetti-rotate: 46deg; animation-delay: 90ms; }
.registration-confetti:nth-child(6) { --confetti-x: 10.5rem; --confetti-y: -3.5rem; --confetti-rotate: 126deg; animation-delay: 50ms; }
.registration-confetti:nth-child(7) { --confetti-x: -10rem; --confetti-y: 1.5rem; --confetti-rotate: 78deg; animation-delay: 110ms; }
.registration-confetti:nth-child(8) { --confetti-x: -7rem; --confetti-y: 6rem; --confetti-rotate: -118deg; animation-delay: 40ms; }
.registration-confetti:nth-child(9) { --confetti-x: -1.5rem; --confetti-y: 7.5rem; --confetti-rotate: 52deg; animation-delay: 130ms; }
.registration-confetti:nth-child(10) { --confetti-x: 4rem; --confetti-y: 6.5rem; --confetti-rotate: 142deg; animation-delay: 80ms; }
.registration-confetti:nth-child(11) { --confetti-x: 8rem; --confetti-y: 4.5rem; --confetti-rotate: -54deg; animation-delay: 120ms; }
.registration-confetti:nth-child(12) { --confetti-x: 11rem; --confetti-y: 1rem; --confetti-rotate: 96deg; animation-delay: 60ms; }

@keyframes registration-confetti-burst {
  0% {
    opacity: 0;
    transform: translate3d(0, 1rem, 0) scale(0.4) rotate(0deg);
  }

  60% {
    opacity: 0.85;
  }

  100% {
    opacity: 0.3;
    transform: translate3d(var(--confetti-x), var(--confetti-y), 0) scale(1) rotate(var(--confetti-rotate));
  }
}

.registration-stub-header {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.registration-stub-code {
  flex: 0 0 auto;
  border-left: 1px solid #c9c2b3;
  padding-left: 0.75rem;
  color: #6b675f;
  font-family: var(--font-mono), monospace;
  font-size: 0.62rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.12em;
  line-height: 1;
  text-transform: uppercase;
}

.registration-action-title {
  display: -webkit-box;
  margin-top: 0.55rem;
  overflow: hidden;
  font-size: clamp(1.65rem, 3vw, 2.6rem);
  font-weight: var(--font-weight-heading);
  letter-spacing: -0.03em;
  line-height: 1;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.registration-action-copy {
  display: -webkit-box;
  margin-top: 0.8rem;
  overflow: hidden;
  color: #555555;
  font-size: 0.95rem;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}

.registration-delivery-note {
  margin-top: 1rem;
  border: 1px solid #dedad1;
  border-radius: 6px;
  background: #f5f2e8;
  padding: 0.8rem;
  color: #555555;
  font-size: 0.82rem;
  line-height: 1.4;
}

.registration-details-map {
  display: inline-flex;
  width: fit-content;
  min-height: 2.75rem;
  align-items: center;
  justify-content: center;
  margin-top: 1.25rem;
  padding: 0.625rem 1rem;
}

.registration-form {
  display: flex;
  flex: 0 0 auto;
  min-height: 0;
  flex-direction: column;
  gap: clamp(0.65rem, 1.6svh, 1rem);
  margin-top: clamp(1rem, 2.4svh, 1.5rem);
}

.registration-field {
  min-width: 0;
}

.registration-form .editorial-label {
  margin-bottom: 0.35rem;
  font-size: 0.68rem;
}

.registration-form .editorial-input {
  min-height: 3rem;
  padding-block: 0.7rem;
}

.registration-form-note {
  display: -webkit-box;
  min-height: 1.2rem;
  overflow: hidden;
  color: #555555;
  font-size: 0.7rem;
  line-height: 1.4;
  text-align: center;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.registration-form-note--error {
  border: 1px solid #fca5a5;
  border-radius: 6px;
  background: #fef2f2;
  padding: 0.45rem 0.6rem;
  color: #b42318;
  font-weight: var(--font-weight-label);
}

.registration-submit {
  width: 100%;
  min-height: 3rem;
}

@media (max-width: 767px) {
  :global(.app-shell--standalone) {
    height: auto;
    min-height: 100vh;
    min-height: 100svh;
    max-height: none;
    overflow: visible !important;
  }

  :global(.app-shell--standalone .app-main) {
    height: auto;
    min-height: 0 !important;
    overflow: visible !important;
  }

  :global(.app-shell--standalone .page-route-stack),
  :global(.app-shell--standalone .page-route-stack > .page-view),
  :global(.app-shell--standalone .page-view) {
    height: auto;
    min-height: 0 !important;
  }

  .registration-page {
    height: auto;
    min-height: 100vh;
    min-height: 100svh;
    align-items: flex-start;
    overflow: visible;
    padding:
      max(1rem, env(safe-area-inset-top))
      max(1rem, env(safe-area-inset-right))
      max(1.25rem, env(safe-area-inset-bottom))
      max(1rem, env(safe-area-inset-left));
  }

  .registration-shell {
    height: auto;
    max-height: none;
    grid-template-rows: auto auto;
    gap: 0.75rem;
  }

  .registration-brand {
    gap: 0.6rem;
  }

  .registration-brand-logo {
    width: 2rem;
    height: 2rem;
  }

  .registration-brand-name {
    font-size: 0.62rem;
  }

  .registration-brand-copy {
    margin-top: 0.12rem;
    font-size: 0.75rem;
  }

  .registration-workspace {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto;
    gap: 0;
    align-content: start;
  }

  .registration-event-card,
  .registration-action-card {
    height: auto;
    align-self: stretch;
    justify-content: flex-start;
  }

  .registration-cover {
    max-height: none;
    border-bottom-width: 2px;
  }

  .registration-event-body,
  .registration-action-card {
    padding: 1.25rem;
  }

  .registration-action-card {
    border-top: 1px dashed #b8b1a2;
    border-left: 0;
  }

  .registration-action-card::before,
  .registration-action-card::after {
    top: 0;
    bottom: auto;
  }

  .registration-action-card::before {
    left: 0;
    transform: translate(-50%, -50%);
  }

  .registration-action-card::after {
    right: 0;
    left: auto;
    transform: translate(50%, -50%);
  }

  .registration-event-body .editorial-eyebrow,
  .registration-action-card .editorial-eyebrow {
    font-size: 0.62rem;
    letter-spacing: 0.16em;
  }

  .registration-event-title {
    margin-top: 0.65rem;
    font-size: clamp(1.55rem, 7vw, 1.9rem);
    font-weight: var(--font-weight-heading);
    letter-spacing: -0.025em;
    line-height: 1.08;
    -webkit-line-clamp: 2;
  }

  .registration-event-description {
    margin-top: 0.8rem;
    font-size: 0.875rem;
    line-height: 1.45;
    -webkit-line-clamp: 3;
  }

  .registration-event-meta {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.9rem;
    margin-top: 1.1rem;
    padding-top: 1rem;
  }

  .registration-event-meta dt {
    font-size: 0.58rem;
  }

  .registration-event-meta dd {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    line-height: 1.3;
    -webkit-line-clamp: 2;
  }

  .registration-action-title {
    margin-top: 0.65rem;
    font-size: 1.55rem;
    line-height: 1.08;
  }

  .registration-action-copy {
    margin-top: 0.75rem;
    font-size: 0.875rem;
    line-height: 1.45;
  }

  .registration-delivery-note {
    margin-top: 0.85rem;
    padding: 0.75rem;
    font-size: 0.75rem;
  }

  .registration-details-map {
    min-height: 3rem;
    margin-top: 1rem;
  }

  .registration-form {
    gap: 0.85rem;
    margin-top: 1.1rem;
  }

  .registration-form .editorial-label {
    margin-bottom: 0.35rem;
    font-size: 0.62rem;
  }

  .registration-form .editorial-input {
    min-height: 3.25rem;
    padding: 0.75rem 0.8rem !important;
    font-size: 1rem;
  }

  .registration-form-note {
    margin-top: 0;
    min-height: 0;
    font-size: 0.68rem;
    line-height: 1.45;
    -webkit-line-clamp: 2;
  }

  .registration-submit {
    min-height: 3.25rem;
    margin-top: 0.1rem;
    padding-block: 0.75rem !important;
  }
}

@media (min-width: 768px) and (max-height: 700px) {
  .registration-page {
    align-items: stretch;
    padding:
      0.5rem
      max(0.75rem, env(safe-area-inset-right))
      max(0.5rem, env(safe-area-inset-bottom))
      max(0.75rem, env(safe-area-inset-left));
  }

  .registration-shell {
    height: 100%;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0.5rem;
  }

  .registration-brand-logo {
    width: 1.5rem;
    height: 1.5rem;
  }

  .registration-brand-copy {
    display: none;
  }

  .registration-workspace {
    gap: 0.65rem;
  }

  .registration-cover {
    aspect-ratio: 16 / 9;
  }

  .registration-event-body {
    padding: 0.75rem;
  }

  .registration-action-card {
    padding: 0.5rem;
  }

  .registration-event-title {
    margin-top: 0.35rem;
    font-size: clamp(1.45rem, 4vw, 2rem);
    -webkit-line-clamp: 2;
  }

  .registration-event-description {
    margin-top: 0.45rem;
    font-size: 0.76rem;
    line-height: 1.3;
    -webkit-line-clamp: 1;
  }

  .registration-event-meta {
    margin-top: 0.6rem;
    padding-top: 0.5rem;
  }

  .registration-action-title {
    font-size: 1.25rem;
  }

  .registration-form {
    gap: 0.25rem;
    margin-top: 0.25rem;
  }

  .registration-form .editorial-label {
    margin-bottom: 0.18rem;
    font-size: 0.58rem;
  }

  .registration-form .editorial-input,
  .registration-submit {
    min-height: 2.75rem;
  }

  .registration-form-note {
    display: none;
  }

  .registration-submit {
    margin-top: auto;
  }
}

@media (max-width: 340px) {
  .registration-page {
    padding-right: max(0.75rem, env(safe-area-inset-right));
    padding-left: max(0.75rem, env(safe-area-inset-left));
  }

  .registration-stub-code {
    padding-left: 0.55rem;
    font-size: 0.56rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .registration-confetti {
    opacity: 0.22;
    animation: none;
    transform: translate3d(var(--confetti-x), var(--confetti-y), 0) rotate(var(--confetti-rotate));
  }
}
</style>
