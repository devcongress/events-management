<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

const props = defineProps<{ year: string; token: string }>();

type Material = { id: string; file_name: string; size_bytes: number };
const materials = ref<Material[]>([]);
const error = ref('');
const uploading = ref(false);
const selectedFile = ref(false);
const hasUnsavedChanges = computed(() => selectedFile.value || uploading.value);

defineExpose({ hasUnsavedChanges });
const input = ref<HTMLInputElement | null>(null);
const endpoint = `/api/conference-speaker-materials/${encodeURIComponent(props.year)}/${encodeURIComponent(props.token)}`;

async function loadMaterials() {
  try {
    const response = await fetch(endpoint);
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'Unable to load uploaded files.');
    materials.value = data.materials;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to load uploaded files.';
  }
}

async function upload() {
  const file = input.value?.files?.[0];

  if (!file) return;
  error.value = '';
  uploading.value = true;
  try {
    const body = new FormData();

    body.append('file', file);
    const response = await fetch(endpoint, { method: 'POST', body });
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'Unable to upload this file.');
    materials.value.push(data.material);
    if (input.value) input.value.value = '';
    selectedFile.value = false;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to upload this file.';
  } finally {
    uploading.value = false;
  }
}

onMounted(loadMaterials);
</script>

<template>
  <div class="space-y-2">
    <label for="speaker-material-file" class="editorial-label">Upload slides or supporting file (optional)</label>
    <p class="text-sm text-dc-gray">PDF, PPT, or PPTX, up to 5 MB per file and five files total. Files are shared privately with conference organizers.</p>
    <input id="speaker-material-file" ref="input" type="file" accept=".pdf,.ppt,.pptx" :disabled="uploading" @change="selectedFile = Boolean(input?.files?.length)" class="block w-full text-sm" />
    <button type="button" :disabled="uploading" class="rounded-md border border-dc-ink px-4 py-2 text-sm font-semibold disabled:opacity-50" @click="upload">{{ uploading ? 'Uploading…' : 'Upload file' }}</button>
    <p v-if="error" role="alert" class="text-sm text-red-700">{{ error }}</p>
    <ul v-if="materials.length" class="space-y-1 text-sm" aria-label="Uploaded files">
      <li v-for="material in materials" :key="material.id">{{ material.file_name }}</li>
    </ul>
  </div>
</template>
