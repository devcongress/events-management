<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue';

let activeDatePickerId: string | null = null;

const props = withDefaults(defineProps<{
  modelValue: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
}>(), {
  label: '',
  placeholder: 'dd / mm / yyyy',
  required: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const triggerButton = ref<HTMLButtonElement | null>(null);
const calendarPanel = ref<HTMLElement | null>(null);
const placement = ref<'bottom' | 'top'>('bottom');
const menuMaxHeight = ref<number | null>(null);
const datePickerId = `app-date-picker-${useId()}`;

function parseDate(value: string): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const selectedDate = computed(() => parseDate(props.modelValue));
const displayValue = computed(() => {
  if (!selectedDate.value) return props.placeholder;
  return new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(selectedDate.value);
});

const monthCursor = ref<Date>(selectedDate.value ?? new Date());

watch(selectedDate, (value) => {
  if (value) {
    monthCursor.value = new Date(value.getFullYear(), value.getMonth(), 1);
  }
}, { immediate: true });

const monthLabel = computed(() => new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
}).format(monthCursor.value));

const weekdayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const activeDate = ref<Date>(selectedDate.value ?? new Date());

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

function dateAriaLabel(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
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
  emit('update:modelValue', toDateValue(date));
  monthCursor.value = new Date(date.getFullYear(), date.getMonth(), 1);
  closePicker(true);
}

function clearDate() {
  emit('update:modelValue', '');
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

function updatePlacement() {
  if (!root.value || !open.value) return;
  const rect = root.value.getBoundingClientRect();
  const spacing = 8;
  const scrollBoundary = root.value.closest<HTMLElement>('.annual-task-drawer-scroll')?.getBoundingClientRect();
  const boundaryTop = Math.max(spacing, scrollBoundary?.top ?? spacing);
  const boundaryBottom = Math.min(window.innerHeight - spacing, scrollBoundary?.bottom ?? window.innerHeight - spacing);
  const spaceBelow = Math.max(0, boundaryBottom - rect.bottom - spacing);
  const spaceAbove = Math.max(0, rect.top - boundaryTop - spacing);
  const menuHeight = calendarPanel.value?.scrollHeight ?? 420;
  const nextPlacement = spaceBelow < menuHeight && spaceAbove > spaceBelow ? 'top' : 'bottom';
  placement.value = nextPlacement;
  menuMaxHeight.value = Math.floor(nextPlacement === 'top' ? spaceAbove : spaceBelow);
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

function handleDocumentClick(event: MouseEvent) {
  if (root.value?.contains(event.target as Node)) return;
  closePicker();
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (root.value?.contains(event.target as Node)) return;
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
  window.addEventListener('resize', updatePlacement);
  window.addEventListener('scroll', updatePlacement, true);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
  document.removeEventListener('click', handleDocumentClick);
  document.removeEventListener('keydown', handleEscape);
  document.removeEventListener('app-date-picker:open', handlePickerOpen as EventListener);
  document.removeEventListener('app-dropdown:open', handlePickerOpen as EventListener);
  window.removeEventListener('resize', updatePlacement);
  window.removeEventListener('scroll', updatePlacement, true);
  if (activeDatePickerId === datePickerId) {
    activeDatePickerId = null;
  }
});

watch(open, async (isOpen) => {
  if (isOpen) {
    const initialDate = selectedDate.value ?? new Date();
    activeDate.value = new Date(initialDate.getFullYear(), initialDate.getMonth(), initialDate.getDate());
    monthCursor.value = new Date(initialDate.getFullYear(), initialDate.getMonth(), 1);
    await nextTick();
    updatePlacement();
    await focusDate(initialDate);
  } else {
    placement.value = 'bottom';
    menuMaxHeight.value = null;
  }
});
</script>

<template>
  <div ref="root" class="relative block" :class="open ? 'z-[80]' : 'z-auto'">
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

    <Transition name="dropdown-menu">
      <div
        v-if="open"
        ref="calendarPanel"
        :id="`${datePickerId}-calendar`"
        class="app-dropdown-menu absolute z-50 mt-2 w-[19rem] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-lg border-2 border-dc-ink bg-dc-paper shadow-[3px_3px_0_#111111]"
        :class="placement === 'top' ? 'bottom-[calc(100%+0.5rem)] mt-0' : 'top-[calc(100%+0.5rem)]'"
        :data-placement="placement"
        :style="menuMaxHeight === null ? undefined : { maxHeight: `${menuMaxHeight}px` }"
        role="dialog"
        aria-label="Choose date"
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
              class="motion-press grid h-10 place-items-center rounded-md border text-sm font-medium outline-none focus-visible:border-dc-pink focus-visible:shadow-[0_0_0_2px_rgba(232,17,127,0.35)]"
              :data-date="toDateValue(day.date)"
              :tabindex="isSameDay(day.date, activeDate) ? 0 : -1"
              :aria-label="dateAriaLabel(day.date)"
              :aria-pressed="isSameDay(day.date, selectedDate)"
              :aria-current="isSameDay(day.date, new Date()) ? 'date' : undefined"
              :class="[
                isSameDay(day.date, selectedDate)
                  ? 'border-dc-ink bg-dc-yellow text-dc-ink shadow-[2px_2px_0_#111111]'
                  : day.currentMonth
                    ? 'border-transparent bg-transparent text-dc-ink hover:border-dc-ink hover:bg-dc-paper-warm'
                    : 'border-transparent bg-transparent text-dc-gray-light hover:border-dc-border hover:bg-dc-paper-warm',
                isSameDay(day.date, new Date()) && !isSameDay(day.date, selectedDate) ? 'border-dc-border' : '',
              ]"
              @focus="setActiveDate(day.date)"
              @click="chooseDate(day.date)"
            >
              {{ day.date.getDate() }}
            </button>
          </div>

          <div class="sticky bottom-0 z-10 mt-3 flex items-center justify-between border-t border-dc-border bg-dc-paper pt-3">
            <button type="button" class="font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-gray hover:text-dc-ink" @click="clearDate">
              Clear
            </button>
            <button type="button" class="font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-pink hover:text-dc-ink" @click="chooseDate(new Date())">
              Today
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
