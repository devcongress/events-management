<script setup lang="ts">
import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useRoute } from 'vue-router';
import AnnualConferenceNav from '@/src/components/AnnualConferenceNav.vue';
import AnnualConferenceRegistrationNav from '@/src/components/AnnualConferenceRegistrationNav.vue';
import AnnualConferenceGuests from '@/src/components/AnnualConferenceGuests.vue';
import { fetchAnnualConferenceWorkPlan, queryKeys } from '@/src/lib/api';
import { hasAnyAnnualConferenceCapability } from '@/lib/annual-conference-capabilities';

const route = useRoute();
const year = computed(() => String(route.params.year));
const workPlan = useQuery({
  queryKey: computed(() => queryKeys.annualConferenceWorkPlan(year.value)),
  queryFn: () => fetchAnnualConferenceWorkPlan(year.value),
});
const capabilities = computed(() => workPlan.data.value?.permissions.capabilities ?? []);
const canCheckIn = computed(() => hasAnyAnnualConferenceCapability(capabilities.value, ['ticketing.check_in', 'ticketing.manage']));
</script>

<template>
  <main class="editorial-page">
    <div class="editorial-wrap registration-content">
      <AnnualConferenceNav :show-page-heading="false" />
      <AnnualConferenceRegistrationNav active="guests" :can-manage-registration="false" :can-check-in="canCheckIn" />
      <AnnualConferenceGuests v-if="canCheckIn" />
    </div>
  </main>
</template>

<style scoped>
.registration-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
}

.registration-content > * {
  min-width: 0;
}
</style>
