<script setup lang="ts">
import BoneyardPageSkeleton from '@/src/components/ui/BoneyardPageSkeleton.vue';
import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useRoute } from 'vue-router';
import AnnualConferenceNav from '@/src/components/AnnualConferenceNav.vue';
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
const canCheckIn = computed(() => hasAnyAnnualConferenceCapability(capabilities.value, ['ticketing.check_in']));
</script>

<template>
  <main class="editorial-page">
    <div class="editorial-wrap registration-content">
      <AnnualConferenceNav :show-page-heading="false" />
      <h1>Check-in</h1>
      <BoneyardPageSkeleton
        v-if="workPlan.isPending.value && !workPlan.data.value"
        name="annual-conference-check-in"
        label="conference check-in"
        layout="workspace"
        :show-header="false"
      />
      <AnnualConferenceGuests v-else-if="canCheckIn" />
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
