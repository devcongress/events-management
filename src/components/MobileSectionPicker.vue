<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import AppDropdown from '@/src/components/AppDropdown.vue';

defineProps<{
  modelValue: string;
  label: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const phone = ref(false);
let media: MediaQueryList | undefined;

function syncPhone() {
  phone.value = media?.matches ?? false;
}

onMounted(() => {
  media = window.matchMedia('(max-width: 767px)');
  syncPhone();
  media.addEventListener('change', syncPhone);
});

onUnmounted(() => {
  media?.removeEventListener('change', syncPhone);
});
</script>

<template>
  <AppDropdown
    v-if="phone"
    class="min-w-0 w-full"
    :model-value="modelValue"
    :label="label"
    :options="options"
    density="compact"
    :teleport="true"
    menu-class="phone-section-picker-menu"
    trigger-class="min-h-11"
    @update:model-value="emit('update:modelValue', String($event))"
  />
</template>

<style>
.phone-section-picker-menu .app-dropdown-option:focus-visible {
  outline: 2px solid var(--dc-pink, #e8117f);
  outline-offset: -2px;
}
</style>
