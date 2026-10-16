<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { annualConferencePath } from '@/src/annual-conference';

const props = defineProps<{
  active: 'registration' | 'check-in';
  canManageRegistration: boolean;
  canCheckIn: boolean;
}>();

const route = useRoute();
const year = computed(() => String(route.params.year ?? '2026'));
const tabs = computed(() => [
  ...(props.canManageRegistration
    ? [{ key: 'registration' as const, label: 'Registration', href: annualConferencePath('registrations', year.value) }]
    : []),
  ...(props.canCheckIn
    ? [{ key: 'check-in' as const, label: 'Check-in', href: annualConferencePath('check-in', year.value) }]
    : []),
]);
</script>

<template>
  <section class="registration-section-nav" aria-label="Registration workspace">
    <p class="editorial-eyebrow">Registration</p>
    <nav class="registration-section-tabs" aria-label="Registration sections">
      <RouterLink
        v-for="tab in tabs"
        :key="tab.key"
        :to="tab.href"
        class="registration-section-tab"
        :class="{ 'registration-section-tab--active': active === tab.key }"
        :aria-current="active === tab.key ? 'page' : undefined"
      >
        {{ tab.label }}
      </RouterLink>
    </nav>
  </section>
</template>

<style scoped>
.registration-section-nav {
  display: grid;
  gap: 8px;
  margin: -12px 0 20px;
  border-bottom: 1px solid var(--dc-border, #d1cec5);
}

.registration-section-nav > p {
  margin: 0;
}

.registration-section-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.registration-section-tab {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  border-bottom: 3px solid transparent;
  padding: 0 12px 8px;
  color: var(--dc-gray, #555555);
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
}

.registration-section-tab--active {
  border-color: var(--dc-pink, #e5007d);
  color: var(--dc-ink, #111111);
}
</style>
