<script setup lang="ts">
withDefaults(defineProps<{
  busy: boolean;
  progress: number | null;
  status: string;
  error?: string;
  label?: string;
}>(), { error: '', label: 'Upload progress' });
</script>

<template>
  <div class="upload-status">
    <span role="status" aria-live="polite" :class="{ 'upload-status__error': error }">{{ error || status }}<template v-if="busy && progress !== null && progress < 100"> {{ progress }}%</template></span>
    <div v-if="busy" class="upload-status__track" role="progressbar" :aria-label="label"
      :aria-valuenow="progress ?? undefined" aria-valuemin="0" aria-valuemax="100">
      <span class="upload-status__fill" :class="{ 'upload-status__fill--unknown': progress === null }"
        :style="progress === null ? undefined : { transform: 'scaleX(' + progress / 100 + ')' }" />
    </div>
  </div>
</template>

<style scoped>
.upload-status {
  display: grid;
  align-content: start;
  min-height: 1.875rem;
  gap: 0.25rem;
  color: #555;
  font-size: 0.875rem;
  line-height: 1.25rem;
}

.upload-status__track {
  height: 0.375rem;
  border-radius: 6px;
  overflow: hidden;
  background: #e0ddd4;
}

.upload-status__fill {
  display: block;
  height: 100%;
  background: #e8117f;
  transform-origin: left;
}

.upload-status__fill--unknown {
  background-image: repeating-linear-gradient(120deg, #e8117f 0 5px, #fbd7e9 5px 10px);
}

.upload-status__error {
  color: #b91c1c;
}
</style>
