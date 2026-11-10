<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = defineProps<{ year: string | number; submissionId: string }>();

type Material = { id: string; file_name: string };
const materials = ref<Material[]>([]);
const error = ref('');
const loading = ref(true);
const endpoint = computed(() => `/api/annual-conference/${encodeURIComponent(String(props.year))}/speaker-submissions/${encodeURIComponent(props.submissionId)}/materials`);

watch(endpoint, async (url) => {
  materials.value = [];
  error.value = '';
  loading.value = true;
  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'Unable to load files.');
    materials.value = data.materials;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to load files.';
  } finally {
    loading.value = false;
  }
}, { immediate: true });
</script>

<template>
  <div class="space-y-2">
    <p class="editorial-label">Uploaded files</p>
    <p v-if="loading" class="text-sm text-dc-gray">Loading files…</p>
    <p v-else-if="error" class="text-sm text-red-700">{{ error }}</p>
    <ul v-else-if="materials.length" class="space-y-1 text-sm">
      <li v-for="material in materials" :key="material.id"><a :href="`${endpoint}/${encodeURIComponent(material.id)}`" class="text-dc-pink underline">{{ material.file_name }}</a></li>
    </ul>
    <p v-else class="text-sm text-dc-gray">No files uploaded.</p>
  </div>
</template>
