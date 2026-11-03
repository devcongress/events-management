<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, useId, watch } from 'vue';
import AppDropdown from '@/src/components/AppDropdown.vue';
import { calculateFloatingPosition } from '@/src/lib/floating-placement';
import { clockFromMinutes, clockMinutes, formatProgrammeTime, parseProgrammeTime, programmeDuration, type ClockTime } from '@/lib/programme-time';

const props = defineProps<{ modelValue: string; previousTime?: string; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const id = `programme-time-${useId()}`;
const trigger = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const open = ref(false);
const dirty = ref(false);
const mobile = ref(false);
let nestedPointer = false;
let panelObserver: ResizeObserver | undefined;
const draft = reactive<{ start: ClockTime; duration: string; clear: boolean }>({
  start: { hour: 9, minute: 0, period: 'AM' },
  duration: '30',
  clear: false,
});
const position = ref<Record<string, string>>({});
const hourOptions = Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: String(index + 1) }));
const minuteOptions = Array.from({ length: 60 }, (_, index) => ({ value: index, label: String(index).padStart(2, '0') }));
const periodOptions = [{ value: 'AM', label: 'AM' }, { value: 'PM', label: 'PM' }];
const maximumDuration = computed(() => Math.min(1439, 1440 - clockMinutes(draft.start)));
const previousEnd = computed(() => {
  const previous = parseProgrammeTime(props.previousTime ?? '');

  return previous && programmeDuration(previous) !== null && previous.end && clockMinutes(previous.end) !== 0 ? previous.end : null;
});
const parsedCurrent = computed(() => parseProgrammeTime(props.modelValue));
const showOriginal = computed(() => Boolean(props.modelValue && props.modelValue !== 'TBD' && (!parsedCurrent.value || (parsedCurrent.value.end && programmeDuration(parsedCurrent.value) === null))));
const duration = computed(() => draft.duration === '' ? null : Number(draft.duration));
const invalid = computed(() => !draft.clear && duration.value !== null && (!/^\d+$/.test(draft.duration) || !Number.isInteger(duration.value) || duration.value <= 0 || duration.value >= 1440 || clockMinutes(draft.start) + duration.value > 1440));
const missingDuration = computed(() => !draft.clear && !draft.duration);
const end = computed(() => !invalid.value && duration.value !== null ? clockFromMinutes(clockMinutes(draft.start) + duration.value) : null);
const endLabel = computed(() => end.value ? formatProgrammeTime({ start: end.value, end: null }) : 'No end time');

