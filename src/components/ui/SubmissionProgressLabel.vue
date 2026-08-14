<script setup lang="ts">
defineProps<{
  stage: 'checking' | 'submitting';
}>();
</script>

<template>
  <span class="submission-progress-label">
    <span>{{ stage === 'checking' ? 'Checking email' : 'Submitting' }}</span>
    <span class="submission-progress-dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  </span>
</template>

<style scoped>
.submission-progress-label,
.submission-progress-dots {
  display: inline-flex;
  align-items: center;
}

.submission-progress-label {
  justify-content: center;
  gap: 0.42rem;
}

.submission-progress-dots {
  gap: 0.2rem;
}

.submission-progress-dots > span {
  width: 0.28rem;
  height: 0.28rem;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.55;
  animation: submission-progress-dot 240ms cubic-bezier(0.4, 0, 0.2, 1) infinite alternate;
}

.submission-progress-dots > span:nth-child(2) {
  animation-delay: 80ms;
}

.submission-progress-dots > span:nth-child(3) {
  animation-delay: 160ms;
}

@keyframes submission-progress-dot {
  to {
    opacity: 1;
    transform: translateY(-0.18rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .submission-progress-dots > span {
    opacity: 1;
    animation: none;
    transform: none;
  }
}
</style>
