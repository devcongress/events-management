<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue';
import type { CSSProperties } from 'vue';
import { calculateFloatingPosition, type FloatingPlacement } from '@/src/lib/floating-placement';

type DropdownValue = string | number;

type DropdownOption = {
  value: DropdownValue;
  label: string;
  disabled?: boolean;
  note?: string;
};

const props = defineProps<{
  modelValue: DropdownValue[];
  options: DropdownOption[];
  label?: string;
  placeholder?: string;
  selectedText?: string;
  disabled?: boolean;
  menuAlign?: 'left' | 'right';
  menuClass?: string;
  teleport?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: DropdownValue[]];
}>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const menuPanel = ref<HTMLElement | null>(null);
const placement = ref<FloatingPlacement>('bottom');
const menuStyle = ref<CSSProperties>({});
const menuScrollStyle = ref<CSSProperties>({});
const dropdownId = `app-multi-select-${useId()}`;
let placementFrame: number | null = null;

const selectedCount = computed(() => props.modelValue.length);
const triggerText = computed(() => {
  if (selectedCount.value === 0) return props.placeholder ?? 'Select';
  if (props.selectedText) return props.selectedText;

  const labels = props.modelValue
    .map((value) => props.options.find((option) => option.value === value)?.label)
    .filter((label): label is string => Boolean(label));

  if (labels.length === 1) return labels[0];
  return `${selectedCount.value} selected`;
});
const estimatedMenuHeight = computed(() => {
  const optionHeight = 46;
  const menuPaddingAndFooter = 66;
  return Math.min(330, props.options.length * optionHeight + menuPaddingAndFooter);
});

function isSelected(value: DropdownValue): boolean {
  return props.modelValue.includes(value);
}

function selectedOptionShape(index: number): string {
  const previousOption = props.options[index - 1];
  const nextOption = props.options[index + 1];
  const joinsPrevious = Boolean(previousOption && isSelected(previousOption.value));
  const joinsNext = Boolean(nextOption && isSelected(nextOption.value));

  if (!joinsPrevious && !joinsNext) return 'rounded';
  if (!joinsPrevious) return 'rounded-t rounded-b-none';
  if (!joinsNext) return 'rounded-t-none rounded-b border-t border-dc-pink/10';
  return 'rounded-none border-t border-dc-pink/10';
}

function toggleValue(value: DropdownValue) {
  const option = props.options.find((item) => item.value === value);
  if (!option || option.disabled) return;

  const nextValue = isSelected(value)
    ? props.modelValue.filter((selectedValue) => selectedValue !== value)
    : [...props.modelValue, value];
  emit('update:modelValue', nextValue);
}

function clearSelection() {
  emit('update:modelValue', []);
}

function closeDropdown() {
  open.value = false;
}

function toggleDropdown() {
  if (props.disabled) return;

  if (open.value) {
    closeDropdown();
    return;
  }

  document.dispatchEvent(new CustomEvent('app-dropdown:open', { detail: { id: dropdownId } }));
  open.value = true;
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
  if (!root.value || !open.value) return;

  const rect = root.value.getBoundingClientRect();
  if (props.teleport) {
    const position = calculateFloatingPosition({
      anchor: rect,
      viewport: viewportBounds(),
      panelHeight: menuPanel.value?.scrollHeight ?? estimatedMenuHeight.value,
      preferredWidth: Math.max(rect.width, menuPanel.value?.offsetWidth ?? 176),
      align: props.menuAlign === 'right' ? 'right' : 'left',
    });
    placement.value = position.placement;
    menuStyle.value = {
      position: 'fixed',
      top: `${position.top}px`,
      left: `${position.left}px`,
      minWidth: `${rect.width}px`,
      maxWidth: 'calc(100vw - 1rem)',
    };
    menuScrollStyle.value = { maxHeight: `${Math.max(0, Math.min(256, position.maxHeight - 50))}px` };
    return;
  }

  const spacing = 8;
  const spaceBelow = window.innerHeight - rect.bottom - spacing;
  const spaceAbove = rect.top - spacing;
  placement.value = spaceBelow < estimatedMenuHeight.value && spaceAbove > spaceBelow ? 'top' : 'bottom';
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

function eventIsInsideDropdown(event: Event): boolean {
  const target = event.target as Node;
  return Boolean(root.value?.contains(target) || menuPanel.value?.contains(target));
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!eventIsInsideDropdown(event)) closeDropdown();
}

function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') closeDropdown();
}

function handleDropdownOpen(event: Event) {
  const detail = (event as CustomEvent<{ id?: string }>).detail;
  if (detail?.id !== dropdownId) closeDropdown();
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown, true);
  document.addEventListener('keydown', handleEscape);
  document.addEventListener('app-dropdown:open', handleDropdownOpen as EventListener);
  window.addEventListener('resize', schedulePlacementUpdate);
  window.addEventListener('scroll', schedulePlacementUpdate, true);
  window.visualViewport?.addEventListener('resize', schedulePlacementUpdate);
  window.visualViewport?.addEventListener('scroll', schedulePlacementUpdate);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
  document.removeEventListener('keydown', handleEscape);
  document.removeEventListener('app-dropdown:open', handleDropdownOpen as EventListener);
  window.removeEventListener('resize', schedulePlacementUpdate);
  window.removeEventListener('scroll', schedulePlacementUpdate, true);
  window.visualViewport?.removeEventListener('resize', schedulePlacementUpdate);
  window.visualViewport?.removeEventListener('scroll', schedulePlacementUpdate);
  if (placementFrame !== null) {
    window.cancelAnimationFrame(placementFrame);
  }
});

