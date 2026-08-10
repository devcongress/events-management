<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import QRCode from 'qrcode';
import { registrationAvailability } from '@/lib/event-registration';
import { adminPath } from '@/src/admin-routes';
import { ensureAdminShortLink, fetchEventRegistrations } from '@/src/lib/api';
import { notify } from '@/src/lib/notify';
import type { AdminEventRegistrationsResponse } from '@/src/lib/api';

const route = useRoute();
const loading = ref(true);
const error = ref('');
const registrationData = ref<AdminEventRegistrationsResponse | null>(null);
const qrCodeUrl = ref<string | null>(null);
const linkCopied = ref(false);
const shortLinkUrl = ref<string | null>(null);

const eventId = computed(() => String(route.params.eventId ?? ''));
const event = computed(() => registrationData.value?.event ?? null);
const publicUrl = computed(() => registrationData.value?.public_url ?? null);
const publicShareUrl = computed(() => shortLinkUrl.value ?? publicUrl.value);
const registrationIsAvailable = computed(() => (
  registrationData.value?.managed_internally === true
  && registrationAvailability(registrationData.value.campaign).available
  && Boolean(publicUrl.value)
));
const canShowQr = computed(() => registrationIsAvailable.value && Boolean(qrCodeUrl.value));
const unavailableCopy = computed(() => {
  if (!registrationData.value?.managed_internally) {
    return 'This event does not have an internal registration campaign yet.';
  }
  return 'Open registration in Form & capacity first. The QR code becomes available when the public form is accepting guests.';
});
const returnPath = computed(() => adminPath(`events/${encodeURIComponent(eventId.value)}/registrations`));

const eventDateCopy = computed(() => {
  if (!event.value) return '';
  return new Intl.DateTimeFormat('en-GH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'Africa/Accra',
  }).format(new Date(event.value.event_date));
});

async function buildQrCode(url: string) {
  qrCodeUrl.value = await QRCode.toDataURL(url, {
    margin: 1,
    width: 600,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#111111',
      light: '#fff7bf',
    },
  });
}

async function loadDisplay() {
  loading.value = true;
  error.value = '';

  try {
    const payload = await fetchEventRegistrations(eventId.value);
    registrationData.value = payload;
    if (payload.managed_internally && registrationAvailability(payload.campaign).available && payload.public_url) {
      try {
        const shortLink = await ensureAdminShortLink({ destination: 'event_registration', event_id: eventId.value });
        shortLinkUrl.value = shortLink.url;
      } catch {
        shortLinkUrl.value = null;
      }
      await buildQrCode(shortLinkUrl.value ?? payload.public_url);
    } else {
      qrCodeUrl.value = null;
    }
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Unable to load the registration display.';
  } finally {
    loading.value = false;
  }
}

async function copyRegistrationLink() {
  if (!publicUrl.value || !registrationIsAvailable.value) return;
  try {
    const shortLink = shortLinkUrl.value
      ? { url: shortLinkUrl.value }
      : await ensureAdminShortLink({ destination: 'event_registration', event_id: eventId.value });
    shortLinkUrl.value = shortLink.url;
    await navigator.clipboard.writeText(shortLink.url);
    linkCopied.value = true;
    notify.success('Registration link copied.');
    window.setTimeout(() => {
      linkCopied.value = false;
    }, 2_000);
  } catch {
    notify.error('Unable to copy the registration link.');
  }
}

onMounted(() => {
  void loadDisplay();
});
</script>

<template>
  <div class="feedback-display-page registration-display-page">
    <div class="feedback-display-shell registration-display-shell">
      <div v-if="loading" class="feedback-display-state">
        <p class="editorial-eyebrow mb-3">on-site registration</p>
        <h1>Preparing registration QR…</h1>
      </div>

      <div v-else-if="error" class="feedback-display-state">
        <p class="editorial-eyebrow mb-3">on-site registration</p>
        <h1>Unable to load this display.</h1>
        <p>{{ error }}</p>
        <RouterLink :to="returnPath" class="editorial-secondary-action mt-6">Back to registrations</RouterLink>
      </div>

      <template v-else-if="event">
        <header class="feedback-display-header registration-display-header">
          <p class="editorial-eyebrow">on-site registration</p>
          <h1>Scan to register.</h1>
          <p class="feedback-display-lead">
            Guests can scan this code with their phone camera and complete the same registration form used online.
          </p>
        </header>

        <section class="feedback-display-card registration-display-card">
          <div v-if="canShowQr" class="registration-display-grid">
            <div class="feedback-display-qr-wrap registration-display-qr-wrap" aria-label="On-site registration QR code">
              <img :src="qrCodeUrl as string" :alt="`QR code for ${event.name} registration form`" class="feedback-display-qr registration-display-qr" />
              <p class="feedback-display-qr-caption">Open camera · point at the code</p>
            </div>
            <div class="feedback-display-copy registration-display-copy">
              <p class="feedback-display-kicker">{{ event.name }}</p>
              <div class="feedback-display-story">
                <h2>Arrive. Scan. Join us.</h2>
                <p>No app download is needed. The form is designed for a quick phone registration at the door.</p>
              </div>
              <dl class="feedback-display-meta">
                <div>
                  <dt>Date</dt>
                  <dd>{{ eventDateCopy }}</dd>
                </div>
                <div v-if="event.location?.label || event.location?.name">
                  <dt>Venue</dt>
                  <dd>{{ event.location?.label ?? event.location?.name }}</dd>
                </div>
              </dl>
              <div class="registration-display-actions">
                <a :href="publicShareUrl as string" class="editorial-action min-h-11 justify-center px-4" target="_blank" rel="noopener noreferrer">Open form on this phone</a>
                <button type="button" class="editorial-secondary-action min-h-11 justify-center px-4" @click="copyRegistrationLink">
                  {{ linkCopied ? 'Link copied' : 'Copy form link' }}
                </button>
              </div>
              <p class="registration-display-url">{{ publicShareUrl }}</p>
            </div>
          </div>

          <div v-else class="feedback-display-empty">
            <p class="feedback-display-kicker">Registration QR unavailable</p>
            <p class="feedback-display-empty-copy">{{ unavailableCopy }}</p>
            <RouterLink :to="returnPath" class="editorial-secondary-action">Back to registrations</RouterLink>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.registration-display-shell {
  width: min(1180px, calc(100vw - 2.5rem));
}

.registration-display-header h1 {
  max-width: 10ch;
}

.registration-display-grid {
  display: grid;
  gap: 0;
}

.registration-display-qr-wrap {
  border-top: 0.45rem solid #e8117f;
}

.registration-display-qr {
  width: min(100%, 31rem);
}

.registration-display-copy {
  gap: 1.35rem;
}

.registration-display-actions {
  display: grid;
  gap: 0.65rem;
}

.registration-display-url {
  overflow-wrap: anywhere;
  color: #77736b;
  font-family: var(--font-mono), monospace;
  font-size: 0.68rem;
  line-height: 1.5;
}

@media (min-width: 1024px) {
  .registration-display-grid {
    grid-template-columns: minmax(30rem, 36rem) minmax(0, 1fr);
    align-items: stretch;
  }

  .registration-display-qr-wrap {
    border-right: 2px solid #111111;
    border-bottom: 0;
  }

  .registration-display-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (prefers-reduced-motion: reduce) {
  .registration-display-actions * {
    transition: none;
  }
}
</style>
