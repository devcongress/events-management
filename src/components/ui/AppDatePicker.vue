<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue';
import type { CSSProperties } from 'vue';
import { calculateFloatingPosition, type FloatingPlacement } from '@/src/lib/floating-placement';

let activeDatePickerId: string | null = null;

const props = withDefaults(defineProps<{
  modelValue: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  mode?: 'date' | 'datetime';
}>(), {
  label: '',
  placeholder: '',
  required: false,
  mode: 'date',
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const triggerButton = ref<HTMLButtonElement | null>(null);
const calendarPanel = ref<HTMLElement | null>(null);
const placement = ref<FloatingPlacement>('bottom');
const panelStyle = ref<CSSProperties>({});
const datePickerId = `app-date-picker-${useId()}`;
let placementFrame: number | null = null;

function parseDate(value: string): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, yearValue, monthValue, dayValue] = match;
  const year = Number(yearValue);
  const month = Number(monthValue) - 1;
  const day = Number(dayValue);
  const parsed = new Date(year, month, day);
  if (
    Number.isNaN(parsed.getTime())
    || parsed.getFullYear() !== year
    || parsed.getMonth() !== month
    || parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function parseTime(value: string): { hour: string; minute: string } | null {
  const match = /T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour: match[1], minute: match[2] };
}

function toDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function twoDigits(value: number): string {
  return `${value}`.padStart(2, '0');
}

const selectedDate = computed(() => parseDate(props.modelValue));
const selectedTime = computed(() => parseTime(props.modelValue));
const resolvedPlaceholder = computed(() => (
  props.placeholder || (props.mode === 'datetime' ? 'Choose date and time' : 'dd / mm / yyyy')
));
const displayValue = computed(() => {
  if (!selectedDate.value) return resolvedPlaceholder.value;
  const formattedDate = new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(selectedDate.value);
  if (props.mode === 'date') return formattedDate;
  const time = selectedTime.value;
  return `${formattedDate} · ${time?.hour ?? '00'}:${time?.minute ?? '00'}`;
});

const monthCursor = ref<Date>(selectedDate.value ?? new Date());
const activeDate = ref<Date>(selectedDate.value ?? new Date());
const draftDate = ref<Date | null>(selectedDate.value);
const draftHour = ref('09');
const draftMinute = ref('00');
const calendarSelection = computed(() => (
  props.mode === 'datetime' && open.value ? draftDate.value : selectedDate.value
));

watch(selectedDate, (value) => {
  if (value && !open.value) {
    monthCursor.value = new Date(value.getFullYear(), value.getMonth(), 1);
  }
}, { immediate: true });

const monthLabel = computed(() => new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
}).format(monthCursor.value));

const weekdayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const calendarDays = computed(() => {
  const year = monthCursor.value.getFullYear();
  const month = monthCursor.value.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPreviousMonth = new Date(year, month, 0).getDate();

  return Array.from({ length: 42 }, (_, index) => {
    const dayNumber = index - startOffset + 1;

    if (dayNumber <= 0) {
      const date = new Date(year, month - 1, daysInPreviousMonth + dayNumber);
      return { date, currentMonth: false };
    }

    if (dayNumber > daysInMonth) {
      const date = new Date(year, month + 1, dayNumber - daysInMonth);
      return { date, currentMonth: false };
    }

    const date = new Date(year, month, dayNumber);
    return { date, currentMonth: true };
  });
});

function isSameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

function dateAriaLabel(date: Date): string {
  const label = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
  return isToday(date) ? `${label}, today` : label;
}

function calendarDayClass(day: { date: Date; currentMonth: boolean }): string {
  if (isSameDay(day.date, calendarSelection.value)) {
    return 'border-dc-ink bg-dc-yellow font-bold text-dc-ink shadow-[2px_2px_0_#111111]';
  }

  if (isToday(day.date)) {
    return 'border-dc-pink bg-dc-pink/10 font-bold text-dc-pink hover:bg-dc-pink/20';
  }

  return day.currentMonth
    ? 'border-transparent bg-transparent text-dc-ink hover:border-dc-ink hover:bg-dc-paper-warm'
    : 'border-transparent bg-transparent text-dc-gray-light hover:border-dc-border hover:bg-dc-paper-warm';
}

