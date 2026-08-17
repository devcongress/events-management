<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import {
  fetchAdminEmailPreviews,
  queryKeys,
  type AdminEmailPreview,
} from '@/src/lib/api';

type PreviewMode = 'html' | 'text';
type PreviewViewport = 'desktop' | 'mobile';

const CATEGORY_ORDER: AdminEmailPreview['category'][] = [
  'Registration',
  'Event updates',
  'Community listings',
  'Speaker archive',
];

const previewQuery = useQuery({
  queryKey: queryKeys.adminEmailPreviews,
  queryFn: fetchAdminEmailPreviews,
});
const selectedPreviewId = ref('registration_confirmed');
const previewMode = ref<PreviewMode>('html');
const previewViewport = ref<PreviewViewport>('desktop');

const previews = computed(() => previewQuery.data.value?.previews ?? []);
const plannedScenarios = computed(() => previewQuery.data.value?.planned ?? []);
const selectedPreview = computed(() => (
  previews.value.find((preview) => preview.id === selectedPreviewId.value)
  ?? previews.value[0]
  ?? null
));
const groupedPreviews = computed(() => CATEGORY_ORDER.map((category) => ({
  category,
  previews: previews.value.filter((preview) => preview.category === category),
})).filter((group) => group.previews.length > 0));

watch(previews, (nextPreviews) => {
  if (nextPreviews.length > 0 && !nextPreviews.some((preview) => preview.id === selectedPreviewId.value)) {
    selectedPreviewId.value = nextPreviews[0].id;
  }
});

function selectPreview(previewId: string) {
  selectedPreviewId.value = previewId;
}
</script>

