<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import QRCode from 'qrcode';
import { adminPath } from '@/src/admin-routes';
import { fetchEventById, fetchFeedbackEventStatus } from '@/src/lib/api';
import type { Event as CommunityEvent } from '@/types';

const route = useRoute();
const loading = ref(true);
const error = ref('');
const event = ref<CommunityEvent | null>(null);
const publicUrl = ref<string | null>(null);
const qrCodeUrl = ref<string | null>(null);
const available = ref(false);

const eventId = computed(() => String(route.params.eventId ?? ''));
const eventHasStarted = computed(() => (
  event.value ? new Date(event.value.event_date).getTime() <= Date.now() : false
));
const canShowQr = computed(() => (
  available.value
  && eventHasStarted.value
  && Boolean(publicUrl.value)
  && Boolean(qrCodeUrl.value)
));
const unavailableCopy = computed(() => {
  if (available.value && !eventHasStarted.value) {
    return 'This event has not happened yet. The feedback QR becomes available after the event date.';
  }

  return 'Open or publish the feedback flow for this event first. Once the feedback window is live, this page becomes your TV-safe QR screen.';
});

const eventDateCopy = computed(() => {
  if (!event.value) return '';
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(event.value.event_date));
});

async function buildQrCode(url: string) {
  qrCodeUrl.value = await QRCode.toDataURL(url, {
    margin: 1,
    width: 520,
    color: {
      dark: '#0b0b0d',
      light: '#fff7bf',
    },
  });
}

async function loadDisplay() {
  loading.value = true;
  error.value = '';

  try {
    const [eventPayload, statusPayload] = await Promise.all([
      fetchEventById(eventId.value),
      fetchFeedbackEventStatus(eventId.value),
    ]);

    event.value = eventPayload;
    available.value = statusPayload.available;
    publicUrl.value = statusPayload.public_url;

    if (statusPayload.available && eventHasStarted.value && statusPayload.public_url) {
      await buildQrCode(statusPayload.public_url);
    } else {
      qrCodeUrl.value = null;
    }
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Unable to load feedback display.';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadDisplay();
});
</script>

<template>
  <div class="feedback-display-page">
    <div class="feedback-display-shell">
      <div v-if="loading" class="feedback-display-state">
        <p class="editorial-eyebrow mb-3">feedback display</p>
        <h1>Preparing QR display…</h1>
      </div>

      <div v-else-if="error" class="feedback-display-state">
        <p class="editorial-eyebrow mb-3">feedback display</p>
        <h1>Unable to load this event.</h1>
        <p>{{ error }}</p>
        <RouterLink :to="adminPath('feedback')" class="editorial-secondary-action mt-6">Back to feedback</RouterLink>
      </div>

      <template v-else-if="event">
        <header class="feedback-display-header">
          <p class="editorial-eyebrow">feedback display</p>
          <h1>{{ event.name }}</h1>
          <p v-if="canShowQr" class="feedback-display-lead">Scan the QR code to open the live feedback form on your phone.</p>
          <p v-else class="feedback-display-lead">{{ unavailableCopy }}</p>
        </header>

        <div class="feedback-display-card">
          <div v-if="canShowQr" class="feedback-display-grid">
            <div class="feedback-display-qr-wrap">
              <img :src="qrCodeUrl as string" :alt="`QR code for ${event.name} feedback form`" class="feedback-display-qr" />
              <p class="feedback-display-qr-caption">Camera open. Point at the code.</p>
            </div>
            <div class="feedback-display-copy">
              <p class="feedback-display-kicker">event feedback</p>
              <div class="feedback-display-story">
                <h2>Scan. Rate. Leave one note.</h2>
                <p>Help us keep what worked and fix what did not. It takes about two minutes.</p>
              </div>
              <dl class="feedback-display-meta">
                <div>
                  <dt>Event</dt>
                  <dd>{{ event.name }}</dd>
                </div>
                <div>
                  <dt>Date</dt>
                  <dd>{{ eventDateCopy }}</dd>
                </div>
                <div v-if="event.location?.label">
                  <dt>Venue</dt>
                  <dd>{{ event.location.label }}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div v-else class="feedback-display-empty">
            <p class="feedback-display-kicker">Feedback form unavailable</p>
            <p class="feedback-display-empty-copy">{{ unavailableCopy }}</p>
            <RouterLink :to="adminPath('feedback')" class="editorial-secondary-action">Back to feedback</RouterLink>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