async function focusDate(date: Date) {
  activeDate.value = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (
    monthCursor.value.getFullYear() !== date.getFullYear()
    || monthCursor.value.getMonth() !== date.getMonth()
  ) {
    monthCursor.value = new Date(date.getFullYear(), date.getMonth(), 1);
  }

  await nextTick();
  calendarPanel.value
    ?.querySelector<HTMLButtonElement>(`[data-date="${toDateValue(date)}"]`)
    ?.focus();
}

function setActiveDate(date: Date) {
  activeDate.value = new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function chooseDate(date: Date) {
  const nextDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monthCursor.value = new Date(date.getFullYear(), date.getMonth(), 1);
  if (props.mode === 'datetime') {
    draftDate.value = nextDate;
    activeDate.value = nextDate;
    void focusDate(nextDate);
    schedulePlacementUpdate();
    return;
  }
  emit('update:modelValue', toDateValue(nextDate));
  closePicker(true);
}

function chooseToday() {
  const now = new Date();
  if (props.mode === 'datetime') {
    draftDate.value = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    draftHour.value = twoDigits(now.getHours());
    draftMinute.value = twoDigits(now.getMinutes());
    void focusDate(now);
    schedulePlacementUpdate();
    return;
  }
  chooseDate(now);
}

function clearDate() {
  emit('update:modelValue', '');
  closePicker(true);
}

function normalizeTimeValue(value: string, maximum: number): string {
  const number = Number(value.replace(/\D/g, ''));
  if (!Number.isFinite(number)) return '00';
  return twoDigits(Math.min(Math.max(number, 0), maximum));
}

function updateDraftTime(event: Event, part: 'hour' | 'minute') {
  const value = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 2);
  if (part === 'hour') {
    draftHour.value = value;
  } else {
    draftMinute.value = value;
  }
}

function normalizeDraftTime() {
  draftHour.value = normalizeTimeValue(draftHour.value, 23);
  draftMinute.value = normalizeTimeValue(draftMinute.value, 59);
}

function applyDateTime() {
  if (!draftDate.value) return;
  normalizeDraftTime();
  emit(
    'update:modelValue',
    `${toDateValue(draftDate.value)}T${draftHour.value}:${draftMinute.value}`,
  );
  closePicker(true);
}

function shiftVisibleMonth(offset: number) {
  const targetMonth = new Date(
    monthCursor.value.getFullYear(),
    monthCursor.value.getMonth() + offset,
    1,
  );
  const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
  activeDate.value = new Date(
    targetMonth.getFullYear(),
    targetMonth.getMonth(),
    Math.min(activeDate.value.getDate(), lastDay),
  );
  monthCursor.value = targetMonth;
}

function previousMonth() {
  shiftVisibleMonth(-1);
}

function nextMonth() {
  shiftVisibleMonth(1);
}

function closePicker(restoreFocus = false) {
  open.value = false;
  if (placementFrame !== null) {
    window.cancelAnimationFrame(placementFrame);
    placementFrame = null;
  }
  if (activeDatePickerId === datePickerId) {
    activeDatePickerId = null;
  }
  if (restoreFocus) {
    void nextTick(() => triggerButton.value?.focus());
  }
}

function togglePicker() {
  if (open.value) {
    closePicker();
  } else {
    document.dispatchEvent(new CustomEvent('app-dropdown:open', { detail: { id: datePickerId } }));
    document.dispatchEvent(new CustomEvent('app-date-picker:open', { detail: { id: datePickerId } }));
    activeDatePickerId = datePickerId;
    open.value = true;
  }
}

