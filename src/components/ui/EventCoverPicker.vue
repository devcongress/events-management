<script setup lang="ts">
import { onUnmounted, ref, useId, watch } from 'vue';
import {
  formatFileSize,
  IMAGE_UPLOAD_ACCEPT,
  SOURCE_IMAGE_MAX_BYTES,
  validateMeetupImageFile,
} from '@/src/lib/meetup-media-client';

const props = withDefaults(defineProps<{
  modelValue: string;
  selectedFile: File | null;
  disabled?: boolean;
}>(), {
  disabled: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:selectedFile': [value: File | null];
}>();

const inputId = `event-cover-${useId()}`;
const fileInput = ref<HTMLInputElement | null>(null);
const previewUrl = ref('');
const fileError = ref<string | null>(null);

function revokePreview() {
  if (!previewUrl.value) return;
  URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = '';
}

watch(() => props.selectedFile, (file) => {
  revokePreview();
  if (file) {
    previewUrl.value = URL.createObjectURL(file);
  }
}, { immediate: true });

onUnmounted(revokePreview);

function clearFileSelection() {
  emit('update:selectedFile', null);
  fileError.value = null;
  if (fileInput.value) {
    fileInput.value.value = '';
  }
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  if (!file) return;

  const validationError = validateMeetupImageFile(file);
  if (validationError) {
    fileError.value = validationError;
    input.value = '';
    return;
  }

  fileError.value = null;
  emit('update:modelValue', '');
  emit('update:selectedFile', file);
}

function handleUrlInput(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  emit('update:modelValue', value);
  if (value && props.selectedFile) {
    clearFileSelection();
  }
}
</script>

<template>
  <div>
    <span class="editorial-label">Cover image</span>
    <div class="mt-2 rounded-md border-2 border-dc-ink bg-dc-paper">
      <div class="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div class="grid aspect-[16/9] w-full shrink-0 place-items-center overflow-hidden rounded-md border border-dc-border bg-dc-paper-warm sm:w-32">
          <img
            v-if="previewUrl"
            :src="previewUrl"
            alt=""
            class="size-full object-cover"
          >
          <svg v-else viewBox="0 0 24 24" class="size-7 text-dc-gray-light" fill="none" aria-hidden="true">
            <path d="M4 6.75A1.75 1.75 0 0 1 5.75 5h12.5A1.75 1.75 0 0 1 20 6.75v10.5A1.75 1.75 0 0 1 18.25 19H5.75A1.75 1.75 0 0 1 4 17.25V6.75Z" stroke="currentColor" stroke-width="1.7" />
            <path d="m5 16 4.1-4.1a1.25 1.25 0 0 1 1.77 0l1.6 1.6 1.16-1.16a1.25 1.25 0 0 1 1.77 0L19 15.94M15.75 9.25h.01" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>

        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-bold text-dc-ink">
            {{ selectedFile?.name ?? 'Choose an event cover from your computer' }}
          </p>
          <p class="mt-1 text-xs leading-5 text-dc-gray">
            <template v-if="selectedFile">
              {{ formatFileSize(selectedFile.size) }} · ready to compress and upload
            </template>
            <template v-else>
              AVIF, JPG, PNG or WebP · up to {{ formatFileSize(SOURCE_IMAGE_MAX_BYTES) }}
            </template>
          </p>
          <div class="mt-3 flex flex-wrap items-center gap-3">
            <label
              :for="inputId"
              class="motion-press inline-flex min-h-10 cursor-pointer items-center justify-center rounded-md border-2 border-dc-ink bg-dc-yellow px-4 font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-ink shadow-[2px_2px_0_#111111]"
              :class="disabled ? 'pointer-events-none opacity-50' : ''"
            >
              {{ selectedFile ? 'Replace image' : 'Choose image' }}
            </label>
            <button
              v-if="selectedFile"
              type="button"
              class="font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray hover:text-dc-pink disabled:opacity-50"
              :disabled="disabled"
              @click="clearFileSelection"
            >
              Remove
            </button>
          </div>
          <input
            :id="inputId"
            ref="fileInput"
            type="file"
            class="sr-only"
            :accept="IMAGE_UPLOAD_ACCEPT"
            :disabled="disabled"
            :aria-describedby="`${inputId}-help`"
            @change="handleFileChange"
          >
        </div>
      </div>

      <div class="border-t border-dc-border bg-dc-paper-warm p-3">
        <label :for="`${inputId}-url`" class="font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray">
          Or use an image URL
        </label>
        <input
          :id="`${inputId}-url`"
          :value="modelValue"
          type="text"
          inputmode="url"
          class="editorial-input mt-2 bg-white"
          placeholder="https://… or /images/…"
          :disabled="disabled"
          @input="handleUrlInput"
        >
      </div>
    </div>
    <p :id="`${inputId}-help`" class="mt-2 text-xs leading-5 text-dc-gray">
      Large images are resized to a 1600px edge and compressed to roughly 2MB before upload.
    </p>
    <p v-if="fileError" class="mt-1 text-sm font-semibold text-red-700" role="alert">{{ fileError }}</p>
  </div>
</template>