<template>
  <div class="email-preview-page">
    <header class="email-preview-hero">
      <div class="email-preview-hero__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M3.75 6.75h16.5v10.5H3.75V6.75Z" />
          <path d="m4.5 7.5 7.5 5.25 7.5-5.25" />
        </svg>
      </div>
      <div class="email-preview-hero__copy">
        <p class="email-preview-kicker">Email operations / recipient experience</p>
        <h1>Email previews</h1>
        <p>Inspect every email EMS currently sends, rendered by the same templates used for real recipients.</p>
      </div>
      <div class="email-preview-live-note">
        <span aria-hidden="true" />
        Read only · nothing is sent
      </div>
    </header>

    <section v-if="previewQuery.isPending.value" class="email-preview-state" aria-live="polite">
      <div class="email-preview-state__pulse" aria-hidden="true" />
      <p>Rendering the live email catalog…</p>
    </section>

    <section v-else-if="previewQuery.isError.value" class="email-preview-state email-preview-state--error" role="alert">
      <div>
        <p class="email-preview-kicker">Preview unavailable</p>
        <h2>The email catalog could not be loaded.</h2>
        <p>{{ previewQuery.error.value instanceof Error ? previewQuery.error.value.message : 'Try the request again.' }}</p>
      </div>
      <button type="button" @click="previewQuery.refetch()">Try again</button>
    </section>

    <div v-else class="email-preview-workbench">
      <aside class="email-preview-catalog" aria-label="Email scenarios">
        <div class="email-preview-catalog__heading">
          <div>
            <span class="email-preview-kicker">Live templates</span>
            <strong>{{ previews.length }} scenarios</strong>
          </div>
          <span class="email-preview-catalog__count">{{ previews.length }}</span>
        </div>

        <div class="email-preview-catalog__groups">
          <section v-for="group in groupedPreviews" :key="group.category" class="email-preview-group">
            <h2>{{ group.category }}</h2>
            <button
              v-for="preview in group.previews"
              :key="preview.id"
              type="button"
              class="email-preview-scenario"
              :class="{ 'email-preview-scenario--active': selectedPreview?.id === preview.id }"
              :aria-pressed="selectedPreview?.id === preview.id"
              @click="selectPreview(preview.id)"
            >
              <span class="email-preview-scenario__mark" aria-hidden="true" />
              <span>
                <strong>{{ preview.label }}</strong>
                <small>{{ preview.recipient }}</small>
              </span>
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="m7.5 4.5 5 5-5 5" />
              </svg>
            </button>
          </section>
        </div>

        <details v-if="plannedScenarios.length" class="email-preview-planned">
          <summary>
            <span>
              <strong>Not active yet</strong>
              <small>{{ plannedScenarios.length }} planned conference emails</small>
            </span>
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg>
          </summary>
          <ul>
            <li v-for="scenario in plannedScenarios" :key="scenario.id">
              <strong>{{ scenario.recipient }}</strong>
              <span>{{ scenario.subject_pattern }}</span>
            </li>
          </ul>
          <p>These are recorded in the product plan, but EMS does not send them today, so there is no live template to preview.</p>
        </details>
      </aside>

      <section v-if="selectedPreview" class="email-preview-inspector" aria-live="polite">
        <header class="email-preview-inspector__header">
          <div>
            <p class="email-preview-kicker">{{ selectedPreview.category }}</p>
            <h2>{{ selectedPreview.label }}</h2>
            <p>{{ selectedPreview.trigger }}</p>
          </div>
          <span class="email-preview-recipient">{{ selectedPreview.recipient }}</span>
        </header>

        <dl class="email-preview-envelope">
          <div><dt>From</dt><dd>{{ selectedPreview.from }}</dd></div>
          <div><dt>To</dt><dd>{{ selectedPreview.to }}</dd></div>
          <div><dt>Subject</dt><dd>{{ selectedPreview.subject }}</dd></div>
        </dl>

        <div class="email-preview-toolbar" aria-label="Preview controls">
          <div class="email-preview-segment" aria-label="Email format">
            <button
              type="button"
              :class="{ 'is-active': previewMode === 'html' }"
              :aria-pressed="previewMode === 'html'"
              @click="previewMode = 'html'"
            >
              Visual
            </button>
            <button
              type="button"
              :class="{ 'is-active': previewMode === 'text' }"
              :aria-pressed="previewMode === 'text'"
              @click="previewMode = 'text'"
            >
              Plain text
            </button>
          </div>

          <div v-if="previewMode === 'html'" class="email-preview-segment" aria-label="Preview width">
            <button
              type="button"
              class="email-preview-viewport-button"
              :class="{ 'is-active': previewViewport === 'desktop' }"
              :aria-pressed="previewViewport === 'desktop'"
              aria-label="Desktop email preview"
              @click="previewViewport = 'desktop'"
            >
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="10" rx="1.5" /><path d="M7 16.5h6M10 13.5v3" /></svg>
              Desktop
            </button>
            <button
              type="button"
              class="email-preview-viewport-button"
              :class="{ 'is-active': previewViewport === 'mobile' }"
              :aria-pressed="previewViewport === 'mobile'"
              aria-label="Mobile email preview"
              @click="previewViewport = 'mobile'"
            >
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="6" y="2" width="8" height="16" rx="2" /><path d="M9 15.5h2" /></svg>
              Mobile
            </button>
          </div>
        </div>

        <div class="email-preview-stage" :class="`email-preview-stage--${previewViewport}`">
          <Transition name="email-preview-swap" mode="out-in">
            <iframe
              v-if="previewMode === 'html'"
              :key="`${selectedPreview.id}-${previewViewport}`"
              class="email-preview-frame"
              :class="`email-preview-frame--${previewViewport}`"
              :src="`/api/admin/email-previews/${encodeURIComponent(selectedPreview.id)}/html`"
              :title="`${selectedPreview.label} rendered email`"
              sandbox=""
            />
            <pre v-else :key="`${selectedPreview.id}-text`" class="email-preview-text">{{ selectedPreview.text }}</pre>
          </Transition>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.email-preview-page {
  --preview-bg: #1c1c1c;
  --preview-panel: #242424;
  --preview-panel-raised: #2a2a2a;
  --preview-border: #3b3b3b;
  --preview-text: #e5e5e5;
  --preview-muted: #a1a1a1;
  --preview-pink: #ff4f9a;
  --preview-yellow: #f5e642;
  overflow: hidden;
  border: 1px solid #343434;
  border-radius: 12px;
  background: var(--preview-bg);
  color: var(--preview-text);
  font-family: var(--font-sans), Inter, sans-serif;
}

.email-preview-hero {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 1.25rem;
  border-bottom: 1px solid var(--preview-border);
  padding: 1.75rem clamp(1rem, 3vw, 2.5rem);
  background: #202020;
}