function viewportBounds() {
  const visualViewport = window.visualViewport;
  return visualViewport
    ? {
        top: visualViewport.offsetTop,
        left: visualViewport.offsetLeft,
        width: visualViewport.width,
        height: visualViewport.height,
      }
    : { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
}

function updatePlacement() {
  if (!triggerButton.value || !open.value) return;
  const position = calculateFloatingPosition({
    anchor: triggerButton.value.getBoundingClientRect(),
    viewport: viewportBounds(),
    panelHeight: calendarPanel.value?.scrollHeight ?? (props.mode === 'datetime' ? 560 : 470),
    preferredWidth: props.mode === 'datetime' ? 328 : 304,
  });
  placement.value = position.placement;
  panelStyle.value = {
    position: 'fixed',
    top: `${position.top}px`,
    left: `${position.left}px`,
    width: `${position.width}px`,
    maxHeight: `${position.maxHeight}px`,
    transformOrigin: position.placement === 'top' ? 'bottom left' : 'top left',
  };
}

function schedulePlacementUpdate() {
  if (!open.value) return;
  updatePlacement();
  if (placementFrame !== null) {
    window.cancelAnimationFrame(placementFrame);
  }
  placementFrame = window.requestAnimationFrame(() => {
    placementFrame = null;
    updatePlacement();
  });
}

function moveActiveDate(dayOffset: number) {
  const nextDate = new Date(activeDate.value);
  nextDate.setDate(nextDate.getDate() + dayOffset);
  void focusDate(nextDate);
}

function moveActiveMonth(monthOffset: number) {
  const targetMonth = new Date(
    activeDate.value.getFullYear(),
    activeDate.value.getMonth() + monthOffset,
    1,
  );
  const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
  const nextDate = new Date(
    targetMonth.getFullYear(),
    targetMonth.getMonth(),
    Math.min(activeDate.value.getDate(), lastDay),
  );
  void focusDate(nextDate);
}

function handleCalendarKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closePicker(true);
    return;
  }
  if (!(event.target instanceof HTMLElement) || !event.target.hasAttribute('data-date')) return;

  const moves: Record<string, () => void> = {
    ArrowLeft: () => moveActiveDate(-1),
    ArrowRight: () => moveActiveDate(1),
    ArrowUp: () => moveActiveDate(-7),
    ArrowDown: () => moveActiveDate(7),
    Home: () => moveActiveDate(-activeDate.value.getDay()),
    End: () => moveActiveDate(6 - activeDate.value.getDay()),
    PageUp: () => moveActiveMonth(-1),
    PageDown: () => moveActiveMonth(1),
  };
  const move = moves[event.key];
  if (!move) return;
  event.preventDefault();
  move();
}

function eventIsInsidePicker(event: Event): boolean {
  const target = event.target as Node;
  return Boolean(root.value?.contains(target) || calendarPanel.value?.contains(target));
}

function handleDocumentClick(event: MouseEvent) {
  if (eventIsInsidePicker(event)) return;
  closePicker();
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (eventIsInsidePicker(event)) return;
  closePicker();
}

function handleEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !open.value) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  closePicker(true);
}

function handlePickerOpen(event: Event) {
  const detail = (event as CustomEvent<{ id?: string }>).detail;
  if (detail?.id !== datePickerId) {
    closePicker();
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown, true);
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleEscape);
  document.addEventListener('app-date-picker:open', handlePickerOpen as EventListener);
  document.addEventListener('app-dropdown:open', handlePickerOpen as EventListener);
  window.addEventListener('resize', schedulePlacementUpdate);
  window.addEventListener('scroll', schedulePlacementUpdate, true);
  window.visualViewport?.addEventListener('resize', schedulePlacementUpdate);
  window.visualViewport?.addEventListener('scroll', schedulePlacementUpdate);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
  document.removeEventListener('click', handleDocumentClick);
  document.removeEventListener('keydown', handleEscape);
  document.removeEventListener('app-date-picker:open', handlePickerOpen as EventListener);
  document.removeEventListener('app-dropdown:open', handlePickerOpen as EventListener);
  window.removeEventListener('resize', schedulePlacementUpdate);
  window.removeEventListener('scroll', schedulePlacementUpdate, true);
  window.visualViewport?.removeEventListener('resize', schedulePlacementUpdate);
  window.visualViewport?.removeEventListener('scroll', schedulePlacementUpdate);
  if (placementFrame !== null) {
    window.cancelAnimationFrame(placementFrame);
  }
  if (activeDatePickerId === datePickerId) {
    activeDatePickerId = null;
  }
});

