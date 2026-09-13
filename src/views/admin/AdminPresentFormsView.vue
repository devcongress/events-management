<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import QRCode from 'qrcode';
import AppDropdown from '@/src/components/AppDropdown.vue';
import { adminPath } from '@/src/admin-routes';
import { ensureAdminShortLink, fetchJson } from '@/src/lib/api';
import { defaultPresentationKeys, formsForMonth, presentationCopy, presentationMonth, type PresentationForm } from '@/src/lib/presentation-forms';

const month = ref(presentationMonth());
const monthOptions = computed(() => {
  const current = new Date();
  const months = new Set(forms.value.flatMap((form) => form.event_date ? [presentationMonth(new Date(form.event_date))] : []));

  for (let offset = -12; offset <= 12; offset++) {
    months.add(presentationMonth(new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + offset, 1))));
  }

  return [...months].sort().map((value) => ({
    value,
    label: new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'Africa/Accra' }).format(new Date(`${value}-01T12:00:00Z`)),
  }));
});
const forms = ref<PresentationForm[]>([]);
const selected = ref<string[]>([]);
const loading = ref(true);
const error = ref('');
const prepared = ref<Record<string, { url: string; qr: string }>>({});
const preparing = ref(false);
let generation = 0;

const available = computed(() => {
  const choices = formsForMonth(forms.value, month.value);

  if (!choices.some((form) => form.destination === 'event_feedback')) {
    choices.unshift({ key: 'feedback-unavailable', destination: 'event_feedback', available: false, event_id: null, conference_year: null, label: 'No monthly meetup feedback available', event_date: null, series_type: 'monthly' });
  }

  const order = ['event_feedback', 'volunteer_intake', 'conference_cfp'];

  return choices.sort((a, b) => order.indexOf(a.destination) - order.indexOf(b.destination));
});
const tiles = computed(() => selected.value.flatMap((key) => {
  const form = available.value.find((item) => item.key === key && item.available !== false);

  return form ? [{ ...form, ...presentationCopy[form.destination], detail: form.label, ...prepared.value[key] }] : [];
}));
const canPresent = computed(() => !loading.value && !preparing.value && tiles.value.length > 0 && tiles.value.every((tile) => tile.qr));
const feedbackChoices = computed(() => available.value.filter((form) => form.destination === 'event_feedback' && form.series_type === 'monthly' && form.available !== false));

async function load() {
  loading.value = true;
  error.value = '';

  try {
    const result = await fetchJson<{ forms: PresentationForm[] }>('/api/admin/presentation-forms', { credentials: 'include' });

    forms.value = result.forms;
    selected.value = defaultPresentationKeys(result.forms, month.value);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to load forms. Please retry.';
  } finally {
    loading.value = false;
  }
}

async function prepare() {
  const current = ++generation;

  preparing.value = true;
  error.value = '';
  try {
    const entries = await Promise.all(tiles.value.map(async (form) => {
      const link = await ensureAdminShortLink({
        destination: form.destination,
        ...(form.event_id ? { event_id: form.event_id } : {}),
        ...(form.conference_year ? { conference_year: form.conference_year } : {}),
      });
      const qr = await QRCode.toDataURL(link.url, {
        width: 720, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' },
      });

      return [form.key, { url: link.url, qr }] as const;
    }));

    if (current === generation) prepared.value = Object.fromEntries(entries);
  } catch (cause) {
    if (current !== generation) return;

    prepared.value = {};
    error.value = cause instanceof Error ? cause.message : 'Unable to prepare QR codes. Please retry.';
  } finally {
    if (current === generation) preparing.value = false;
  }
}

watch(selected, prepare);
watch(month, () => {
  selected.value = defaultPresentationKeys(forms.value, month.value);
});

function present() {
  if (!canPresent.value) return;

  const query = new URLSearchParams({ month: month.value, forms: selected.value.join(',') });

  window.open(`${adminPath('present-forms/display')}?${query}`, '_blank', 'noopener,noreferrer');
}

onMounted(load);
onBeforeUnmount(() => {
  generation++;
});
</script>

