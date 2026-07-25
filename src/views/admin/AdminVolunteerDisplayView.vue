<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import QRCode from 'qrcode';

const qrCodeUrl = ref<string | null>(null);
const error = ref('');
const publicUrl = computed(() => `${window.location.origin}/volunteer/december-mega-meetup`);

onMounted(async () => {
  try {
    qrCodeUrl.value = await QRCode.toDataURL(publicUrl.value, {
      margin: 1,
      width: 520,
      color: {
        dark: '#0b0b0d',
        light: '#fff7bf',
      },
    });
  } catch {
    error.value = 'Unable to prepare the volunteer QR code.';
  }
});
</script>

<template>
  <div class="feedback-display-page volunteer-display-page">
    <div class="feedback-display-shell">
      <div v-if="error" class="feedback-display-state">
        <p class="editorial-eyebrow mb-3">Volunteer drive</p>
        <h1>Unable to prepare this display.</h1>
        <p>{{ error }}</p>
      </div>

      <template v-else>
        <header class="feedback-display-header">
          <p class="editorial-eyebrow">Volunteer drive</p>
          <h1>DevCongress December Mega Meetup</h1>
          <p class="feedback-display-lead">Scan the QR code to volunteer.</p>
        </header>

        <div class="feedback-display-card">
          <div class="feedback-display-grid">
            <div class="feedback-display-qr-wrap">
              <img v-if="qrCodeUrl" :src="qrCodeUrl" alt="QR code for the DevCongress December Mega Meetup volunteer form" class="feedback-display-qr">
              <p class="feedback-display-qr-caption">Camera open. Point at the code.</p>
            </div>
            <div class="feedback-display-copy">
              <p class="feedback-display-kicker">Volunteer intake</p>
              <div class="feedback-display-story">
                <h2>Help make the meetup happen.</h2>
                <p>Leave your name, email, X handle, and Slack name. We will reach out with the next steps.</p>
              </div>
              <dl class="feedback-display-meta">
                <div>
                  <dt>Event</dt>
                  <dd>December Mega Meetup</dd>
                </div>
                <div>
                  <dt>Sign-up</dt>
                  <dd>Volunteer form</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