watch(open, async (isOpen) => {
  if (isOpen) {
    const now = new Date();
    const initialDate = selectedDate.value ?? now;
    const initialTime = selectedTime.value;
    draftDate.value = new Date(initialDate.getFullYear(), initialDate.getMonth(), initialDate.getDate());
    draftHour.value = initialTime?.hour ?? twoDigits(now.getHours());
    draftMinute.value = initialTime?.minute ?? twoDigits(now.getMinutes());
    activeDate.value = new Date(initialDate.getFullYear(), initialDate.getMonth(), initialDate.getDate());
    monthCursor.value = new Date(initialDate.getFullYear(), initialDate.getMonth(), 1);
    await nextTick();
    schedulePlacementUpdate();
    await focusDate(initialDate);
    schedulePlacementUpdate();
  } else {
    placement.value = 'bottom';
    panelStyle.value = {};
  }
});
</script>

<template>
  <div ref="root" class="relative block">
    <span v-if="label" :id="`${datePickerId}-label`" class="editorial-label">
      {{ label }}
      <span v-if="required" class="ml-1 text-red-600">*</span>
    </span>
    <button
      ref="triggerButton"
      type="button"
      class="motion-press flex min-h-[50px] w-full items-center justify-between gap-3 rounded-md border bg-dc-paper px-4 py-3 text-left text-base font-medium text-dc-ink outline-none hover:bg-dc-paper-warm focus:border-dc-pink focus:shadow-[0_0_0_3px_rgba(17,17,17,0.16)]"
      :class="[
        label ? 'mt-2' : '',
        open ? 'border-dc-pink shadow-[0_0_0_3px_rgba(17,17,17,0.16)]' : 'border-dc-border',
      ]"
      :aria-expanded="open"
      :aria-controls="`${datePickerId}-calendar`"
      :aria-labelledby="label ? `${datePickerId}-label ${datePickerId}-value` : `${datePickerId}-value`"
      :aria-required="required ? 'true' : undefined"
      aria-haspopup="dialog"
      @click.stop="togglePicker"
    >
      <span :id="`${datePickerId}-value`" class="min-w-0 truncate" :class="selectedDate ? 'text-dc-ink' : 'font-normal text-dc-gray-light'">
        {{ displayValue }}
      </span>
      <span class="grid size-6 shrink-0 place-items-center rounded-full border border-dc-border text-dc-pink">
        <svg viewBox="0 0 20 20" class="size-3.5" fill="none" aria-hidden="true">
          <path d="M5.5 3.5v2M14.5 3.5v2M4 7.5h12M6 2.75h8a1.75 1.75 0 0 1 1.75 1.75v10.5A1.75 1.75 0 0 1 14 16.75H6A1.75 1.75 0 0 1 4.25 15V4.5A1.75 1.75 0 0 1 6 2.75Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
    </button>

    <Teleport to="body">
      <Transition name="dropdown-menu">
        <div
          v-if="open"
          ref="calendarPanel"
          :id="`${datePickerId}-calendar`"
          class="app-dropdown-menu z-[120] overflow-y-auto overscroll-contain rounded-lg border-2 border-dc-ink bg-dc-paper shadow-[3px_3px_0_#111111]"
          :data-placement="placement"
          :style="panelStyle"
          role="dialog"
          :aria-label="mode === 'datetime' ? 'Choose date and time' : 'Choose date'"
          @keydown="handleCalendarKeydown"
        >
          <div class="sticky top-0 z-10 border-b border-dc-border bg-dc-paper-warm px-3 py-3">
            <div class="flex items-center justify-between gap-2">
              <button type="button" class="motion-press grid size-8 place-items-center rounded-md border border-dc-ink bg-dc-paper text-dc-ink hover:bg-dc-yellow" aria-label="Previous month" @click="previousMonth">
                <svg viewBox="0 0 20 20" class="size-4" fill="none" aria-hidden="true">
                  <path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
              <p class="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-dc-ink">{{ monthLabel }}</p>
              <button type="button" class="motion-press grid size-8 place-items-center rounded-md border border-dc-ink bg-dc-paper text-dc-ink hover:bg-dc-yellow" aria-label="Next month" @click="nextMonth">
                <svg viewBox="0 0 20 20" class="size-4" fill="none" aria-hidden="true">
                  <path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
            </div>
          </div>

          <div class="p-3">
            <div class="mb-2 grid grid-cols-7 gap-1">
              <span v-for="weekday in weekdayLabels" :key="weekday" class="grid h-8 place-items-center font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray">
                {{ weekday }}
              </span>
            </div>

            <div class="grid grid-cols-7 gap-1">
              <button
                v-for="day in calendarDays"
                :key="toDateValue(day.date)"
                type="button"
                class="motion-press relative grid h-10 place-items-center rounded-md border text-sm font-medium outline-none focus-visible:border-dc-pink focus-visible:shadow-[0_0_0_2px_rgba(232,17,127,0.35)]"
                :data-date="toDateValue(day.date)"
                :tabindex="isSameDay(day.date, activeDate) ? 0 : -1"
                :aria-label="dateAriaLabel(day.date)"
                :aria-pressed="isSameDay(day.date, calendarSelection)"
                :aria-current="isToday(day.date) ? 'date' : undefined"
                :class="calendarDayClass(day)"
                @focus="setActiveDate(day.date)"
                @click="chooseDate(day.date)"
              >
                <span>{{ day.date.getDate() }}</span>
                <span v-if="isToday(day.date)" class="absolute bottom-1 size-1 rounded-full bg-dc-pink" aria-hidden="true" />
              </button>
            </div>

            <div v-if="mode === 'datetime'" class="mt-3 border-t border-dc-border pt-3">
              <div class="flex items-end justify-between gap-3">
                <div>
                  <p class="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-dc-gray">Time · 24 hour</p>
                  <p class="mt-1 text-xs text-dc-gray">Enter hour and minute</p>
                </div>
                <div class="flex items-center gap-1.5">
                  <label>
                    <span class="sr-only">Hour</span>
                    <input
                      :value="draftHour"
                      type="text"
                      inputmode="numeric"
                      maxlength="2"
                      class="h-10 w-12 rounded-md border border-dc-border bg-white text-center font-mono text-sm font-semibold text-dc-ink outline-none focus:border-dc-pink focus:shadow-[0_0_0_2px_rgba(232,17,127,0.2)]"
                      aria-label="Hour, 00 to 23"
                      @input="updateDraftTime($event, 'hour')"
                      @blur="normalizeDraftTime"
                      @keydown.enter.prevent.stop="applyDateTime"
                    >
                  </label>
                  <span class="font-mono font-bold text-dc-gray">:</span>
                  <label>
                    <span class="sr-only">Minute</span>
                    <input
                      :value="draftMinute"
                      type="text"
                      inputmode="numeric"
                      maxlength="2"
                      class="h-10 w-12 rounded-md border border-dc-border bg-white text-center font-mono text-sm font-semibold text-dc-ink outline-none focus:border-dc-pink focus:shadow-[0_0_0_2px_rgba(232,17,127,0.2)]"
                      aria-label="Minute, 00 to 59"
                      @input="updateDraftTime($event, 'minute')"
                      @blur="normalizeDraftTime"
                      @keydown.enter.prevent.stop="applyDateTime"
                    >
                  </label>
                </div>
              </div>
            </div>

            <div class="sticky bottom-0 z-10 mt-3 flex items-center justify-between border-t border-dc-border bg-dc-paper pt-3">
              <button type="button" class="font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-gray hover:text-dc-ink" @click="clearDate">
                Clear
              </button>
              <button type="button" class="font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-pink hover:text-dc-ink" @click="chooseToday">
                {{ mode === 'datetime' ? 'Now' : 'Today' }}
              </button>
              <button
                v-if="mode === 'datetime'"
                type="button"
                class="motion-press rounded-md border border-dc-ink bg-dc-pink px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-white shadow-[2px_2px_0_#111111] disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="!draftDate"
                @click="applyDateTime"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
