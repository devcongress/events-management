<script setup lang="ts">
import { computed } from 'vue';
import { ALL_REGISTRATION_INITIALS } from '@/src/lib/registration-checkin';

const props = defineProps<{
  modelValue: string;
  initials: string[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const options = computed(() => [ALL_REGISTRATION_INITIALS, ...props.initials]);

function optionLabel(option: string): string {
  return option === ALL_REGISTRATION_INITIALS ? 'All' : option;
}
</script>

<template>
  <div class="registration-alphabet">
    <p class="registration-alphabet-label">First letter</p>
    <div class="registration-alphabet-rail" role="group" aria-label="Filter guests by first letter">
      <button
        v-for="option in options"
        :key="option"
        type="button"
        class="registration-alphabet-option"
        :class="{ 'registration-alphabet-option--active': modelValue === option }"
        :aria-pressed="modelValue === option"
        :aria-label="option === ALL_REGISTRATION_INITIALS ? 'Show all guests' : `Show guests whose names start with ${option}`"
        @click="emit('update:modelValue', option)"
      >
        {{ optionLabel(option) }}
      </button>
    </div>
  </div>
</template>
