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
const feedbackWindow = ref<{ opens_at: string | null; closes_at: string | null } | null>(null);

const eventId = computed(() => String(route.params.eventId ?? ''));
const organizerFeedbackPath = computed(() => adminPath(`events/${eventId.value}/feedback`));
const canShowQr = computed(() => available.value && Boolean(publicUrl.value) && Boolean(qrCodeUrl.value));

function formatWindowDate(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

const windowCopy = computed(() => {
  if (!feedbackWindow.value?.opens_at || !feedbackWindow.value?.closes_at) {
    return 'Feedback window follows the event campaign settings.';
  }

  const opens = formatWindowDate(feedbackWindow.value.opens_at);
  const closes = formatWindowDate(feedbackWindow.value.closes_at);
  return `${opens} to ${closes}`;
});

async function buildQrCode(url: string) {
  qrCodeUrl.value = await QRCode.toDataURL(url, {
    margin: 1,
    width: 360,
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
    feedbackWindow.value = statusPayload.feedback_window;
    publicUrl.value = statusPayload.public_url;

    if (statusPayload.available && statusPayload.public_url) {
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
          <p v-else class="feedback-display-lead">This event feedback form is not open yet. Open or publish the feedback campaign first, then come back here.</p>
        </header>

        <div class="feedback-display-card">
          <div v-if="canShowQr" class="feedback-display-grid">
            <div class="feedback-display-qr-wrap">
              <img :src="qrCodeUrl as string" :alt="`QR code for ${event.name} feedback form`" class="feedback-display-qr" />
            </div>
            <div class="feedback-display-copy">
              <div>
                <p class="feedback-display-kicker">Scan to share feedback</p>
                <p class="feedback-display-url">{{ publicUrl }}</p>
              </div>
              <div class="feedback-display-meta">
                <p><strong>Window</strong> {{ windowCopy }}</p>
                <p><strong>Fallback</strong> Open the link directly if scanning is awkward.</p>
              </div>
              <div class="feedback-display-actions">
                <a :href="publicUrl as string" target="_blank" rel="noreferrer" class="editorial-action">Open feedback form</a>
                <RouterLink :to="organizerFeedbackPath" class="editorial-secondary-action">Campaign settings</RouterLink>
              </div>
            </div>
          </div>

          <div v-else class="feedback-display-empty">
            <p class="feedback-display-kicker">Feedback form unavailable</p>
            <p class="feedback-display-empty-copy">Use the campaign settings to open the form first. Once the feedback window is live, this page becomes your TV-safe QR screen.</p>
            <div class="feedback-display-actions">
              <RouterLink :to="organizerFeedbackPath" class="editorial-action">Open campaign settings</RouterLink>
              <RouterLink :to="adminPath('feedback')" class="editorial-secondary-action">Back to feedback</RouterLink>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
