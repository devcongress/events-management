<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue';
import type { CSSProperties } from 'vue';
import { calculateFloatingPosition, type FloatingPlacement } from '@/src/lib/floating-placement';

type DropdownValue = string | number;

type DropdownOption = {
  value: DropdownValue;
  label: string;
  disabled?: boolean;
};

let activeDropdownId: string | null = null;

const props = defineProps<{
  modelValue: DropdownValue;
  options: DropdownOption[];
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  density?: 'default' | 'compact' | 'slim';
  menuAlign?: 'left' | 'right';
  menuClass?: string;
  teleport?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: DropdownValue];
}>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const menuPanel = ref<HTMLElement | null>(null);
const placement = ref<FloatingPlacement>('bottom');
const menuStyle = ref<CSSProperties>({});
const menuScrollStyle = ref<CSSProperties>({});
const dropdownId = `app-dropdown-${useId()}`;
let placementFrame: number | null = null;

const estimatedMenuHeight = computed(() => {
  const optionHeight = 42;
  const menuPadding = 12;
  return Math.min(288, props.options.length * optionHeight + menuPadding);
});

const selectedLabel = computed(() => {
  const exactOption = props.options.find((option) => option.value === props.modelValue);
  return exactOption?.label ?? props.placeholder ?? props.options[0]?.label ?? 'Select';
});
const triggerClasses = computed(() => {
  if (props.density === 'slim') return 'min-h-8 px-2.5 py-1.5 text-xs';
  if (props.density === 'compact') return 'min-h-10 px-3 py-2 text-sm';
  return 'min-h-[50px] px-4 py-3 text-base';
});
const optionClasses = computed(() => props.density === 'slim'
  ? 'px-2.5 py-1.5 text-xs'
  : props.density === 'compact'
    ? 'px-2.5 py-2 text-sm'
    : 'px-3 py-2.5 text-sm');
const iconClasses = computed(() => props.density === 'slim'
  ? 'size-4'
  : props.density === 'compact'
    ? 'size-5'
    : 'size-6');

function choose(value: DropdownValue) {
  const option = props.options.find((item) => item.value === value);
  if (option?.disabled) return;

  emit('update:modelValue', value);
  closeDropdown();
}

function closeDropdown() {
  open.value = false;
  if (placementFrame !== null) {
    window.cancelAnimationFrame(placementFrame);
    placementFrame = null;
  }
  if (activeDropdownId === dropdownId) {
    activeDropdownId = null;
  }
}