.email-preview-hero__icon {
  display: grid;
  width: 3.25rem;
  height: 3.25rem;
  place-items: center;
  border: 1px solid #515151;
  border-radius: 12px;
  background: #292929;
  color: var(--preview-yellow);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.06);
}

.email-preview-hero__icon svg {
  width: 1.65rem;
  stroke: currentColor;
  stroke-width: 1.65;
}

.email-preview-hero__copy h1 {
  margin: 0.2rem 0 0;
  font-size: clamp(1.7rem, 3vw, 2.35rem);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.025em;
}

.email-preview-hero__copy > p:last-child {
  max-width: 48rem;
  margin: 0.55rem 0 0;
  color: var(--preview-muted);
  font-size: 0.92rem;
  line-height: 1.55;
}

.email-preview-kicker {
  margin: 0;
  color: var(--preview-muted);
  font-family: var(--font-mono), monospace;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.email-preview-live-note {
  display: flex;
  min-height: 2.25rem;
  align-items: center;
  gap: 0.55rem;
  border: 1px solid var(--preview-border);
  border-radius: 999px;
  padding: 0.45rem 0.75rem;
  color: #c6c6c6;
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
}

.email-preview-live-note span {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: #61d689;
  box-shadow: 0 0 0 3px rgb(97 214 137 / 0.13);
}

.email-preview-workbench {
  display: grid;
  min-height: 46rem;
  grid-template-columns: minmax(15rem, 19rem) minmax(0, 1fr);
}

.email-preview-catalog {
  border-right: 1px solid var(--preview-border);
  background: #191919;
}

.email-preview-catalog__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--preview-border);
  padding: 1.15rem 1rem;
}

.email-preview-catalog__heading strong {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.94rem;
}

.email-preview-catalog__count {
  display: grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  border: 1px solid #4b4b4b;
  border-radius: 8px;
  color: var(--preview-yellow);
  font-family: var(--font-mono), monospace;
  font-size: 0.72rem;
  font-weight: 700;
}

.email-preview-catalog__groups {
  padding: 0.35rem 0.65rem 0.8rem;
}

.email-preview-group {
  padding-top: 0.9rem;
}

.email-preview-group h2 {
  margin: 0 0 0.4rem;
  padding: 0 0.55rem;
  color: #777;
  font-family: var(--font-mono), monospace;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.email-preview-scenario {
  display: grid;
  width: 100%;
  min-height: 3.65rem;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.75rem;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 0.65rem 0.7rem;
  color: var(--preview-muted);
  text-align: left;
  transition: color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), transform 100ms cubic-bezier(0.4, 0, 0.2, 1);
}

.email-preview-scenario:active { transform: scale(0.97); }
.email-preview-scenario:focus-visible { outline: 2px solid var(--preview-yellow); outline-offset: 2px; }

.email-preview-scenario__mark {
  width: 0.45rem;
  height: 0.45rem;
  border: 1px solid #656565;
  border-radius: 50%;
}

