<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { uploadMultipart } from '@/src/lib/upload-multipart';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import SpeakerUploadStatus from '@/src/components/SpeakerUploadStatus.vue';

const props = defineProps<{ year: string; token: string }>();

type Material = { id: string; file_name: string; size_bytes: number };
const materials = ref<Material[]>([]);
const loadingMaterials = ref(true);
const materialsLoaded = ref(false);
const error = ref('');
const message = ref('');
const uploading = ref(false);
const removingId = ref<string | null>(null);
const removalTarget = ref<Material | null>(null);
const selectedFile = ref<File | null>(null);
const progress = ref<number | null>(null);
const hasUnsavedChanges = computed(() => selectedFile.value !== null || uploading.value || removingId.value !== null);

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

function clearFile() {
  selectedFile.value = null;
  if (input.value) input.value.value = '';
  error.value = '';
  message.value = '';
}

async function removeMaterial() {
  const material = removalTarget.value;

  if (!material || removingId.value || uploading.value) return;
  removingId.value = material.id;
  error.value = '';
  message.value = '';
  let removed = false;

  try {
    const response = await fetch(`${endpoint}/${encodeURIComponent(material.id)}`, { method: 'DELETE' });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) throw new Error(data.error || 'Unable to remove this file.');
    materials.value = materials.value.filter((item) => item.id !== material.id);
    removalTarget.value = null;
    message.value = 'File removed.';
    removed = true;
  } catch (cause) {
    removalTarget.value = null;
    error.value = cause instanceof Error ? cause.message : 'Unable to remove this file.';
  } finally {
    removingId.value = null;
    if (removed) {
      await nextTick();
      input.value?.focus();
    }
  }
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
      <input id="speaker-material-file" ref="input" class="speaker-upload-input" type="file" accept=".pdf,.ppt,.pptx" :disabled="uploading || Boolean(removingId) || !materialsLoaded || materials.length >= 5" @change="selectFile" />
      <button type="button" :disabled="uploading || Boolean(removingId) || !materialsLoaded || !selectedFile || Boolean(validationError) || materials.length >= 5" @click="upload">
        Upload file
      </button>
      <button v-if="selectedFile" type="button" :disabled="uploading || Boolean(removingId)" @click="clearFile">Clear selection</button>
    </div>
    <p v-if="validationError && (message || error)" role="alert" class="text-sm text-red-700">{{ validationError }}</p>
    <SpeakerUploadStatus
      label="File upload progress"
      :busy="uploading"
      :progress="progress"
      :status="uploading ? (progress === 100 ? 'Saving file…' : 'Uploading file…') : message"
      :error="error || (message ? '' : validationError)"
    />
    <p v-if="loadingMaterials" class="speaker-materials__hint" role="status">Loading uploaded files…</p>
    <button v-else-if="!materialsLoaded" type="button" class="speaker-materials__retry" @click="loadMaterials">Retry loading files</button>
    <p v-if="materials.length >= 5" class="speaker-materials__hint">You have reached the five-file limit.</p>
    <ul v-if="materials.length" aria-label="Uploaded files" class="speaker-materials__list">
      <li v-for="material in materials" :key="material.id">
        <span>{{ material.file_name }}</span>
        <button type="button" :disabled="uploading || Boolean(removingId)" :aria-label="`Remove ${material.file_name}`" @click="removalTarget = material">Remove</button>
      </li>
    </ul>
    <ConfirmDialog
      :open="Boolean(removalTarget)"
      title="Remove uploaded file?"
      :message="`Remove ${removalTarget?.file_name || 'this file'} from your speaker workspace? The organizers will no longer have access to it.`"
      confirm-label="Remove file"
      busy-label="Removing…"
      :busy="Boolean(removingId)"
      danger
      mobile-sheet
      @cancel="removalTarget = null"
      @confirm="removeMaterial"
    />
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

.speaker-materials__list {
  display: grid;
  gap: 0.25rem;
  margin-top: 0.75rem;
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}

.speaker-materials__list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.speaker-materials__list li span {
  min-width: 0;
}

.speaker-materials__list button {
  min-height: 44px;
  flex-shrink: 0;
  color: #b91c1c;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.speaker-materials__list button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
</style>