<template>
  <main class="editorial-page presentation-setup">
    <div class="editorial-wrap">
      <section class="board-controls" aria-label="Presentation setup">
        <div class="control-heading mb-8 border-b-2 border-dc-ink pb-6">
          <div>
            <p class="editorial-eyebrow">Audience screen</p>
            <h1 class="editorial-title">Present forms</h1>
            <p class="editorial-subtitle">Choose the forms to share on the big screen.</p>
          </div>
          <button :disabled="!canPresent" class="editorial-action px-6 py-3" @click="present">Present ↗</button>
        </div>
        <div class="editorial-panel selection-panel">
          <div class="selection-controls">
            <div class="w-64"><AppDropdown :model-value="month" label="Meetup month" :options="monthOptions" @update:model-value="month = String($event)" /></div>
            <div class="selection-summary"><span class="editorial-eyebrow">On your screen</span><strong>{{ selected.length }} <span>of 3 selected</span></strong></div>
          </div>
          <p class="selection-help">Choose what your audience can scan. Changing the month restores the defaults.</p>
          <a :href="`${adminPath('present-forms/display')}?demo=1`" target="_blank" rel="noopener noreferrer" class="mb-4 inline-flex font-mono text-xs font-semibold uppercase text-dc-pink underline underline-offset-4">Preview three sample codes ↗</a>
          <p v-if="loading" role="status">Loading available forms…</p>
          <fieldset v-else>
            <legend class="sr-only">Forms to present</legend>
            <label v-for="form in available" :key="form.key" class="form-choice" :class="{ 'form-choice--selected': selected.includes(form.key) }">
              <span class="choice-topline">
                <span class="choice-state">{{ form.available === false ? 'Not open yet' : selected.includes(form.key) ? 'Selected' : 'Not selected' }}</span>
                <input v-model="selected" type="checkbox" :value="form.key" :disabled="form.available === false || (selected.length >= 3 && !selected.includes(form.key))" />
              </span>
              <span class="choice-title">{{ presentationCopy[form.destination].label }}</span>
              <small>{{ form.label }}</small>
            </label>
          </fieldset>
          <p v-if="!loading && feedbackChoices.length !== 1" class="notice">{{ feedbackChoices.length ? 'Multiple meetups have feedback open this month. Select the one you are presenting.' : 'No monthly meetup feedback is open for this month. Open its feedback form first, then refresh this board.' }}</p>
          <p v-if="!loading && !available.some(form => form.destination === 'conference_cfp')" class="notice">Conference speaker applications are not open. Only available forms can be presented.</p>
          <div v-if="error" role="alert">{{ error }} <button class="editorial-secondary-action px-4 py-2" @click="forms.length ? prepare() : load()">Retry</button></div>
          <p v-if="preparing" role="status">Preparing your short links and QR codes…</p>
        </div>
      </section>

      <div class="mb-5 flex items-center justify-between">
        <h2 class="editorial-eyebrow">Board preview</h2>
        <span class="font-mono text-xs uppercase text-dc-gray">{{ tiles.length }} / 3 forms selected</span>
      </div>

      <div v-if="tiles.length" class="qr-grid" :class="`tiles-${tiles.length}`" :aria-busy="preparing">
        <article v-for="(tile, index) in tiles" :key="tile.key" class="qr-tile">
          <div class="tile-copy">
            <span class="tile-number">0{{ index + 1 }}</span>
            <div><h2>{{ tile.title }}</h2><p>{{ tile.label }}</p><small v-if="tile.event_id || tile.conference_year">{{ tile.detail }}</small></div>
          </div>
          <div class="qr-image">
            <img v-if="tile.qr && !preparing" :src="tile.qr" :alt="`QR code for ${tile.label}`" />
            <div v-else class="qr-placeholder" aria-label="Preparing QR code"></div>
          </div>
          <a v-if="tile.url && !preparing" :href="tile.url" target="_blank" rel="noopener noreferrer" class="short-link">{{ tile.url.replace(/^https?:\/\//, '') }}</a>
        </article>
      </div>
      <p v-else-if="!loading" class="empty-board">Choose a form above to build your board.</p>
    </div>
  </main>
</template>

<style scoped>
.forms-board {
  min-height: 100dvh;
  padding: 24px clamp(20px, 4vw, 72px) 40px;
  background: #f5f2e8;
  color: #111;
}
.board-controls {
  margin-bottom: 32px;
}
.control-heading, .selection-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.selection-controls {
  justify-content: flex-start;
  margin: 0 0 24px;
}
.selection-controls p, .notice {
  font-size: 13px;
  color: #595750;
}
fieldset {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.selection-panel {
  padding: 24px;
}

.selection-panel .selection-controls {
  justify-content: space-between;
  margin-bottom: 16px;
}

.selection-summary {
  text-align: right;
}

.selection-summary strong {
  display: block;
  font-size: 28px;
}

.selection-summary strong span {
  color: #595750;
  font-size: 15px;
  font-weight: 500;
}

.selection-help {
  padding-top: 18px;
  margin-bottom: 18px;
  border-top: 1px solid #dedbd3;
  font-size: 14px;
  color: #595750;
}

.form-choice {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding: 20px;
  border: 2px solid #dedbd3;
  border-radius: 8px;
  cursor: pointer;
}

.choice-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.choice-state {
  font-family: var(--font-mono), monospace;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.choice-title {
  font-size: 18px;
  line-height: 1.35;
  font-weight: 600;
}

.form-choice--selected .choice-state {
  color: #b90068;
}

.form-choice:focus-within {
  outline: 3px solid #ed008c;
  outline-offset: 3px;
}
.form-choice small {
  display: block;
  color: #595750;
}
.form-choice--selected {
  border-color: #111;
  background: #fffde6;
}

.form-choice:has(input:disabled) {
  color: #77746e;
  background: #f5f2e8;
  cursor: not-allowed;
}
input[type='checkbox'] {
  width: 20px;
  height: 20px;
  accent-color: #ed008c;
}
.exit-button {
  padding: 10px 16px;
  border: 1px solid #111;
  border-radius: 8px;
  font-weight: 600;
  transition: transform 120ms cubic-bezier(0.4, 0, 0.2, 1);
}
.exit-button:active {
  transform: scale(.97);
}
button:disabled {
  opacity: .45;
  cursor: not-allowed;
}
.notice {
  margin-top: 12px;
}
.board-heading {
  text-align: center;
  margin-bottom: 32px;
}
.board-logo {
  width: 180px;
  margin: 0 auto 20px;
}
.board-heading h1 {
  font-size: clamp(30px, 3.5vw, 60px);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -.04em;
}
.board-heading h1 span {
  text-decoration: underline;
  text-decoration-color: #f9ed32;
  text-underline-offset: 7px;
}
.board-heading > p {
  margin-top: 16px;
  color: #595750;
  font-size: clamp(16px, 1.5vw, 24px);
}
.qr-grid {
  max-width: 1600px;
  margin: auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}
.qr-tile {
  min-width: 0;
  background: white;
  border: 1px solid #d9d6cd;
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.tile-copy {
  display: flex;
  gap: 14px;
  align-self: stretch;
}
.tile-number {
  font-family: var(--font-mono), monospace;
  font-size: 14px;
  color: #ed008c;
  padding-top: 4px;
}
.tile-copy h2 {
  font-size: clamp(22px, 2vw, 32px);
  font-weight: 700;
  line-height: 1.2;
}
.tile-copy p {
  margin-top: 5px;
  font-weight: 500;
}
.tile-copy small {
  display: block;
  color: #595750;
  margin-top: 3px;
}
.qr-image {
  width: min(100%, 320px);
  aspect-ratio: 1;
  margin: 12px auto 0;
}
.qr-image img {
  width: 100%;
  height: 100%;
}
.qr-placeholder {
  height: 100%;
  border: 20px solid white;
  background: #f0eee7;
}
.short-link {
  font-family: var(--font-mono), monospace;
  font-size: clamp(14px, 1.25vw, 22px);
  font-weight: 600;
  text-align: center;
  overflow-wrap: anywhere;
}
.tiles-1 {
  max-width: 600px;
  grid-template-columns: 1fr;
}
.tiles-3 .qr-tile:last-child {
  grid-column: 1 / -1;
  width: calc(50% - 10px);
  justify-self: center;
}
.empty-board {
  text-align: center;
  padding: 50px;
}
.presentation-setup .qr-image {
  width: min(100%, 200px);
}
.presentation-setup .qr-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.presentation-setup .qr-tile {
  border-radius: 8px;
}
@media (max-width: 650px) {
  .qr-grid {
    grid-template-columns: 1fr;
  }
  .tiles-3 .qr-tile:last-child {
    width: 100%;
    grid-column: auto;
  }
  .exit-button {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  button {
    transition: none;
  }
  button:active:not(:disabled) {
    transform: none;
  }
}
</style>