function place() {
  if (!open.value || !trigger.value) return;
  mobile.value = window.innerWidth < 640;
  if (mobile.value) {
    position.value = {};

    return;
  }
  const viewport = window.visualViewport;
  const result = calculateFloatingPosition({
    anchor: trigger.value.getBoundingClientRect(),
    viewport: viewport ? { top: viewport.offsetTop, left: viewport.offsetLeft, width: viewport.width, height: viewport.height } : { top: 0, left: 0, width: innerWidth, height: innerHeight },
    panelHeight: panel.value?.scrollHeight ?? 360,
    preferredWidth: 360,
    maxWidth: 380,
  });

  position.value = { position: 'fixed', top: `${result.top}px`, left: `${result.left}px`, width: `${result.width}px`, maxHeight: `${result.maxHeight}px` };
}
function close(restore = false) {
  open.value = false;
  if (restore) void nextTick(() => trigger.value?.focus());
}
async function show() {
  if (props.disabled) return;
  if (open.value) {
    close();

    return;
  }
  const parsed = parseProgrammeTime(props.modelValue);
  const existingDuration = parsed ? programmeDuration(parsed) : null;

  draft.start = parsed ? { ...parsed.start } : { hour: 9, minute: 0, period: 'AM' };
  draft.duration = String(existingDuration ?? Math.min(30, maximumDuration.value));
  draft.clear = false;
  dirty.value = false;
  mobile.value = window.innerWidth < 640;
  document.dispatchEvent(new CustomEvent('app-date-picker:open', { detail: { id } }));
  document.dispatchEvent(new CustomEvent('app-dropdown:open', { detail: { id } }));
  open.value = true;
  await nextTick();
  place();
  panel.value?.querySelector<HTMLButtonElement>('[data-time-close]')?.focus();
  requestAnimationFrame(place);
}
function apply() {
  if (props.disabled || invalid.value || missingDuration.value) return;
  if (dirty.value) emit('update:modelValue', draft.clear ? 'TBD' : formatProgrammeTime({ start: draft.start, end: end.value }));
  close(true);
}
function chooseDuration(value: string) {
  draft.duration = value;
  dirty.value = true;
}
function stepDuration(delta: number) {
  const current = Number(draft.duration) || 0;

  chooseDuration(String(Math.max(1, Math.min(maximumDuration.value, Math.trunc(current) + delta))));
}
function usePrevious() {
  if (!previousEnd.value) return;
  draft.start = { ...previousEnd.value };
  draft.clear = false;
  dirty.value = true;
}
function nestedMenu(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('.programme-time-choice-menu'));
}
function dismissOutside(event: Event) {
  const target = event.target as Node;

  if (!open.value || trigger.value?.contains(target) || panel.value?.contains(target) || nestedMenu(event.target)) return;
  if (mobile.value) event.preventDefault();
  close(mobile.value);
}
function keyboard(event: KeyboardEvent) {
  if (!open.value) return;
  if (event.key === 'Escape') {
    if (panel.value?.querySelector('.app-dropdown-trigger[aria-expanded="true"]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close(true);

    return;
  }
  if (event.key !== 'Tab' || !mobile.value || panel.value?.querySelector('.app-dropdown-trigger[aria-expanded="true"]') || !panel.value) return;
  const focusable = [...panel.value.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')];
  const first = focusable[0];
  const last = focusable.at(-1);

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
function handlePanelPointer(event: PointerEvent) {
  if (!(event.target instanceof Element) || !event.target.closest('.app-dropdown-trigger')) return;
  nestedPointer = true;
  window.setTimeout(() => { nestedPointer = false; }, 0);
}
function otherPicker(event: Event) {
  if ((event as CustomEvent<{ id?: string }>).detail?.id === id) return;
  if (nestedPointer || panel.value?.contains(document.activeElement)) return;
  close();
}
watch(() => props.disabled, (value) => { if (value) close(); });
function addListeners() {
  document.addEventListener('pointerdown', dismissOutside, true);
  document.addEventListener('keydown', keyboard);
  document.addEventListener('app-date-picker:open', otherPicker);
  document.addEventListener('app-dropdown:open', otherPicker);
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
  window.visualViewport?.addEventListener('resize', place);
  window.visualViewport?.addEventListener('scroll', place);
}
function removeListeners() {
  document.removeEventListener('pointerdown', dismissOutside, true);
  document.removeEventListener('keydown', keyboard);
  document.removeEventListener('app-date-picker:open', otherPicker);
  document.removeEventListener('app-dropdown:open', otherPicker);
  window.removeEventListener('resize', place);
  window.removeEventListener('scroll', place, true);
  window.visualViewport?.removeEventListener('resize', place);
  window.visualViewport?.removeEventListener('scroll', place);
}
watch(open, (value) => {
  if (value) addListeners();
  else removeListeners();
}, { flush: 'sync' });
watch(panel, (element) => {
  panelObserver?.disconnect();
  if (!element) return;
  panelObserver = new ResizeObserver(place);
  panelObserver.observe(element);
}, { flush: 'post' });
onBeforeUnmount(() => {
  panelObserver?.disconnect();
  removeListeners();
});
</script>

<template>
  <div class="programme-time-picker">
    <button ref="trigger" type="button" class="app-form-control programme-time-trigger" data-form-density="field" :disabled="disabled" :aria-expanded="open" :aria-controls="id" :aria-describedby="`${id}-value`" aria-label="Time" aria-haspopup="dialog" @click="show">
      <span :id="`${id}-value`">{{ modelValue || 'TBD' }}</span>
      <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="M10 6v4l3 2" /></svg>
    </button>
    <Teleport to="body">
      <div v-if="open" class="programme-time-layer" :class="{ 'programme-time-layer--mobile': mobile }">
        <div :id="id" ref="panel" class="app-dropdown-menu programme-time-panel" :class="{ 'programme-time-panel--mobile': mobile }" :style="position" role="dialog" @pointerdown.capture="handlePanelPointer" :aria-modal="mobile ? 'true' : undefined" aria-label="Choose programme time">
          <div class="programme-time-head">
            <strong>Session time</strong>
            <div>
              <button class="text-action" type="button" @click="draft.clear = !draft.clear; dirty = true">{{ draft.clear ? 'Choose time' : 'Set TBD' }}</button>
              <button data-time-close type="button" aria-label="Close time picker" @click="close(true)">×</button>
            </div>
          </div>
          <p v-if="showOriginal" class="programme-time-original">Current: {{ modelValue }}</p>
          <template v-if="!draft.clear">
            <div class="programme-time-row">
              <span class="programme-time-label">Start</span>
              <div class="programme-time-start" role="group" aria-label="Start time">
                <AppDropdown v-model="draft.start.hour" :aria-label="`Start hour, ${draft.start.hour}`" :options="hourOptions" density="compact" teleport menu-class="programme-time-choice-menu" trigger-class="!border-0 !bg-transparent !shadow-none !px-1" @update:model-value="dirty = true">
                  <template #trigger="{ selectedLabel }">{{ selectedLabel }}</template>
                </AppDropdown>
                <span aria-hidden="true">:</span>
                <AppDropdown v-model="draft.start.minute" :aria-label="`Start minute, ${String(draft.start.minute).padStart(2, '0')}`" :options="minuteOptions" density="compact" teleport menu-class="programme-time-choice-menu" trigger-class="!border-0 !bg-transparent !shadow-none !px-1" @update:model-value="dirty = true">
                  <template #trigger="{ selectedLabel }">{{ selectedLabel }}</template>
                </AppDropdown>
                <AppDropdown v-model="draft.start.period" :aria-label="`Start period, ${draft.start.period}`" :options="periodOptions" density="compact" teleport menu-class="programme-time-choice-menu" trigger-class="!border-0 !bg-transparent !shadow-none !px-1" @update:model-value="dirty = true">
                  <template #trigger="{ selectedLabel }">{{ selectedLabel }}</template>
                </AppDropdown>
              </div>
            </div>
            <button v-if="previousEnd" type="button" class="programme-time-previous" @click="usePrevious">Start after previous session · {{ formatProgrammeTime({ start: previousEnd, end: null }) }}</button>
            <div class="programme-time-row">
              <span class="programme-time-label">Duration</span>
              <div class="programme-time-stepper" role="group" aria-label="Adjust duration">
                <button type="button" aria-label="Decrease duration by one minute" :disabled="duration !== null && duration <= 1" @click="stepDuration(-1)">−</button>
                <label>
                  <input type="number" class="app-form-control" inputmode="numeric" aria-label="Duration in minutes" min="1" :max="maximumDuration" step="1" :value="draft.duration" @input="chooseDuration(($event.target as HTMLInputElement).value)" />
                  <span aria-hidden="true">min</span>
                </label>
                <button type="button" aria-label="Increase duration by one minute" :disabled="duration !== null && duration >= maximumDuration" @click="stepDuration(1)">+</button>
              </div>
            </div>
            <p v-if="invalid || missingDuration" role="alert" class="programme-time-error">Enter a positive duration ending no later than midnight.</p>
          </template>
          <p v-else class="programme-time-original">This session time will be TBD.</p>
          <div class="programme-time-footer">
            <span v-if="!draft.clear" class="programme-time-end">Ends at <strong>{{ endLabel }}</strong></span>
            <span v-else />
            <div><button class="text-action" type="button" @click="close(true)">Cancel</button><button class="programme-time-apply" type="button" :disabled="invalid || missingDuration" @click="apply">Apply</button></div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.programme-time-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  text-align: left;
}
.programme-time-trigger span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.programme-time-trigger svg {
  flex: none;
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
}
.programme-time-layer {
  position: fixed;
  inset: 0;
  z-index: 160;
  pointer-events: none;
}
.programme-time-layer--mobile {
  display: flex;
  align-items: end;
  background: rgb(0 0 0 / 35%);
  pointer-events: auto;
}
.programme-time-panel {
  pointer-events: auto;
  overflow-y: auto;
  padding: 16px;
  border: 1px solid #e0ddd4;
  border-radius: 8px;
  background: white;
  box-shadow: 0 18px 36px rgb(17 17 17 / 14%);
}
.programme-time-panel--mobile {
  width: 100%;
  max-height: min(90dvh, 720px);
  border-radius: 12px 12px 0 0;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
}
.programme-time-head,
.programme-time-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.programme-time-head > div,
.programme-time-footer > div {
  display: flex;
  align-items: center;
  gap: 4px;
}

.programme-time-head strong {
  font-size: 18px;
}

.programme-time-original {
  color: #555;
  font-size: 14px;
}

.programme-time-head button,
.programme-time-footer button,
.programme-time-previous {
  min-height: 44px;
  padding: 6px 10px;
  border-radius: 6px;
  font-weight: 600;
}

.programme-time-head button:last-child {
  font-size: 22px;
}

.programme-time-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 50px;
}

.programme-time-label {
  font-size: 14px;
  font-weight: 700;
}

.programme-time-start {
  display: flex;
  align-items: center;
  padding: 0 4px;
  border: 1px solid #ddd9ce;
  border-radius: 6px;
  font-variant-numeric: tabular-nums;
}

.programme-time-start:focus-within {
  outline: 2px solid #e8117f;
  outline-offset: 2px;
}

.programme-time-start :deep(.app-dropdown-trigger) {
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
}

.programme-time-start :deep(.app-dropdown-trigger:focus-visible) {
  outline: 2px solid #e8117f !important;
  outline-offset: -2px;
}

.programme-time-previous {
  color: #a3135b;
  text-align: left;
  padding-left: 0;
}

@media (hover: hover) and (pointer: fine) {
  .programme-time-previous:hover:not(:focus-visible) {
    outline: none;
    text-decoration: underline;
    text-underline-offset: .2em;
  }
}

.programme-time-stepper {
  display: inline-flex;
  align-items: center;
}

.programme-time-stepper button {
  width: 44px;
  height: 44px;
  font-size: 18px;
}

@media (hover: hover) and (pointer: fine) {
  .programme-time-stepper button:enabled:hover:not(:focus-visible) {
    outline: none;
    color: hsl(var(--accent));
  }
}

.programme-time-stepper button:disabled {
  opacity: .4;
}

.programme-time-stepper label {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  padding-inline: 2px;
}

.programme-time-panel .programme-time-stepper input.app-form-control {
  min-width: 44px;
  min-height: 44px;
  padding: 2px;
  width: 4ch;
  border: 0;
  border-bottom: 1px solid var(--border-subtle);
  border-radius: 0;
  appearance: textfield;
  background: transparent;
  text-align: right;
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}

.programme-time-panel .programme-time-stepper input.app-form-control:focus {
  outline: none;
  box-shadow: none;
  border-bottom: 2px solid var(--form-focus);
}

.programme-time-stepper input::-webkit-inner-spin-button,
.programme-time-stepper input::-webkit-outer-spin-button {
  appearance: none;
}
.programme-time-end {
  color: #555;
  font-size: 14px;
}

.programme-time-end strong {
  color: #111;
}

.programme-time-error {
  margin-top: 6px;
  color: #a00035;
  font-size: 14px;
}
.programme-time-footer {
  margin-top: 14px;
  border-top: 1px solid #e0ddd4;
  padding-top: 8px;
}
.programme-time-footer > div {
  display: flex;
  gap: 4px;
}
.programme-time-apply {
  border: 1px solid #111;
  background: #f5e642;
}
.programme-time-apply:disabled {
  opacity: .5;
}
</style>
