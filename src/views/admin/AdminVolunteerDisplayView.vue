<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import QRCode from 'qrcode';
import { VOLUNTEER_PUBLIC_PATH } from '@/src/annual-conference';
import { ensureAdminShortLink } from '@/src/lib/api';

const qrCodeUrl = ref<string | null>(null);
const error = ref('');
const publicUrl = computed(() => `${window.location.origin}${VOLUNTEER_PUBLIC_PATH}`);

onMounted(async () => {
  try {
    let qrDestination = publicUrl.value;
    try {
      const shortLink = await ensureAdminShortLink({ destination: 'volunteer_intake' });
      qrDestination = shortLink.url;
    } catch {
      // The canonical form remains scannable if short-link storage is unavailable.
    }
    qrCodeUrl.value = await QRCode.toDataURL(qrDestination, {
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
            <p class="volunteer-display-context">DevCongress <span aria-hidden="true">/</span> Volunteer team</p>
            <h1 id="volunteer-display-title">Volunteer with DevCongress.</h1>
            <p class="volunteer-display-lead">Help us create welcoming, well-run community events.</p>
            <p class="volunteer-display-support">Scan the code to join the volunteer list. We’ll contact you when there’s an opportunity to get involved.</p>
          </section>

          <section class="volunteer-display-qr-stage" aria-label="Volunteer sign-up QR code">
            <p class="volunteer-display-qr-label"><span aria-hidden="true"></span> Volunteer sign-up</p>
            <Transition v-if="qrCodeUrl" name="volunteer-display-qr">
              <img
                :src="qrCodeUrl"
                alt="QR code for the DevCongress volunteer form"
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
