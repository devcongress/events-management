<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

type DropdownValue = string | number;

type DropdownOption = {
  value: DropdownValue;
  label: string;
};

let dropdownInstanceCount = 0;
let activeDropdownId: string | null = null;

const props = defineProps<{
  modelValue: DropdownValue;
  options: DropdownOption[];
  label?: string;
  disabled?: boolean;
  menuClass?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: DropdownValue];
}>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const placement = ref<'bottom' | 'top'>('bottom');
const dropdownId = `app-dropdown-${++dropdownInstanceCount}`;

const estimatedMenuHeight = computed(() => {
  const optionHeight = 42;
  const menuPadding = 12;
  return Math.min(288, props.options.length * optionHeight + menuPadding);
});

const selectedOption = computed(() => {
  return props.options.find((option) => option.value === props.modelValue) ?? props.options[0] ?? null;
});

function choose(value: DropdownValue) {
  emit('update:modelValue', value);
  closeDropdown();
}

function closeDropdown() {
  open.value = false;
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

function updatePlacement() {
  if (!root.value || !open.value) return;

  const rect = root.value.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const spacing = 8;
  const spaceBelow = viewportHeight - rect.bottom - spacing;
  const spaceAbove = rect.top - spacing;

  placement.value = spaceBelow < estimatedMenuHeight.value && spaceAbove > spaceBelow ? 'top' : 'bottom';
}

function handleDocumentClick(event: MouseEvent) {
  if (root.value?.contains(event.target as Node)) {
    return;
  }
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
    open.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleEscape);
  document.addEventListener('app-dropdown:open', handleDropdownOpen as EventListener);
  window.addEventListener('resize', updatePlacement);
  window.addEventListener('scroll', updatePlacement, true);
});

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick);
  document.removeEventListener('keydown', handleEscape);
  document.removeEventListener('app-dropdown:open', handleDropdownOpen as EventListener);
  window.removeEventListener('resize', updatePlacement);
  window.removeEventListener('scroll', updatePlacement, true);
  if (activeDropdownId === dropdownId) {
    activeDropdownId = null;
  }
});

watch(open, async (isOpen) => {
  if (isOpen) {
    await nextTick();
    updatePlacement();
  } else {
    placement.value = 'bottom';
    if (activeDropdownId === dropdownId) {
      activeDropdownId = null;
    }
  }
});
</script>

<template>
  <div ref="root" class="relative block" :class="open ? 'z-[80]' : 'z-auto'">
    <span v-if="label" class="editorial-label">{{ label }}</span>
    <button
      type="button"
      class="motion-press flex min-h-[50px] w-full items-center justify-between gap-3 rounded-md border-2 bg-dc-paper px-4 py-3 text-left text-dc-ink outline-none hover:bg-dc-paper-warm focus:border-dc-pink focus:shadow-[0_0_0_3px_rgba(232,17,127,0.14)] disabled:cursor-not-allowed disabled:opacity-50"
      :class="[
        label ? 'mt-2' : '',
        open ? 'border-dc-pink shadow-[0_0_0_3px_rgba(232,17,127,0.14)]' : 'border-dc-ink',
      ]"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click.stop="toggle"
    >
      <span class="min-w-0 truncate">{{ selectedOption?.label }}</span>
      <span class="motion-icon grid size-6 shrink-0 place-items-center rounded-full border border-dc-ink text-dc-pink" :class="open ? 'rotate-180' : ''">
        <svg viewBox="0 0 20 20" class="size-4" fill="none" aria-hidden="true">
          <path d="M5 8l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
    </button>

    <Transition name="dropdown-menu" :duration="{ enter: 180, leave: 0 }">
      <div
        v-if="open"
        class="app-dropdown-menu absolute left-0 z-50 w-full overflow-hidden rounded-lg border-2 border-dc-ink bg-dc-paper shadow-[3px_3px_0_#111111]"
        :class="[
          placement === 'top' ? 'bottom-[calc(100%+0.5rem)]' : 'top-[calc(100%+0.5rem)]',
          menuClass,
        ]"
        :data-placement="placement"
      >
        <div class="max-h-72 overflow-y-auto p-1.5" role="listbox">
          <button
            v-for="option in options"
            :key="`${option.value}`"
            type="button"
            class="motion-colors flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm"
            :class="modelValue === option.value ? 'bg-dc-yellow text-dc-ink' : 'text-dc-gray hover:bg-dc-paper-warm hover:text-dc-ink'"
            role="option"
            :aria-selected="modelValue === option.value"
            @click="choose(option.value)"
          >
            <span class="grid size-4 shrink-0 place-items-center">
              <svg v-if="modelValue === option.value" viewBox="0 0 20 20" class="size-4" fill="none" aria-hidden="true">
                <path d="M4 10.5l4 4L16 5.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            <span class="truncate font-semibold">{{ option.label }}</span>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