watch(open, async (isOpen) => {
  if (!isOpen) {
    placement.value = 'bottom';
    menuStyle.value = {};
    menuScrollStyle.value = {};
    return;
  }

  await nextTick();
  schedulePlacementUpdate();
});
</script>

<template>
  <div ref="root" class="relative block" :class="open ? 'z-[80]' : 'z-auto'">
    <span v-if="label" :id="`${dropdownId}-label`" class="editorial-label">{{ label }}</span>
    <button
      type="button"
      class="motion-press flex min-h-[50px] w-full items-center justify-between gap-3 rounded-md border bg-dc-paper px-4 py-3 text-left text-base font-medium text-dc-ink outline-none hover:bg-dc-paper-warm focus:border-dc-pink focus:shadow-[0_0_0_3px_rgba(232,17,127,0.14)] disabled:cursor-not-allowed disabled:opacity-50"
      :class="[
        label ? 'mt-2' : '',
        open ? 'border-dc-pink shadow-[0_0_0_3px_rgba(232,17,127,0.14)]' : 'border-dc-border',
      ]"
      :disabled="disabled"
      :aria-expanded="open"
      :aria-controls="`${dropdownId}-menu`"
      :aria-labelledby="label ? `${dropdownId}-label ${dropdownId}-value` : `${dropdownId}-value`"
      aria-haspopup="listbox"
      @click.stop="toggleDropdown"
    >
      <span :id="`${dropdownId}-value`" class="min-w-0 flex-1 truncate">{{ triggerText }}</span>
      <span
        class="motion-icon grid size-6 shrink-0 place-items-center rounded-full border border-dc-border text-dc-pink"
        :class="open ? 'rotate-180 border-dc-pink' : ''"
      >
        <svg viewBox="0 0 20 20" class="size-3.5" fill="none" aria-hidden="true">
          <path d="M5.5 8l4.5 4.5L14.5 8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
    </button>

    <Teleport to="body" :disabled="!teleport">
      <Transition name="dropdown-menu" :duration="{ enter: 180, leave: 0 }">
        <div
          v-if="open"
          :id="`${dropdownId}-menu`"
          ref="menuPanel"
          class="app-dropdown-menu min-w-0 overflow-hidden rounded-md border border-dc-border bg-white shadow-[0_18px_36px_rgba(17,17,17,0.14)]"
          :class="[
            teleport ? 'fixed z-[120]' : 'absolute z-50 w-full',
            !teleport && menuAlign === 'right' ? 'left-auto right-0' : '',
            !teleport && menuAlign !== 'right' ? 'left-0' : '',
            !teleport && placement === 'top' ? 'bottom-[calc(100%+0.5rem)]' : '',
            !teleport && placement !== 'top' ? 'top-[calc(100%+0.5rem)]' : '',
            menuClass,
          ]"
          :style="teleport ? menuStyle : undefined"
        >
        <div
          class="app-dropdown-scroll overflow-y-auto p-1.5"
          :class="teleport ? '' : 'max-h-64'"
          :style="teleport ? menuScrollStyle : undefined"
          role="listbox"
          aria-multiselectable="true"
        >
          <button
            v-for="(option, optionIndex) in options"
            :key="`${option.value}`"
            type="button"
            class="motion-colors flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-45"
            :class="[
              isSelected(option.value)
                ? `bg-dc-pink/10 text-dc-ink ${selectedOptionShape(optionIndex)}`
                : 'rounded text-dc-gray hover:bg-dc-paper-warm hover:text-dc-ink',
              option.disabled ? 'hover:bg-transparent hover:text-dc-gray' : '',
            ]"
            :disabled="option.disabled"
            role="option"
            :aria-selected="isSelected(option.value)"
            :aria-disabled="option.disabled ? 'true' : undefined"
            @click="toggleValue(option.value)"
          >
            <span
              class="grid size-5 shrink-0 place-items-center rounded border"
              :class="isSelected(option.value) ? 'border-dc-pink bg-white text-dc-pink' : 'border-dc-border bg-white'"
              aria-hidden="true"
            >
              <svg v-if="isSelected(option.value)" viewBox="0 0 20 20" class="size-3.5" fill="none">
                <path d="M4 10.5l4 4L16 5.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            <span class="min-w-0 truncate font-medium">{{ option.label }}</span>
            <span
              v-if="option.note"
              class="shrink-0 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-dc-gray"
            >
              {{ option.note }}
            </span>
          </button>
        </div>

        <div class="flex items-center justify-between gap-3 border-t border-dc-border bg-dc-paper-warm p-2">
          <button
            type="button"
            class="motion-press min-h-9 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-gray disabled:opacity-40"
            :disabled="selectedCount === 0"
            @click="clearSelection"
          >
            Clear
          </button>
          <button
            type="button"
            class="motion-press min-h-9 rounded-md border border-dc-pink bg-dc-pink px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-white"
            @click="closeDropdown"
          >
            Done
          </button>
        </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
