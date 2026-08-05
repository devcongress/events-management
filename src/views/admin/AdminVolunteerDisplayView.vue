<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import QRCode from 'qrcode';
import { DECEMBER_2026_VOLUNTEER_PUBLIC_PATH } from '@/src/annual-conference';

const qrCodeUrl = ref<string | null>(null);
const error = ref('');
const publicUrl = computed(() => `${window.location.origin}${DECEMBER_2026_VOLUNTEER_PUBLIC_PATH}`);

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
        <main class="volunteer-display-layout">
          <section class="volunteer-display-intro" aria-labelledby="volunteer-display-title">
            <p class="volunteer-display-context">DevCongress <span aria-hidden="true">/</span> December Mega Meetup <span aria-hidden="true">/</span> 2026</p>
            <h1 id="volunteer-display-title">Volunteer for December.</h1>
            <p class="volunteer-display-lead">A few good hands make the day feel effortless.</p>
            <p class="volunteer-display-support">Scan the code to tell us how you’d like to help. We’ll be in touch with the next step.</p>
          </section>

          <section class="volunteer-display-qr-stage" aria-label="Volunteer sign-up QR code">
            <p class="volunteer-display-qr-label"><span aria-hidden="true"></span> Volunteer sign-up</p>
            <Transition v-if="qrCodeUrl" name="volunteer-display-qr">
              <img
                :src="qrCodeUrl"
                alt="QR code for the DevCongress December Mega Meetup volunteer form"
                class="volunteer-display-qr"
              >
            </Transition>
            <div v-if="!qrCodeUrl" class="volunteer-display-qr-loading" aria-live="polite">Preparing your sign-up code…</div>
            <p class="volunteer-display-qr-caption">Open camera, scan code</p>
          </section>
        </main>
      </template>
    </div>
  </div>
</template>
