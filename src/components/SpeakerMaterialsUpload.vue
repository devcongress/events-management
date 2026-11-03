<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { uploadMultipart } from '@/src/lib/upload-multipart';

const props = defineProps<{ year: string; token: string }>();

type Material = { id: string; file_name: string; size_bytes: number };
const materials = ref<Material[]>([]);
const loadingMaterials = ref(true);
const materialsLoaded = ref(false);
const error = ref('');
const message = ref('');
const uploading = ref(false);
const selectedFile = ref<File | null>(null);
const progress = ref<number | null>(null);
const hasUnsavedChanges = computed(() => selectedFile.value !== null || uploading.value);

defineExpose({ hasUnsavedChanges });

const input = ref<HTMLInputElement | null>(null);
const endpoint = `/api/conference-speaker-materials/${encodeURIComponent(props.year)}/${encodeURIComponent(props.token)}`;
const maxBytes = 5 * 1024 * 1024;
const mimeTypes: Record<string, string> = {
  pdf: 'application/pdf',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const validationError = computed(() => {
  const file = selectedFile.value;

  if (!file) return '';
  const extension = file.name.toLowerCase().match(/\.(pdf|ppt|pptx)$/)?.[1];

  if (!extension || (file.type && file.type !== mimeTypes[extension] && file.type !== 'application/octet-stream')) return 'Choose a PDF, PPT, or PPTX file.';
  if (file.size === 0 || file.size > maxBytes) return 'Choose a nonempty file no larger than 5 MB.';

  return '';
});

function selectFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null;

  selectedFile.value = file;
  error.value = '';
  message.value = '';
}

async function loadMaterials() {
  loadingMaterials.value = true;
  error.value = '';
  try {
    const response = await fetch(endpoint);
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'Unable to load uploaded files.');
    materials.value = data.materials;
    materialsLoaded.value = true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to load uploaded files.';
  } finally {
    loadingMaterials.value = false;
  }
}

async function upload() {
  const file = selectedFile.value;

  if (!file || validationError.value || !materialsLoaded.value || materials.value.length >= 5) return;
  error.value = '';
  message.value = '';
  progress.value = null;
  uploading.value = true;
  try {
    const body = new FormData();

    body.append('file', file);
    const data = await uploadMultipart<{ material: Material }>(endpoint, body, {
      onProgress: (percent) => { progress.value = percent; },
    });

    materials.value.push(data.material);
    if (input.value) input.value.value = '';
    selectedFile.value = null;
    message.value = 'File uploaded.';
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to upload this file.';
  } finally {
    uploading.value = false;
  }
}

onMounted(loadMaterials);
</script>

<template>
  <div class="speaker-materials">
    <label for="speaker-material-file" class="editorial-label">Upload slides or supporting file (optional)</label>
    <p class="speaker-materials__hint">PDF, PPT or PPTX · up to 5 MB each<span v-if="materialsLoaded"> · {{ materials.length }} of 5 files uploaded</span></p>
    <p class="speaker-materials__hint">Files are shared privately with conference organizers.</p>
    <div class="speaker-materials__controls">
      <input id="speaker-material-file" ref="input" class="speaker-upload-input" type="file" accept=".pdf,.ppt,.pptx" :disabled="uploading || !materialsLoaded || materials.length >= 5" @change="selectFile" />
      <button type="button" :disabled="uploading || !materialsLoaded || !selectedFile || Boolean(validationError) || materials.length >= 5" @click="upload">
        {{ uploading ? 'Uploading…' : 'Upload file' }}
      </button>
    </div>
    <div v-if="uploading" class="speaker-materials__progress" role="status" aria-live="polite">
      <span>{{ progress === 100 ? 'Upload complete. Saving file…' : progress === null ? 'Uploading file…' : `Uploading file… ${progress}%` }}</span>
      <progress :value="progress === null ? undefined : progress" max="100" aria-label="File upload progress" />
    </div>
    <p v-if="loadingMaterials" class="speaker-materials__hint" role="status">Loading uploaded files…</p>
    <button v-else-if="!materialsLoaded" type="button" class="speaker-materials__retry" @click="loadMaterials">Retry loading files</button>
    <p v-if="materials.length >= 5" class="speaker-materials__hint">You have reached the five-file limit.</p>
    <p v-if="validationError || error" role="alert" class="speaker-materials__error">{{ validationError || error }}</p>
    <p v-if="message" role="status" class="speaker-materials__message">{{ message }}</p>
    <ul v-if="materials.length" aria-label="Uploaded files" class="speaker-materials__list">
      <li v-for="material in materials" :key="material.id">{{ material.file_name }}</li>
    </ul>
  </div>
</template>

<style scoped>
.speaker-materials {
  min-width: 0;
}

.speaker-materials__hint {
  color: #555;
  font-size: 0.875rem;
  line-height: 1.5;
}

.speaker-materials__controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.speaker-materials__controls input {
  min-width: 0;
  max-width: 100%;
  font-size: 0.875rem;
}

.speaker-materials__controls button,
.speaker-materials__retry {
  min-height: 44px;
  padding: 0.5rem 1rem;
  border: 1px solid #111;
  border-radius: 6px;
  font-weight: 600;
}

.speaker-materials__controls button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.speaker-materials__progress {
  display: grid;
  gap: 0.25rem;
  max-width: 22rem;
  margin-top: 0.75rem;
  font-size: 0.875rem;
}

.speaker-materials__progress progress {
  width: 100%;
  accent-color: #e8117f;
}

.speaker-materials__error,
.speaker-materials__message {
  margin-top: 0.5rem;
  font-size: 0.875rem;
}

.speaker-materials__error {
  color: #b91c1c;
}

.speaker-materials__message {
  color: #166534;
}

.speaker-materials__list {
  display: grid;
  gap: 0.25rem;
  margin-top: 0.75rem;
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}
</style>