.email-preview-scenario strong,
.email-preview-scenario small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.email-preview-scenario strong { color: #cfcfcf; font-size: 0.79rem; font-weight: 600; }
.email-preview-scenario small { margin-top: 0.2rem; color: #747474; font-size: 0.68rem; }
.email-preview-scenario > svg { width: 1rem; stroke: currentColor; stroke-width: 1.5; }

.email-preview-scenario--active {
  border-color: #4b4b4b;
  background: #292929;
  color: var(--preview-yellow);
  box-shadow: inset 3px 0 0 var(--preview-pink);
}

.email-preview-scenario--active .email-preview-scenario__mark { border-color: var(--preview-pink); background: var(--preview-pink); }
.email-preview-scenario--active strong { color: var(--preview-text); }
.email-preview-scenario--active small { color: var(--preview-muted); }

.email-preview-planned {
  border-top: 1px solid var(--preview-border);
  padding: 0.85rem 1rem 1rem;
}

.email-preview-planned summary {
  display: flex;
  min-height: 2.75rem;
  cursor: pointer;
  list-style: none;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-radius: 8px;
  color: #8d8d8d;
}

.email-preview-planned summary::-webkit-details-marker { display: none; }
.email-preview-planned summary strong,
.email-preview-planned summary small { display: block; }
.email-preview-planned summary strong { color: #b9b9b9; font-size: 0.78rem; }
.email-preview-planned summary small { margin-top: 0.15rem; font-size: 0.66rem; }
.email-preview-planned summary svg { width: 1rem; stroke: currentColor; stroke-width: 1.5; transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1); }
.email-preview-planned[open] summary svg { transform: rotate(180deg); }
.email-preview-planned ul { margin: 0.6rem 0 0; padding: 0; list-style: none; }
.email-preview-planned li { border-top: 1px solid #303030; padding: 0.7rem 0; }
.email-preview-planned li strong,
.email-preview-planned li span { display: block; }
.email-preview-planned li strong { color: #aeaeae; font-size: 0.69rem; text-transform: capitalize; }
.email-preview-planned li span { margin-top: 0.25rem; color: #686868; font-family: var(--font-mono), monospace; font-size: 0.58rem; line-height: 1.45; }
.email-preview-planned > p { margin: 0.6rem 0 0; color: #747474; font-size: 0.68rem; line-height: 1.5; }

.email-preview-inspector {
  min-width: 0;
  padding: clamp(1rem, 2.5vw, 2rem);
}

.email-preview-inspector__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.email-preview-inspector__header h2 {
  margin: 0.3rem 0 0;
  color: var(--preview-text);
  font-size: clamp(1.4rem, 2.5vw, 2rem);
  font-weight: 700;
  letter-spacing: -0.02em;
}

.email-preview-inspector__header > div > p:last-child {
  max-width: 48rem;
  margin: 0.55rem 0 0;
  color: var(--preview-muted);
  font-size: 0.82rem;
  line-height: 1.55;
}

.email-preview-recipient {
  flex: 0 0 auto;
  border: 1px solid #4b4b4b;
  border-radius: 999px;
  padding: 0.45rem 0.7rem;
  color: #c4c4c4;
  font-size: 0.68rem;
  font-weight: 600;
}

.email-preview-envelope {
  display: grid;
  margin: 1.25rem 0 0;
  border: 1px solid var(--preview-border);
  border-radius: 8px;
  background: var(--preview-panel);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.025);
}

.email-preview-envelope > div {
  display: grid;
  min-width: 0;
  grid-template-columns: 4rem minmax(0, 1fr);
  gap: 0.75rem;
  border-bottom: 1px solid #353535;
  padding: 0.7rem 0.9rem;
}

.email-preview-envelope > div:last-child { border-bottom: 0; }
.email-preview-envelope dt { color: #737373; font-family: var(--font-mono), monospace; font-size: 0.61rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.email-preview-envelope dd { min-width: 0; margin: 0; overflow-wrap: anywhere; color: #d0d0d0; font-size: 0.76rem; line-height: 1.45; }
.email-preview-envelope > div:last-child dd { color: var(--preview-text); font-weight: 600; }

.email-preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 1rem;
}

.email-preview-segment {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  border: 1px solid var(--preview-border);
  border-radius: 8px;
  background: #171717;
  padding: 0.2rem;
}

.email-preview-segment button {
  display: flex;
  min-height: 2.25rem;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  border-radius: 6px;
  padding: 0.4rem 0.7rem;
  color: #858585;
  font-size: 0.68rem;
  font-weight: 600;
  transition: color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), transform 100ms cubic-bezier(0.4, 0, 0.2, 1);
}

.email-preview-segment button:active { transform: scale(0.97); }
.email-preview-segment button:focus-visible { outline: 2px solid var(--preview-yellow); outline-offset: 2px; }
.email-preview-segment button.is-active { background: #333; color: var(--preview-text); box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.06); }
.email-preview-segment button svg { width: 0.95rem; stroke: currentColor; stroke-width: 1.5; }

.email-preview-stage {
  display: flex;
  min-height: 46rem;
  align-items: flex-start;
  justify-content: center;
  margin-top: 1rem;
  overflow: auto;
  border: 1px solid var(--preview-border);
  border-radius: 12px;
  background-color: #121212;
  background-image: linear-gradient(45deg, #181818 25%, transparent 25%), linear-gradient(-45deg, #181818 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #181818 75%), linear-gradient(-45deg, transparent 75%, #181818 75%);
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  background-size: 16px 16px;
  padding: clamp(0.65rem, 2vw, 1.5rem);
}

.email-preview-frame {
  display: block;
  height: 44rem;
  border: 0;
  border-radius: 8px;
  background: #f5f2e8;
  box-shadow: 0 18px 55px rgb(0 0 0 / 0.38);
}

.email-preview-frame--desktop { width: min(100%, 48rem); }
.email-preview-frame--mobile { width: min(100%, 24.375rem); }

.email-preview-text {
  width: min(100%, 48rem);
  min-height: 42rem;
  margin: 0;
  border-radius: 8px;
  background: #f7f4ea;
  padding: clamp(1.2rem, 3vw, 2.25rem);
  color: #252525;
  font-family: var(--font-mono), monospace;
  font-size: 0.76rem;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  box-shadow: 0 18px 55px rgb(0 0 0 / 0.38);
}

.email-preview-state {
  display: flex;
  min-height: 30rem;
  align-items: center;
  justify-content: center;
  gap: 0.85rem;
  padding: 2rem;
  color: var(--preview-muted);
}

.email-preview-state__pulse {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  background: var(--preview-yellow);
}

.email-preview-state--error {
  flex-direction: column;
  align-items: flex-start;
  margin: clamp(1rem, 3vw, 2.5rem);
  border: 1px solid #663747;
  border-radius: 12px;
  background: #2b2024;
}

.email-preview-state--error h2 { margin: 0.4rem 0 0; font-size: 1.3rem; }
.email-preview-state--error div > p:last-child { color: var(--preview-muted); }
.email-preview-state--error button { min-height: 2.75rem; border-radius: 8px; background: var(--preview-yellow); padding: 0.6rem 1rem; color: #111; font-weight: 700; transition: transform 100ms cubic-bezier(0.4, 0, 0.2, 1); }
.email-preview-state--error button:active { transform: scale(0.97); }

.email-preview-swap-enter-active,
.email-preview-swap-leave-active { transition: opacity 160ms cubic-bezier(0.16, 1, 0.3, 1), transform 180ms cubic-bezier(0.16, 1, 0.3, 1); }
.email-preview-swap-enter-from { opacity: 0; transform: translate3d(0.5rem, 0, 0); }
.email-preview-swap-leave-to { opacity: 0; transform: translate3d(-0.35rem, 0, 0); }

@media (hover: hover) and (pointer: fine) {
  .email-preview-scenario:hover:not(.email-preview-scenario--active) { border-color: #343434; background: #222; color: #bdbdbd; }
  .email-preview-segment button:hover:not(.is-active) { color: #c1c1c1; }
  .email-preview-planned summary:hover { color: #bcbcbc; }
}

@media (max-width: 880px) {
  .email-preview-hero { grid-template-columns: auto minmax(0, 1fr); }
  .email-preview-live-note { grid-column: 1 / -1; justify-self: start; }
  .email-preview-workbench { grid-template-columns: 1fr; }
  .email-preview-catalog { border-right: 0; border-bottom: 1px solid var(--preview-border); }
  .email-preview-catalog__groups { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 0.5rem; }
}

@media (max-width: 560px) {
  .email-preview-hero { align-items: start; gap: 0.85rem; padding-block: 1.25rem; }
  .email-preview-hero__icon { width: 2.75rem; height: 2.75rem; border-radius: 8px; }
  .email-preview-hero__copy > p:last-child { font-size: 0.82rem; }
  .email-preview-catalog__groups { grid-template-columns: 1fr; }
  .email-preview-inspector__header { display: block; }
  .email-preview-recipient { display: inline-flex; margin-top: 0.8rem; }
  .email-preview-toolbar { align-items: stretch; flex-direction: column; }
  .email-preview-segment { align-self: flex-start; }
  .email-preview-stage { min-height: 39rem; padding: 0.5rem; }
  .email-preview-frame { height: 38rem; }
  .email-preview-envelope > div { grid-template-columns: 3.25rem minmax(0, 1fr); }
}

@media (prefers-reduced-motion: reduce) {
  .email-preview-scenario,
  .email-preview-segment button,
  .email-preview-planned summary svg,
  .email-preview-state--error button,
  .email-preview-swap-enter-active,
  .email-preview-swap-leave-active { transition: none; }
}
</style>
