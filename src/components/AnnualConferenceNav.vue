<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { useRoute, useRouter } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AppDatePicker from '@/src/components/ui/AppDatePicker.vue';
import {
  ACTIVE_ANNUAL_CONFERENCE_EDITION,
  annualConferenceEditionsForNavigation,
  annualConferencePath,
} from '@/src/annual-conference';
import {
  createAnnualConferenceEdition,
  fetchAdminOrganizers,
  fetchAdminSession,
  fetchAnnualConferenceEditions,
  fetchAnnualConferenceWorkPlan,
  queryKeys,
} from '@/src/lib/api';
import { notify } from '@/src/lib/notify';

withDefaults(defineProps<{
  title?: string;
  description?: string;
  showPageHeading?: boolean;
}>(), {
  showPageHeading: true,
});

const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const year = computed(() => String(route.params.year ?? ACTIVE_ANNUAL_CONFERENCE_EDITION.year));
const showEditionForm = ref(false);
const editionForm = reactive({
  year: Number(year.value) + 1,
  name: 'DevCongress Annual Conference',
  label: '',
  provisional_date: '',
  task_creator_email: '',
});
const sessionQuery = useQuery({
  queryKey: queryKeys.adminSession,
  queryFn: fetchAdminSession,
});
const isVolunteer = computed(() => sessionQuery.data.value?.user?.role === 'volunteer');
const editionsQuery = useQuery({
  queryKey: queryKeys.annualConferenceEditions,
  queryFn: fetchAnnualConferenceEditions,
  enabled: computed(() => (
    sessionQuery.data.value?.authenticated === true
    && !isVolunteer.value
  )),
});
const workPlanQuery = useQuery({
  queryKey: computed(() => queryKeys.annualConferenceWorkPlan(year.value)),
  queryFn: () => fetchAnnualConferenceWorkPlan(year.value),
});
const organizersQuery = useQuery({
  queryKey: queryKeys.adminOrganizers,
  queryFn: fetchAdminOrganizers,
  enabled: showEditionForm,
});
const editions = computed(() => annualConferenceEditionsForNavigation(
  sessionQuery.data.value?.user?.role,
  editionsQuery.data.value?.editions ?? [],
  workPlanQuery.data.value?.edition,
));
const currentEdition = computed(() => editions.value.find((edition) => String(edition.year) === year.value));
const canCreateEdition = computed(() => (
  workPlanQuery.data.value?.permissions.can_create_tasks === true
  && editions.value[0]?.year === currentEdition.value?.year
));
const links = computed(() => [
  { href: annualConferencePath('', year.value), label: 'Overview' },
  { href: annualConferencePath('work-plan', year.value), label: 'Work plan' },
  ...(!isVolunteer.value ? [{ href: annualConferencePath('timeline', year.value), label: 'Timeline' }] : []),
  ...(!isVolunteer.value && year.value === '2026' ? [{ href: annualConferencePath('volunteers', year.value), label: 'Volunteers' }] : []),
]);
const editionOptions = computed(() => editions.value.map((edition) => ({
  value: String(edition.year),
  label: edition.label,
})));
const planningOwnerOptions = computed(() => [
  { value: '', label: `Inherit ${currentEdition.value?.task_creator_email ?? 'current planning owner'}` },
  ...(organizersQuery.data.value?.organizers ?? [])
    .filter((organizer) => organizer.status === 'active')
    .map((organizer) => ({
      value: organizer.email,
      label: organizer.display_name ? `${organizer.display_name} · ${organizer.email}` : organizer.email,
    })),
]);
const createEditionMutation = useMutation({
  mutationFn: createAnnualConferenceEdition,
  onSuccess: async (edition) => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.annualConferenceEditions });
    notify.success(`${edition.label} created.`);
    showEditionForm.value = false;
    await router.push(annualConferencePath('', String(edition.year)));
  },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to create the edition.'),
});

function openEditionForm() {
  const latestYear = Math.max(Number(year.value), ...editions.value.map((edition) => edition.year));
  editionForm.year = latestYear + 1;
  editionForm.label = `December ${editionForm.year}`;
  editionForm.provisional_date = `${editionForm.year}-12-19`;
  editionForm.task_creator_email = '';
  showEditionForm.value = true;
}

function changeEdition(value: string | number) {
  const nextYear = String(value);
  if (nextYear !== year.value) void router.push(annualConferencePath('', nextYear));
}