function toggle() {
  if (props.disabled) return;

  if (open.value) {
    closeDropdown();
  } else {
    document.dispatchEvent(new CustomEvent('app-dropdown:open', { detail: { id: dropdownId } }));
    activeDropdownId = dropdownId;
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
  if (!root.value || !open.value) return;

  const rect = root.value.getBoundingClientRect();
  if (!props.teleport) {
    const viewport = viewportBounds();
    const viewportBottom = viewport.top + viewport.height;
    const spacing = 8;
    const spaceBelow = viewportBottom - rect.bottom - spacing;
    const spaceAbove = rect.top - viewport.top - spacing;
    placement.value = spaceBelow < estimatedMenuHeight.value && spaceAbove > spaceBelow ? 'top' : 'bottom';
    return;
  }

  const naturalWidth = Math.max(rect.width, menuPanel.value?.offsetWidth ?? 176);
  const position = calculateFloatingPosition({
    anchor: rect,
    viewport: viewportBounds(),
    panelHeight: menuPanel.value?.scrollHeight ?? estimatedMenuHeight.value,
    preferredWidth: naturalWidth,
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
  menuScrollStyle.value = {
    maxHeight: `${Math.max(0, Math.min(256, position.maxHeight - 12))}px`,
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

function eventIsInsideDropdown(event: Event): boolean {
  const target = event.target as Node;
  return Boolean(root.value?.contains(target) || menuPanel.value?.contains(target));
}

function handleDocumentClick(event: MouseEvent) {
  if (eventIsInsideDropdown(event)) return;
  closeDropdown();
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (eventIsInsideDropdown(event)) return;
  closeDropdown();
}

function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeDropdown();
  }
}

function handleDropdownOpen(event: Event) {
  const detail = (event as CustomEvent<{ id?: string }>).detail;
  if (detail?.id !== dropdownId) {
    closeDropdown();
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown, true);
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleEscape);
  document.addEventListener('app-dropdown:open', handleDropdownOpen as EventListener);
  window.addEventListener('resize', schedulePlacementUpdate);
  window.addEventListener('scroll', schedulePlacementUpdate, true);
  window.visualViewport?.addEventListener('resize', schedulePlacementUpdate);
  window.visualViewport?.addEventListener('scroll', schedulePlacementUpdate);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
  document.removeEventListener('click', handleDocumentClick);
  document.removeEventListener('keydown', handleEscape);
  document.removeEventListener('app-dropdown:open', handleDropdownOpen as EventListener);
  window.removeEventListener('resize', schedulePlacementUpdate);
  window.removeEventListener('scroll', schedulePlacementUpdate, true);
  window.visualViewport?.removeEventListener('resize', schedulePlacementUpdate);
  window.visualViewport?.removeEventListener('scroll', schedulePlacementUpdate);
  if (placementFrame !== null) {
    window.cancelAnimationFrame(placementFrame);
  }
  if (activeDropdownId === dropdownId) {
    activeDropdownId = null;
  }
});

watch(open, async (isOpen) => {
  if (isOpen) {
    await nextTick();
    schedulePlacementUpdate();
  } else {
    placement.value = 'bottom';
    menuStyle.value = {};
    menuScrollStyle.value = {};
    if (activeDropdownId === dropdownId) {
      activeDropdownId = null;
    }
  }
});
</script>

<template>
  <div ref="root" class="relative block" :class="open ? 'z-[80]' : 'z-auto'">
    <span v-if="label" :id="`${dropdownId}-label`" class="editorial-label">{{ label }}</span>
    <button
      type="button"
      class="motion-press flex w-full items-center justify-between gap-3 rounded-md border bg-dc-paper text-left font-medium text-dc-ink outline-none hover:bg-dc-paper-warm focus:border-dc-pink focus:shadow-[0_0_0_3px_rgba(17,17,17,0.16)] disabled:cursor-not-allowed disabled:opacity-50"
      :class="[
        triggerClasses,
        label ? 'mt-2' : '',
        open ? 'border-dc-pink shadow-[0_0_0_3px_rgba(17,17,17,0.16)]' : 'border-dc-border',
      ]"
      :disabled="disabled"
      :aria-expanded="open"
      :aria-controls="`${dropdownId}-menu`"
      :aria-labelledby="label ? `${dropdownId}-label ${dropdownId}-value` : `${dropdownId}-value`"
      :aria-required="required ? 'true' : undefined"
      aria-haspopup="listbox"
      @click.stop="toggle"
    >
      <span :id="`${dropdownId}-value`" class="min-w-0 truncate">{{ selectedLabel }}</span>
      <span class="motion-icon grid shrink-0 place-items-center rounded-full border border-dc-border text-dc-pink" :class="[iconClasses, open ? 'rotate-180 border-dc-pink' : '']">
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
          class="app-dropdown-menu min-w-44 overflow-hidden rounded-md border border-dc-border bg-white shadow-[0_18px_36px_rgba(17,17,17,0.14)]"
          :class="[
            teleport ? 'fixed z-[120]' : 'absolute z-50 w-full',
            !teleport && menuAlign === 'right' ? 'left-auto right-0' : '',
            !teleport && menuAlign !== 'right' ? 'left-0' : '',
            !teleport && placement === 'top' ? 'bottom-[calc(100%+0.5rem)]' : '',
            !teleport && placement !== 'top' ? 'top-[calc(100%+0.5rem)]' : '',
            menuClass,
          ]"
          :data-placement="placement"
          :style="teleport ? menuStyle : undefined"
        >
          <div
            class="app-dropdown-scroll overflow-y-auto p-1.5"
            :class="teleport ? '' : 'max-h-64'"
            :style="teleport ? menuScrollStyle : undefined"
            role="listbox"
          >
            <button
              v-for="option in options"
              :key="`${option.value}`"
              type="button"
              class="motion-colors flex w-full items-center gap-2.5 rounded text-left disabled:cursor-not-allowed disabled:opacity-45"
              :class="[
                optionClasses,
                modelValue === option.value ? 'bg-dc-yellow text-dc-ink' : 'text-dc-gray hover:bg-dc-paper-warm hover:text-dc-ink',
                option.disabled ? 'hover:bg-transparent hover:text-dc-gray' : '',
              ]"
              :disabled="option.disabled"
              role="option"
              :aria-selected="modelValue === option.value"
              :aria-disabled="option.disabled ? 'true' : undefined"
              @click="choose(option.value)"
            >
              <span class="grid size-4 shrink-0 place-items-center">
                <svg v-if="modelValue === option.value" viewBox="0 0 20 20" class="size-4" fill="none" aria-hidden="true">
                  <path d="M4 10.5l4 4L16 5.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
              <span class="truncate font-medium">{{ option.label }}</span>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
