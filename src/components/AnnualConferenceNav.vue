<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AppDatePicker from '@/src/components/ui/AppDatePicker.vue';
import {
  ACTIVE_ANNUAL_CONFERENCE_EDITION,
  annualConferenceRegistrationTarget,
  annualConferenceEditionsForNavigation,
  annualConferencePath,
  canCreateConferenceBadge,
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

type AnnualConferenceNavIcon = 'overview' | 'work-plan' | 'volunteers' | 'speakers' | 'finance' | 'tickets';

type AnnualConferenceNavLink = {
  href: string;
  label: string;
  icon: AnnualConferenceNavIcon;
  disabled?: boolean;
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
const canManageEditions = computed(() => {
  const role = sessionQuery.data.value?.user?.role;

  return sessionQuery.data.value?.authenticated === true && (role === 'owner' || role === 'organizer');
});
const editionsQuery = useQuery({
  queryKey: queryKeys.annualConferenceEditions,
  queryFn: fetchAnnualConferenceEditions,
  enabled: computed(() => (
    sessionQuery.data.value?.authenticated === true
    && canManageEditions.value
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
  canManageEditions.value
  && workPlanQuery.data.value?.permissions.can_create_tasks === true
  && editions.value[0]?.year === currentEdition.value?.year
));
const capabilities = computed(() => sessionQuery.data.value?.authenticated === true
  ? workPlanQuery.data.value?.permissions.capabilities ?? []
  : []);
const canViewVolunteers = computed(() => year.value === '2026' && hasAnyAnnualConferenceCapability(
  capabilities.value,
  VOLUNTEER_SECTION_CAPABILITIES,
));
const canViewFinance = computed(() => hasAnyAnnualConferenceCapability(
  capabilities.value,
 ['finance.view'],
));
const canViewSpeakers = computed(() => hasAnyAnnualConferenceCapability(
  capabilities.value,
  ['speakers.view', 'speakers.manage'],
));
const registrationTarget = computed(() => annualConferenceRegistrationTarget(capabilities.value, year.value));
const links = computed<AnnualConferenceNavLink[]>(() => [
  { href: annualConferencePath('', year.value), label: 'Overview', icon: 'overview' },
  ...(sessionQuery.data.value?.authenticated && canCreateConferenceBadge(year.value, sessionQuery.data.value.user?.role)
    ? [{ href: `${annualConferencePath('', year.value)}?section=badge`, label: 'Conference badge', icon: 'tickets' as const }]
    : []),
  {
    href: annualConferencePath('work-plan', year.value),
    label: isVolunteer.value && workPlanQuery.data.value?.permissions.access_scope === 'assigned' ? 'My tasks' : 'Work plan',
    icon: 'work-plan',
  },
  ...(canViewVolunteers.value ? [{ href: annualConferencePath('volunteers', year.value), label: 'Volunteers', icon: 'volunteers' as const }] : []),
  ...(canManageEditions.value ? [{ href: annualConferencePath('programme', year.value), label: 'Programme', icon: 'work-plan' as const }] : []),
  ...(canViewSpeakers.value ? [{ href: annualConferencePath('speakers', year.value), label: 'Speakers', icon: 'speakers' as const }] : []),
  ...(registrationTarget.value ? [{ href: registrationTarget.value, label: 'Registration', icon: 'tickets' as const }] : []),
  ...(!isVolunteer.value && hasAnyAnnualConferenceCapability(capabilities.value, ['ticketing.manage'])
    ? [{ href: annualConferencePath('ticketing', year.value), label: 'Ticketing', icon: 'tickets' as const }]
    : []),
  ...(canViewFinance.value ? [{ href: annualConferencePath('finance', year.value), label: 'Finance', icon: 'finance' as const, disabled: true }] : []),
]);
const navViewport = ref<HTMLElement | null>(null);
const mobileNav = ref<HTMLDetailsElement | null>(null);
const editionYearInput = ref<HTMLInputElement | null>(null);

function closeMobileNav(restoreFocus = false) {
  if (!mobileNav.value?.open) return;
  mobileNav.value.open = false;
  if (restoreFocus) mobileNav.value.querySelector<HTMLElement>('summary')?.focus();
}

function dismissMobileNav(event: PointerEvent | KeyboardEvent) {
  if (!mobileNav.value?.open) return;
  if (event instanceof KeyboardEvent) {
    if (event.key !== 'Escape' || mobileNav.value.querySelector('.app-dropdown-trigger[aria-expanded="true"]')) return;
    event.preventDefault();
    closeMobileNav(true);

    return;
  }
  const target = event.target;

  if (target instanceof Element && (mobileNav.value.contains(target) || target.closest('.app-dropdown-menu'))) return;
  closeMobileNav();
}

onMounted(() => {
  document.addEventListener('pointerdown', dismissMobileNav, true);
  document.addEventListener('keydown', dismissMobileNav, true);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', dismissMobileNav, true);
  document.removeEventListener('keydown', dismissMobileNav, true);
});
const activeLink = computed(() => links.value.find((link) => isActive(link.href))?.label ?? 'Conference');
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

function openMobileEditionForm() {
  openEditionForm();
  closeMobileNav();
  void nextTick(() => editionYearInput.value?.focus());
}

function changeEdition(value: string | number) {
  closeMobileNav(true);
  const nextYear = String(value);

  if (nextYear !== year.value) {
    const section = route.name === 'admin-annual-conference-programme' ? 'programme' : '';

    void router.push(annualConferencePath(section, nextYear));
  }
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
  if (href === `${annualConferencePath('', year.value)}?section=badge`) return route.path === annualConferencePath('', year.value) && route.query.section === 'badge';
  if (href === annualConferencePath('finance', year.value)) return false;

  if (href === registrationTarget.value && route.path === annualConferencePath('check-in', year.value)) {
    return true;
  }

  if (href === annualConferencePath('', year.value)) {
    return route.path === href && route.query.section !== 'badge';
  }

  return route.path === href || route.path.startsWith(`${href}/`);
}

function revealActiveNavLink() {
  void nextTick(() => {
    navViewport.value
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  });
}

watch(() => route.fullPath, () => {
  closeMobileNav();
});
watch([links, () => route.fullPath], revealActiveNavLink, { flush: 'post', immediate: true });
</script>

<template>
  <section
    class="annual-conference-nav-shell mb-6"
    :class="showPageHeading ? 'border-b-2 border-dc-ink pb-5' : ''"
  >
    <details ref="mobileNav" class="conference-mobile-nav">
      <summary>
        <span>{{ currentEdition?.label ?? `December ${year}` }} · {{ activeLink }}</span>
        <span aria-hidden="true">⌄</span>
      </summary>
      <div class="conference-mobile-nav__menu">
        <AppDropdown
          v-if="canManageEditions"
          :model-value="year"
          label="Edition"
          :options="editionOptions"
          density="compact"
          :teleport="true"
          @update:model-value="changeEdition"
        />
        <nav aria-label="Annual Conference workspace">
          <component
            :is="link.disabled ? 'span' : RouterLink"
            v-for="link in links"
            :key="link.href"
            :to="link.disabled ? undefined : link.href"
            :aria-disabled="link.disabled ? 'true' : undefined"
            :aria-current="isActive(link.href) ? 'page' : undefined"
          >
            {{ link.label }}
          </component>
        </nav>
        <button v-if="canCreateEdition" type="button" class="conference-mobile-nav__create" @click="openMobileEditionForm">
          New edition
        </button>
      </div>
    </details>
    <div class="conference-desktop-toolbar flex flex-wrap items-center justify-between gap-3" :class="{ 'edition-toolbar--owner': canCreateEdition }">
      <div class="edition-fields flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <p class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-dc-ink">
          Annual Conference
        </p>
        <div v-if="canManageEditions" class="edition-picker min-w-44 max-w-56 flex-1 sm:flex-none">
          <AppDropdown
            :model-value="year"
            :options="editionOptions"
            density="compact"
            trigger-class="min-h-11"
            menu-class="min-w-48"
            @update:model-value="changeEdition"
          />
        </div>
        <strong v-else class="font-mono text-xs font-semibold uppercase tracking-[0.06em] text-dc-gray">
          {{ currentEdition?.label ?? `December ${year}` }}
        </strong>
      </div>

      <div class="flex items-center justify-end">
        <button
          v-if="canCreateEdition"
          type="button"
          class="motion-press min-h-11 rounded-md border border-dc-pink bg-dc-paper px-3 font-mono text-xs font-semibold uppercase tracking-[0.06em] text-dc-pink"
          @click="openEditionForm"
        >
          New edition
        </button>
      </div>

      <div ref="navViewport" class="annual-conference-nav-viewport mt-1 w-full">
        <nav class="annual-conference-nav underline-section-nav" aria-label="Annual Conference workspace">
          <component
            :is="link.disabled ? 'span' : RouterLink"
            v-for="link in links"
            :key="link.href"
            :to="link.disabled ? undefined : link.href"
            class="annual-conference-nav-link underline-section-tab"
            :class="{ 'annual-conference-nav-link--disabled': link.disabled }"
            :aria-disabled="link.disabled ? 'true' : undefined"
            :aria-current="isActive(link.href) ? 'page' : undefined"
          >
            <span class="underline-section-tab__content">
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
                <template v-else-if="link.icon === 'volunteers'">
                  <circle cx="7.25" cy="7" r="2.5" />
                  <path d="M2.75 16.25c.45-2.35 2.15-3.75 4.5-3.75s4.05 1.4 4.5 3.75M13.25 4.75a2.25 2.25 0 0 1 0 4.5M14.25 12.75c1.6.3 2.65 1.4 3 3.5" />
                </template>
                <template v-else-if="link.icon === 'speakers'">
                  <path d="M4 16.25c.45-2.35 2.15-3.75 4.5-3.75s4.05 1.4 4.5 3.75" />
                  <circle cx="8.5" cy="7" r="2.75" />
                  <path d="M13 8.5h3.75M14.9 6.6v3.8" />
                </template>
                <template v-else-if="link.icon === 'finance'">
                  <path d="M3.5 6.25h13v8.5h-13z" />
                  <path d="M3.5 8.25h13M6.5 12.5h3.25" />
                </template>
                <template v-else>
                  <path d="M4 5.25h12v9.5H4z" />
                  <path d="M7 8h6M7 11h4" />
                </template>
              </svg>
              <span>{{ link.label }}</span>
            </span>
          </component>
        </nav>
      </div>
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
        <input ref="editionYearInput" v-model.number="editionForm.year" class="editorial-input mt-2" type="number" min="2000" max="2200" required>
      </label>
      <label>
        <span class="editorial-label">Edition label</span>
        <input v-model="editionForm.label" class="editorial-input mt-2" maxlength="120" required>
      </label>
      <AppDatePicker v-model="editionForm.provisional_date" label="Conference date" required />
      <AppDropdown v-model="editionForm.task_creator_email" label="Planning owner" :options="planningOwnerOptions" menu-class="min-w-72" />
      <div class="flex justify-end gap-2 lg:col-span-2">
        <button type="button" class="motion-press min-h-11 rounded-md border-2 border-dc-ink bg-dc-paper px-4 font-mono text-xs font-semibold uppercase" @click="showEditionForm = false">Cancel</button>
        <button type="submit" class="motion-press min-h-11 rounded-md border-2 border-dc-ink bg-dc-pink px-4 font-mono text-xs font-semibold uppercase text-white" :disabled="createEditionMutation.isPending.value">{{ createEditionMutation.isPending.value ? 'Creating…' : 'Create edition' }}</button>
      </div>
    </form>

    <div
      v-if="showPageHeading"
      class="mt-4 flex flex-wrap items-start justify-between gap-4 pt-4"
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

<style scoped src="@/src/styles/underline-section-nav.css"></style>

<style scoped>
.conference-mobile-nav { display: none; }

.annual-conference-nav {
  display: flex;
  gap: 1.5rem;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  padding: 0 0.125rem;
  scroll-padding-inline: 0.125rem;
  scrollbar-width: none;
}

.annual-conference-nav::-webkit-scrollbar {
  display: none;
}

.annual-conference-nav-link {
  scroll-margin-inline: 0.75rem;
}

.annual-conference-nav-link--disabled {
  cursor: not-allowed;
  color: #959188;
  opacity: 0.72;
}

.annual-conference-nav-link--disabled::after {
  display: none;
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
  .annual-conference-nav-link:not(.annual-conference-nav-link--disabled):hover {
    color: #111111;
  }
}

@media (min-width: 768px) {
  .annual-conference-nav-shell {
    position: sticky;
    top: var(--organizer-breadcrumb-height, 0px);
    z-index: 35;
    background: #f5f2e8;
  }
}

@media (max-width: 767px) {
  .annual-conference-nav-shell {
    display: none;
  }

  .conference-desktop-toolbar {
    display: none;
  }
  .conference-mobile-nav {
    display: block;
    position: relative;
  }
  .conference-mobile-nav summary {
    display: flex;
    min-height: 44px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid #dedbd3;
    border-radius: 6px;
    background: #fff;
    padding: 0 12px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    list-style: none;
  }
  .conference-mobile-nav summary::-webkit-details-marker {
    display: none;
  }
  .conference-mobile-nav summary:focus-visible, .conference-mobile-nav a:focus-visible, .conference-mobile-nav__create:focus-visible {
    outline: 2px solid #e8117f;
    outline-offset: 2px;
  }
  .conference-mobile-nav__menu {
    position: absolute;
    z-index: 45;
    top: calc(100% + 4px);
    right: 0;
    left: 0;
    max-height: min(70vh, 32rem);
    overflow-y: auto;
    border: 1px solid #dedbd3;
    border-radius: 8px;
    background: #fff;
    padding: 12px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 12%);
  }
  .conference-mobile-nav__menu nav {
    display: grid;
    margin-top: 8px;
  }
  .conference-mobile-nav__menu nav a, .conference-mobile-nav__menu nav span, .conference-mobile-nav__create {
    display: flex;
    min-height: 44px;
    align-items: center;
    border: 0;
    border-bottom: 1px solid #eeeae1;
    background: transparent;
    padding: 0 8px;
    color: #111;
    text-align: left;
    font-size: 15px;
  }
  .conference-mobile-nav__menu nav [aria-current="page"] {
    color: #c20d6a;
    font-weight: 700;
  }
  .conference-mobile-nav__menu nav [aria-disabled="true"] {
    color: #888;
  }
  .conference-mobile-nav__create {
    width: 100%;
    color: #c20d6a;
    font-weight: 700;
  }

  .edition-toolbar--owner {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .edition-toolbar--owner .edition-fields {
    display: contents;
  }

  .edition-toolbar--owner .edition-fields > p,
  .edition-toolbar--owner .annual-conference-nav-viewport {
    grid-column: 1 / -1;
  }

  .edition-toolbar--owner .edition-picker {
    min-width: 0;
    max-width: none;
  }

  .annual-conference-nav-viewport {
    position: relative;
  }

  .annual-conference-nav-viewport::after {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 2rem;
    height: 2.875rem;
    background: linear-gradient(90deg, rgb(245 242 232 / 0%), #f5f2e8 78%);
    content: '';
    pointer-events: none;
  }

  .annual-conference-nav {
    gap: 1.125rem;
    padding-right: 2rem;
    scroll-padding-right: 2rem;
  }
}
</style>