function submitEdition() {
  createEditionMutation.mutate({
    year: editionForm.year,
    name: editionForm.name.trim(),
    label: editionForm.label.trim(),
    provisional_date: editionForm.provisional_date,
    task_creator_email: editionForm.task_creator_email || null,
  });
}

function isActive(href: string): boolean {
  if (href === annualConferencePath('', year.value)) {
    return route.path === href;
  }

  return route.path === href || route.path.startsWith(`${href}/`);
}
</script>

<template>
  <section
    class="mb-6"
    :class="showPageHeading ? 'border-b-2 border-dc-ink pb-5' : ''"
  >
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <p class="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-dc-ink">
          Annual Conference
        </p>
        <div class="min-w-44 max-w-56 flex-1 sm:flex-none">
          <AppDropdown
            :model-value="year"
            :options="editionOptions"
            :disabled="isVolunteer"
            density="compact"
            menu-class="min-w-48"
            @update:model-value="changeEdition"
          />
        </div>
      </div>

      <div class="flex items-center justify-end">
        <button
          v-if="canCreateEdition"
          type="button"
          class="motion-press min-h-10 rounded-md border border-dc-pink bg-dc-paper px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-pink"
          @click="openEditionForm"
        >
          New edition
        </button>
      </div>

      <nav class="mt-1 flex w-full flex-wrap gap-2 border-t border-dc-border pt-3" aria-label="Annual Conference workspace">
        <RouterLink
          v-for="link in links"
          :key="link.href"
          :to="link.href"
          class="motion-press inline-flex min-h-10 items-center justify-center rounded-md border px-4 py-2 font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.14em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dc-pink/35"
          :class="isActive(link.href)
            ? 'border-dc-ink bg-dc-pink text-white shadow-[2px_2px_0_#111111]'
            : 'border-dc-border bg-dc-paper text-dc-gray hover:border-dc-ink hover:bg-dc-paper-warm hover:text-dc-ink'"
          :aria-current="isActive(link.href) ? 'page' : undefined"
        >
          {{ link.label }}
        </RouterLink>
      </nav>
    </div>

    <form
      v-if="showEditionForm"
      class="mt-4 grid gap-4 rounded-lg border-2 border-dc-ink bg-dc-paper-warm p-4 lg:grid-cols-2"
      @submit.prevent="submitEdition"
    >
      <div class="lg:col-span-2">
        <p class="editorial-eyebrow">Create future edition</p>
        <p class="mt-1 text-xs font-medium text-dc-gray">The planning owner inherits from {{ currentEdition?.label ?? year }} unless you select another active organizer.</p>
      </div>
      <label>
        <span class="editorial-label">Year</span>
        <input v-model.number="editionForm.year" class="editorial-input mt-2" type="number" min="2000" max="2200" required>
      </label>
      <label>
        <span class="editorial-label">Edition label</span>
        <input v-model="editionForm.label" class="editorial-input mt-2" maxlength="120" required>
      </label>
      <AppDatePicker v-model="editionForm.provisional_date" label="Conference date" required />
      <AppDropdown v-model="editionForm.task_creator_email" label="Planning owner" :options="planningOwnerOptions" menu-class="min-w-72" />
      <div class="flex justify-end gap-2 lg:col-span-2">
        <button type="button" class="motion-press min-h-10 rounded-md border-2 border-dc-ink bg-dc-paper px-4 font-mono text-[10px] font-semibold uppercase" @click="showEditionForm = false">Cancel</button>
        <button type="submit" class="motion-press min-h-10 rounded-md border-2 border-dc-ink bg-dc-pink px-4 font-mono text-[10px] font-semibold uppercase text-white" :disabled="createEditionMutation.isPending.value">{{ createEditionMutation.isPending.value ? 'Creating…' : 'Create edition' }}</button>
      </div>
    </form>

    <div
      v-if="showPageHeading"
      class="mt-4 flex flex-wrap items-start justify-between gap-4 border-t border-dc-border pt-4"
    >
      <div class="min-w-0 flex-1">
        <h1 v-if="title" class="text-3xl font-extrabold tracking-tight text-dc-ink sm:text-4xl">{{ title }}</h1>
        <slot name="description">
          <p v-if="description" class="mt-1 max-w-4xl text-xs font-medium leading-5 text-dc-gray">
            {{ description }}
          </p>
        </slot>
      </div>
      <slot name="actions" />
    </div>
  </section>
</template>
