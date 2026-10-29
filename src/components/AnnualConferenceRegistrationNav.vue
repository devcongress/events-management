<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { annualConferencePath } from '@/src/annual-conference';
import WorkspaceSectionNav from '@/src/components/WorkspaceSectionNav.vue';

const props = defineProps<{
  active: 'summary' | 'guests' | 'form' | 'emails' | 'blasts' | 'community';
  canManageRegistration: boolean;
  canCheckIn: boolean;
  canManageCommunity?: boolean;
}>();
const route = useRoute();
const year = computed(() => String(route.params.year ?? '2026'));
const tabs = computed(() => [
  ...(props.canManageRegistration ? [
    { key: 'summary', label: 'Summary', icon: 'summary' },
    { key: 'guests', label: 'Guests', icon: 'guests' },
    { key: 'form', label: 'Form & capacity', icon: 'form' },
    { key: 'emails', label: 'Emails', icon: 'emails' },
    ...(props.canManageCommunity ? [{ key: 'community', label: 'Community seats', icon: 'community' }] : []),
    { key: 'blasts', label: 'Blasts', icon: 'blasts' },
  ] : []),
  ...(!props.canManageRegistration && props.canCheckIn ? [{ key: 'guests', label: 'Guests', icon: 'guests' }] : []),
]);
const sectionItems = computed(() => tabs.value.map(tab => ({
  ...tab,
  to: !props.canManageRegistration
    ? annualConferencePath('check-in', year.value)
    : { path: annualConferencePath('registrations', year.value), query: { section: tab.key } },
})));
</script>

<template>
  <header class="registration-page-header">
    <h1>Registration</h1>
    <p>Manage capacity, guests, and confirmations for DevCon{{ year.slice(-2) }}.</p>
  </header>
  <WorkspaceSectionNav :active="active" label="Registration sections" :items="sectionItems">
    <template #icon="{ item: tab }">
      <svg class="registration-workspace-tab-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <template v-if="tab.icon === 'summary'">
          <rect x="3" y="3" width="5.5" height="5.5" rx="1" /><rect x="11.5" y="3" width="5.5" height="5.5" rx="1" />
          <rect x="3" y="11.5" width="5.5" height="5.5" rx="1" /><rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1" />
        </template>
        <template v-else-if="tab.icon === 'guests'">
          <circle cx="7.25" cy="7" r="2.5" /><path d="M2.75 16.25c.45-2.35 2.15-3.75 4.5-3.75s4.05 1.4 4.5 3.75M13.25 4.75a2.25 2.25 0 0 1 0 4.5M14.25 12.75c1.6.3 2.65 1.4 3 3.5" />
        </template>
        <template v-else-if="tab.icon === 'form'">
          <rect x="4" y="2.75" width="12" height="14.5" rx="1.5" /><path d="M7 7h6M7 10.25h6M7 13.5h3.5" />
        </template>
        <template v-else-if="tab.icon === 'emails'">
          <rect x="2.75" y="4.25" width="14.5" height="11.5" rx="1.5" /><path d="m3.75 5.5 6.25 5 6.25-5" />
        </template>
        <template v-else-if="tab.icon === 'community'">
          <circle cx="7" cy="6" r="2" /><circle cx="13.5" cy="7" r="1.75" /><path d="M3.5 16c.3-2.6 1.6-4 3.5-4s3.2 1.4 3.5 4M11.5 12.5c1.8-.6 4 .3 4.5 3.5" />
        </template>
        <template v-else><path d="m3 10.75 10.25-5v8.5L3 10.75Z" /><path d="M13.25 8.25h1.25a2.5 2.5 0 0 1 0 5h-1.25M6.25 12.25l.75 4" /></template>
      </svg>
    </template>
  </WorkspaceSectionNav>
</template>

<style scoped src="@/src/styles/registration-workspace.css"></style>
