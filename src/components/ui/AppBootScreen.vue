<script setup lang="ts">
withDefaults(defineProps<{
  eyebrow?: string;
  title?: string;
  copy?: string;
}>(), {
  eyebrow: 'Getting things ready',
  title: 'Opening the workspace.',
  copy: 'Checking access and restoring your place.',
});
</script>

<template>
  <section class="app-boot" role="status" aria-live="polite" aria-label="Opening DevCongress">
    <div class="app-boot__content">
      <div class="app-boot__message">
        <p class="app-boot__eyebrow">{{ eyebrow }}</p>
        <h1 class="app-boot__title">{{ title }}</h1>
        <p class="app-boot__copy">{{ copy }}</p>
        <div class="app-boot__signal" aria-hidden="true"><span /><span /><span /></div>
      </div>
    </div>
  </section>
</template>
