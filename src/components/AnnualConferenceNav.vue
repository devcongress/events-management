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
import {
  hasAnyAnnualConferenceCapability,
  VOLUNTEER_SECTION_CAPABILITIES,
} from '@/lib/annual-conference-capabilities';

type AnnualConferenceNavIcon = 'overview' | 'work-plan' | 'timeline' | 'volunteers' | 'finance';

type AnnualConferenceNavLink = {
  href: string;
  label: string;
  icon: AnnualConferenceNavIcon;
};

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
const capabilities = computed(() => workPlanQuery.data.value?.permissions.capabilities ?? []);
const canViewTimeline = computed(() => hasAnyAnnualConferenceCapability(
  capabilities.value,
  ['timeline.view', 'phases.manage'],
));
const canViewVolunteers = computed(() => year.value === '2026' && hasAnyAnnualConferenceCapability(
  capabilities.value,
  VOLUNTEER_SECTION_CAPABILITIES,
));
const canViewFinance = computed(() => hasAnyAnnualConferenceCapability(
  capabilities.value,
  ['finance.view'],
));
const links = computed<AnnualConferenceNavLink[]>(() => [
  { href: annualConferencePath('', year.value), label: 'Overview', icon: 'overview' },
  {
    href: annualConferencePath('work-plan', year.value),
    label: isVolunteer.value && workPlanQuery.data.value?.permissions.access_scope === 'assigned' ? 'My tasks' : 'Work plan',
    icon: 'work-plan',
  },
  ...(canViewTimeline.value ? [{ href: annualConferencePath('timeline', year.value), label: 'Timeline', icon: 'timeline' as const }] : []),
  ...(canViewVolunteers.value ? [{ href: annualConferencePath('volunteers', year.value), label: 'Volunteers', icon: 'volunteers' as const }] : []),
  ...(canViewFinance.value ? [{ href: annualConferencePath('finance', year.value), label: 'Finance', icon: 'finance' as const }] : []),
]);
const editionOptions = computed(() => editions.value.map((edition) => ({
  value: String(edition.year),
  label: edition.label,
})));
const planningOwnerOptions = computed(() => [
  { value: '', label: `Inherit ${currentEdition.value?.task_creator_email ?? 'current planning owner'}` },
  ...(organizersQuery.data.value?.organizers ?? [])
    .filter((organizer) => organizer.status === 'active' && organizer.role !== 'volunteer')
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

      <nav class="annual-conference-nav mt-1 w-full" aria-label="Annual Conference workspace">
        <RouterLink
          v-for="link in links"
          :key="link.href"
          :to="link.href"
          class="annual-conference-nav-link"
          :class="{ 'annual-conference-nav-link--active': isActive(link.href) }"
          :aria-current="isActive(link.href) ? 'page' : undefined"
        >
          <svg class="annual-conference-nav-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <template v-if="link.icon === 'overview'">
              <rect x="3" y="3" width="5.5" height="5.5" rx="1" />
              <rect x="11.5" y="3" width="5.5" height="5.5" rx="1" />
              <rect x="3" y="11.5" width="5.5" height="5.5" rx="1" />
              <rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1" />
            </template>
            <template v-else-if="link.icon === 'work-plan'">
              <rect x="4" y="2.75" width="12" height="14.5" rx="1.5" />
              <path d="m7 7.25 1.25 1.25L10.5 6.25M11.75 7.5h1.5M7 11.25l1.25 1.25 2.25-2.25M11.75 11.5h1.5M7 15.25l1.25 1.25 2.25-2.25M11.75 15.5h1.5" />
            </template>
            <template v-else-if="link.icon === 'timeline'">
              <circle cx="10" cy="10" r="6.5" />
              <path d="M10 6.5v3.8l2.6 1.6" />
            </template>
            <template v-else-if="link.icon === 'volunteers'">
              <circle cx="7.25" cy="7" r="2.5" />
              <path d="M2.75 16.25c.45-2.35 2.15-3.75 4.5-3.75s4.05 1.4 4.5 3.75M13.25 4.75a2.25 2.25 0 0 1 0 4.5M14.25 12.75c1.6.3 2.65 1.4 3 3.5" />
            </template>
            <template v-else>
              <path d="M3.5 6.25h13v8.5h-13z" />
              <path d="M3.5 8.25h13M6.5 12.5h3.25" />
            </template>
          </svg>
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

<style scoped>
.annual-conference-nav {
  display: flex;
  gap: 1.5rem;
  overflow-x: auto;
  border-bottom: 1px solid #d6d2c8;
  padding: 0 0.125rem;
  scrollbar-width: none;
}

.annual-conference-nav::-webkit-scrollbar {
  display: none;
}

.annual-conference-nav-link {
  position: relative;
  display: inline-flex;
  min-height: 2.875rem;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.45rem;
  padding: 0.125rem 0;
  color: #6f6c65;
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0;
  transition:
    color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 100ms cubic-bezier(0.4, 0, 0.2, 1);
}

.annual-conference-nav-link::after {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  border-radius: 999px;
  background: #e8117f;
  content: '';
  opacity: 0;
  transform: scaleX(0.5);
  transform-origin: center;
  transition:
    opacity 150ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
}

.annual-conference-nav-link--active {
  color: #111111;
}

.annual-conference-nav-link--active::after {
  opacity: 1;
  transform: scaleX(1);
}

.annual-conference-nav-link:focus-visible {
  border-radius: 6px;
  outline: 2px solid rgba(232, 17, 127, 0.35);
  outline-offset: 3px;
}

.annual-conference-nav-link:active {
  transform: scale(0.97);
}

.annual-conference-nav-icon {
  width: 0.9rem;
  height: 0.9rem;
  flex: 0 0 auto;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

@media (hover: hover) and (pointer: fine) {
  .annual-conference-nav-link:hover {
    color: #111111;
  }
}

@media (max-width: 639px) {
  .annual-conference-nav {
    gap: 1.125rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .annual-conference-nav-link,
  .annual-conference-nav-link::after {
    transition: none;
  }

  .annual-conference-nav-link:active {
    transform: none;
  }
}
</style>
