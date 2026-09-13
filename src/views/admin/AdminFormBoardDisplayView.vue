<script setup lang="ts">
import '@fontsource/ibm-plex-mono/latin-600-italic.css';

import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import QRCode from 'qrcode';
import PresentationPeekFace from '@/src/components/PresentationPeekFace.vue';
import { adminPath } from '@/src/admin-routes';
import { ensureAdminShortLink, fetchJson } from '@/src/lib/api';
import { formsForMonth, presentationCopy, presentationMonth, type PresentationForm } from '@/src/lib/presentation-forms';

const route = useRoute();
const demo = route.query.demo === '1';
const logoPath = '/brand/dev-con-logo.png';
const speakerPhoto = '/presentation/community-speaker.jpg';
const presenterPhoto = '/presentation/community-presenter.jpg';
const loading = ref(true);
const error = ref('');
const cards = ref<Array<{ title: string; label: string; url: string; qr: string }>>([]);
const loadingCardCount = computed(() => {
  if (demo) return 3;

  const keys = new Set(String(route.query.forms ?? '').split(',').filter(Boolean));

  return Math.min(3, Math.max(1, keys.size));
});

async function load() {
  loading.value = true;
  error.value = '';
  cards.value = [];

  try {
    let links: Array<{ destination: PresentationForm['destination']; url: string }>;

    if (demo) {
      links = [
        { destination: 'event_feedback', url: 'https://example.invalid/feedback' },
        { destination: 'volunteer_intake', url: 'https://example.invalid/volunteer' },
        { destination: 'conference_cfp', url: 'https://example.invalid/speak' },
      ];
    } else {
      const month = typeof route.query.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(route.query.month) ? route.query.month : presentationMonth();
      const keys = [...new Set(String(route.query.forms ?? '').split(',').filter(Boolean))];
      const catalog = await fetchJson<{ forms: PresentationForm[] }>('/api/admin/presentation-forms', { credentials: 'include' });
      const available = formsForMonth(catalog.forms, month);
      const chosen = keys.map((key) => available.find((form) => form.key === key && form.available !== false));

      if (!keys.length || keys.length > 3 || chosen.some((form) => !form)) {
        throw new Error('A selected form is no longer available. Return to setup and check your selection.');
      }

      links = await Promise.all(chosen.map(async (form) => {
        const link = await ensureAdminShortLink({
          destination: form!.destination,
          ...(form!.event_id ? { event_id: form!.event_id } : {}),
          ...(form!.conference_year ? { conference_year: form!.conference_year } : {}),
        });

        return { destination: form!.destination, url: link.url };
      }));
    }

    cards.value = await Promise.all(links.map(async (link) => ({
      ...presentationCopy[link.destination],
      url: link.url,
      qr: await QRCode.toDataURL(link.url, { width: 960, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }),
    })));
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to prepare this board.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <main class="audience-board">
    <span class="background-mark" aria-hidden="true">✳</span>
    <div class="board-masthead">
      <img :src="logoPath" alt="DevCongress" />
      <span class="welcome-note">Good to have you here.</span>
    </div>
    <header class="audience-heading">
      <div class="hero-copy">
        <div class="headline-row">
          <h1>Help shape<br />what’s next.</h1>
          <PresentationPeekFace />
        </div>
        <p class="scan-instruction">Pick a form. Scan a code. Get involved.</p>
      </div>
      <div class="community-photos" aria-hidden="true">
        <img :src="speakerPhoto" class="speaker-photo" alt="" width="728" height="1000" />
        <img :src="presenterPhoto" class="presenter-photo" alt="" width="703" height="1000" />
        <span class="photo-star">✳</span>
      </div>
    </header>

    <section v-if="loading" class="audience-grid" :style="{ '--card-count': loadingCardCount }" aria-busy="true" aria-label="Loading form QR codes">
      <span class="sr-only" role="status">Preparing your board…</span>
      <article v-for="index in loadingCardCount" :key="index" class="audience-card" aria-hidden="true">
        <div class="card-heading">
          <h2><span class="board-skeleton skeleton-heading" /></h2>
          <p><span class="board-skeleton skeleton-description" /></p>
        </div>
        <div class="code-frame board-skeleton" />
        <span class="card-url"><span class="board-skeleton skeleton-url" /></span>
      </article>
    </section>
    <div v-else-if="error" class="audience-error" role="alert"><p>{{ error }}</p><button class="editorial-secondary-action" @click="load">Retry</button><a :href="adminPath('present-forms')">Return to setup</a></div>
    <section v-else class="audience-grid" :style="{ '--card-count': cards.length }" aria-label="Forms to scan">
      <article v-for="card in cards" :key="card.url" class="audience-card">
        <div class="card-heading">
          <h2>{{ card.title }}</h2>
          <p>{{ card.label }}</p>
        </div>
        <div class="code-frame"><img :src="card.qr" :alt="`QR code for ${card.label}`" /></div>
        <a :href="card.url" target="_blank" rel="noopener noreferrer" class="card-url">{{ card.url.replace(/^https?:\/\//, '') }}</a>
      </article>
    </section>
    <footer v-if="demo"><span>Demo · sample codes only</span> — these QR codes do not open live forms.</footer>
  </main>
</template>

<style scoped>
.audience-board {
  position: relative;
  isolation: isolate;
  overflow: clip;
  min-height: 100dvh;
  background: #f5f2e8;
  color: #111;
  padding: clamp(24px, 2.8vw, 54px) clamp(28px, 3.6vw, 70px);
}

.background-mark {
  position: absolute;
  z-index: -1;
  pointer-events: none;
  right: -70px;
  bottom: -150px;
  color: #ed008c;
  opacity: .045;
  font-size: clamp(420px, 45vw, 760px);
  line-height: 1;
  transform: rotate(15deg);
}

.board-masthead {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
}

.board-masthead img {
  width: clamp(175px, 15.2vw, 292px);
}

.welcome-note {
  background: #f9ed32;
  padding: 4px 10px;
  font: 600 clamp(12px, 1.17vw, 20px) var(--font-mono), monospace;
  text-transform: uppercase;
}

.audience-heading {
  display: grid;
  grid-template-columns: 1.35fr 1fr;
  gap: 24px;
  height: clamp(226px, 19.5vw, 374px);
  margin-top: 20px;
}

h1 {
  font-size: clamp(40px, 5.23vw, 100px);
  line-height: .98;
  font-weight: 700;
  letter-spacing: -.045em;
}

.scan-instruction {
  margin-top: 18px;
  font-size: clamp(14px, 1.33vw, 24px);
  line-height: 1.5;
}

.headline-row {
  display: flex;
  align-items: flex-end;
  gap: clamp(12px, 1.5vw, 28px);
}

.headline-row h1 {
  flex-shrink: 0;
}

.community-photos {
  position: relative;
  min-width: 0;
}

.community-photos img {
  position: absolute;
  object-fit: cover;
  background: white;
}

.speaker-photo {
  width: 51%;
  height: 88%;
  left: 9%;
  top: 3%;
  border: clamp(5px, .62vw, 12px) solid white;
  object-position: center 30%;
  transform: rotate(-5deg);
}

.presenter-photo {
  width: 40%;
  height: 78%;
  right: 0;
  top: 14%;
  border: clamp(5px, .55vw, 11px) solid white;
  object-position: center 25%;
  transform: rotate(6deg);
}

.photo-star {
  position: absolute;
  right: 5%;
  top: -5%;
  color: #ed008c;
  font-size: clamp(60px, 7vw, 132px);
  line-height: 1;
}

.audience-grid {
  display: grid;
  grid-template-columns: repeat(var(--card-count), minmax(0, 1fr));
  gap: clamp(20px, 1.88vw, 36px);
}

.audience-card {
  min-width: 0;
  padding-top: 15px;
  border-top: 1px solid #d2cfc5;
  display: flex;
  flex-direction: column;
}

.card-heading {
  min-height: 60px;
  text-align: center;
}

h2 {
  font-size: clamp(22px, 2.1vw, 40px);
  font-weight: 700;
  letter-spacing: -.03em;
  line-height: 1.2;
}

.card-heading p {
  font-size: clamp(13px, 1.17vw, 22px);
  margin-top: 6px;
}

.code-frame {
  width: min(100%, 28.3vh, 400px);
  aspect-ratio: 1;
  margin: 12px auto 8px;
  background: white;
}

.code-frame img {
  width: 100%;
  height: 100%;
}

.card-url {
  color: #c90076;
  text-align: center;
  overflow-wrap: anywhere;
  font: 600 clamp(13px, 1.05vw, 20px) var(--font-mono), monospace;
  font-style: italic;
}

footer {
  margin-top: 32px;
  color: #595750;
  font: 12px var(--font-mono), monospace;
}

.board-skeleton {
  background: #e5e1d7;
}

.skeleton-heading, .skeleton-description, .skeleton-url {
  display: block;
  margin-inline: auto;
  border-radius: 4px;
}

.skeleton-heading {
  width: 70%;
  height: 1.2em;
}

.skeleton-description {
  width: 60%;
  height: 1.5em;
}

.skeleton-url {
  width: min(80%, 28ch);
  height: 1.5em;
}

.audience-error {
  padding: 48px;
  border: 1px solid #d9d6cd;
}

.audience-error a, .audience-error button {
  display: inline-block;
  margin: 20px 20px 0 0;
}

@media (max-height: 650px) {
  .audience-heading {
    height: 190px;
  }

  h1 {
    font-size: 48px;
  }

  .code-frame {
    width: min(100%, 26vh);
  }

  footer {
    margin-top: 16px;
  }
}
</style>
