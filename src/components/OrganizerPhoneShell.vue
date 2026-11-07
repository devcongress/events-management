<script lang="ts">
const conferenceContexts = new Map<string, Record<string, string>>();
let lastIdentity = '';
</script>

<script setup lang="ts">
import { computed, inject, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AppDatePicker from '@/src/components/ui/AppDatePicker.vue';
import { createAnnualConferenceEdition, fetchAdminOrganizers, fetchAdminSession, fetchAnnualConferenceEditions, fetchAnnualConferenceWorkPlan, queryKeys } from '@/src/lib/api';
import { notify } from '@/src/lib/notify';
import { adminPath } from '@/src/admin-routes';
import { ACTIVE_ANNUAL_CONFERENCE_EDITION, annualConferencePath, annualConferenceRegistrationTarget, canCreateConferenceBadge, mobileAnnualConferencePath } from '@/src/annual-conference';
import { organizerConferenceContextQuery, organizerMobileConferenceSection } from '@/src/organizer-viewport';
import { hasAnyAnnualConferenceCapability, VOLUNTEER_SECTION_CAPABILITIES } from '@/lib/annual-conference-capabilities';

const props = defineProps<{ conference: boolean }>();
const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const signOut = inject<(() => void) | null>('annual-conference-phone-sign-out', null);
const menuPanel = ref<HTMLElement | null>(null);
const menuClose = ref<HTMLButtonElement | null>(null);
const bottomMore = ref<HTMLButtonElement | null>(null);
const conferenceFooter = ref<HTMLElement | null>(null);
const menuOpen = ref(false);
let appWasInert = false;
let previousBodyOverflow = '';
let previousDocumentOverflow = '';
const lastYear = ref(String(ACTIVE_ANNUAL_CONFERENCE_EDITION.year));
const year = computed(() => String(route.params.year ?? lastYear.value));
const sessionQuery = useQuery({ queryKey: queryKeys.adminSession, queryFn: fetchAdminSession });
const role = computed(() => sessionQuery.data.value?.user?.role ?? null);
const identity = computed(() => sessionQuery.data.value?.user?.email ?? null);
const isOrganizer = computed(() => role.value === 'owner' || role.value === 'organizer');
const workPlan = useQuery({
  queryKey: computed(() => queryKeys.annualConferenceWorkPlan(year.value)),
  queryFn: () => fetchAnnualConferenceWorkPlan(year.value),
  enabled: computed(() => props.conference),
});
const editionsQuery = useQuery({
  queryKey: queryKeys.annualConferenceEditions,
  queryFn: fetchAnnualConferenceEditions,
  enabled: computed(() => props.conference && isOrganizer.value),
});
const capabilities = computed(() => workPlan.data.value?.permissions.capabilities ?? []);
const assigned = computed(() => workPlan.data.value?.permissions.access_scope === 'assigned');
const editionLabel = computed(() => workPlan.data.value?.edition.label ?? `December ${year.value}`);
const editionOptions = computed(() => (editionsQuery.data.value?.editions ?? []).map(item => ({ value: String(item.year), label: item.label })));
const canCreateEdition = computed(() => isOrganizer.value && workPlan.data.value?.permissions.can_create_tasks === true && editionsQuery.data.value?.editions[0]?.year === Number(year.value));
const editionOpen = ref(false);
const yearInput = ref<HTMLInputElement | null>(null);
const editionForm = reactive({ year: 0, name: 'DevCongress Annual Conference', label: '', provisional_date: '', task_creator_email: '' });
const organizers = useQuery({ queryKey: queryKeys.adminOrganizers, queryFn: fetchAdminOrganizers, enabled: editionOpen });
const ownerOptions = computed(() => [
  { value: '', label: `Inherit ${workPlan.data.value?.edition.task_creator_email ?? 'current planning owner'}` },
  ...(organizers.data.value?.organizers ?? []).filter(item => item.status === 'active' && item.role !== 'volunteer').map(item => ({ value: item.email, label: item.display_name ? `${item.display_name} · ${item.email}` : item.email })),
]);
const createMutation = useMutation({
  mutationFn: createAnnualConferenceEdition,
  onSuccess: async (edition) => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.annualConferenceEditions });
    editionOpen.value = false;
    notify.success(`${edition.label} created.`);
    await router.push(mobileAnnualConferencePath(String(edition.year)));
  },
  onError: error => notify.error(error instanceof Error ? error.message : 'Unable to create the edition.'),
});
const isMobileWorkspace = computed(() => route.name === 'admin-mobile-annual-conference');
const section = computed(() => isMobileWorkspace.value ? organizerMobileConferenceSection(route.query) : null);
const registration = computed(() => annualConferenceRegistrationTarget(capabilities.value, year.value));
const canBadge = computed(() => sessionQuery.data.value?.authenticated === true && canCreateConferenceBadge(year.value, sessionQuery.data.value?.user?.role));
const canVolunteers = computed(() => year.value === '2026' && hasAnyAnnualConferenceCapability(capabilities.value, VOLUNTEER_SECTION_CAPABILITIES));
const canSpeakers = computed(() => isOrganizer.value && hasAnyAnnualConferenceCapability(capabilities.value, ['speakers.view', 'speakers.manage']));
const canTicketing = computed(() => isOrganizer.value && capabilities.value.includes('ticketing.manage'));
const title = computed(() => {
  if (!props.conference) {
    if (route.name === 'admin-reports') return 'Reports';
    if (route.name === 'admin-organizers') return 'People & Access';
    if (route.name === 'admin-audit-log') return 'Audit Log';
    if (route.name === 'admin-present-forms') return 'Present forms';

    return 'Organizer';
  }
  if (section.value === 'tasks') return assigned.value ? 'My tasks' : 'Work plan';
  if (section.value === 'badge' && canBadge.value) return 'Conference badge';
  if (section.value === 'volunteers') return 'Volunteers';
  if (section.value === 'overview') return 'Overview';
  if (route.name === 'admin-annual-conference-programme') return 'Programme';
  if (route.name === 'admin-annual-conference-speakers') return 'Speakers';
  if (route.name === 'admin-annual-conference-ticketing') return 'Ticketing';
  if (route.name === 'admin-annual-conference-check-in') return 'Check-in';

  return 'Registration';
});
const items = computed(() => [
  { key: 'overview', label: 'Overview', icon: 'overview' },
  { key: 'tasks', label: assigned.value ? 'My tasks' : 'Work plan', icon: 'tasks' },
  ...(canBadge.value ? [{ key: 'badge', label: 'Badge', icon: 'badge' }] : []),
  ...(canVolunteers.value ? [{ key: 'volunteers', label: 'Volunteers', icon: 'volunteers' }] : []),
  ...(canSpeakers.value ? [{ key: 'speakers', label: 'Speakers', icon: 'speakers' }] : []),
  ...(!canSpeakers.value && registration.value && !(canBadge.value && canVolunteers.value) ? [{ key: 'registration', label: registration.value.endsWith('/check-in') ? 'Check-in' : 'Registration', icon: 'registration' }] : []),
]);

const visibleItems = computed(() => items.value.slice(0, 4));
const overflowItems = computed(() => items.value.slice(4));
const showMore = computed(() => !props.conference || isOrganizer.value || overflowItems.value.length > 0
  || (Boolean(registration.value) && !items.value.some(item => item.key === 'registration'))
  || capabilities.value.includes('finance.view'));

watch(() => [identity.value, year.value, route.fullPath] as const, () => {
  const currentIdentity = identity.value ?? '';

  if (currentIdentity && lastIdentity && currentIdentity !== lastIdentity) conferenceContexts.clear();
  if (currentIdentity) lastIdentity = currentIdentity;
  if (props.conference) lastYear.value = year.value;
  if (isMobileWorkspace.value) conferenceContexts.set(year.value, organizerConferenceContextQuery(route.query));
}, { immediate: true });

watch(showMore, (visible) => {
  if (visible || !menuOpen.value) return;
  closeMenu();
  void nextTick(() => conferenceFooter.value?.querySelector<HTMLElement>('button:last-child')?.focus());
});

watch(() => route.fullPath, () => {
  closeMenu();
  editionOpen.value = false;
});

function closeMenu(focus = false) {
  if (!menuOpen.value) return;
  menuOpen.value = false;
  document.body.style.overflow = previousBodyOverflow;
  document.documentElement.style.overflow = previousDocumentOverflow;
  if (!appWasInert) document.querySelector<HTMLElement>('#app')?.removeAttribute('inert');
  if (focus) void nextTick(() => bottomMore.value?.focus());
}

function toggleBottomMenu() {
  if (menuOpen.value) {
    closeMenu(true);

    return;
  }
  previousBodyOverflow = document.body.style.overflow;
  previousDocumentOverflow = document.documentElement.style.overflow;
  appWasInert = document.querySelector<HTMLElement>('#app')?.hasAttribute('inert') ?? false;
  document.querySelector<HTMLElement>('#app')?.setAttribute('inert', '');
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
  menuOpen.value = true;
  void nextTick(() => menuClose.value?.focus());
}

function handleMenuKeydown(event: KeyboardEvent) {
  if (!menuOpen.value || document.querySelector('.app-dropdown-trigger[aria-expanded="true"]')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeMenu(true);

    return;
  }
  if (event.key !== 'Tab' || !menuPanel.value) return;
  const focusable = [...menuPanel.value.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')];
  const first = focusable[0];
  const last = focusable.at(-1);

  if (event.shiftKey && document.activeElement === first && last) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last && first) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(() => document.addEventListener('keydown', handleMenuKeydown, true));
onUnmounted(() => {
  closeMenu();
  document.removeEventListener('keydown', handleMenuKeydown, true);
});

function select(key: string) {
  closeMenu();
  if (key === 'registration' && registration.value) {
    void router.push(registration.value);

    return;
  }
  if (key === 'speakers') {
    void router.push(annualConferencePath('speakers', year.value));

    return;
  }
  if (key !== 'overview' && key !== 'tasks' && key !== 'volunteers' && !(key === 'badge' && canBadge.value)) return;
  const context = conferenceContexts.get(year.value) ?? {};

  void router.push({ path: mobileAnnualConferencePath(year.value), query: organizerConferenceContextQuery({ ...context, section: key, task: undefined }, key) });
}

function goBack() {
  if (props.conference && section.value !== 'overview') {
    select('overview');

    return;
  }
  if (isOrganizer.value) void router.push(adminPath('mobile'));
}

function changeEdition(value: string | number) {
  closeMenu(true);
  const nextYear = String(value);

  if (nextYear === year.value) return;
  const query = isMobileWorkspace.value ? organizerConferenceContextQuery({ ...route.query, task: undefined }) : {};

  void router.push(isMobileWorkspace.value
    ? { path: mobileAnnualConferencePath(nextYear), query }
    : annualConferencePath(route.name === 'admin-annual-conference-programme' ? 'programme' : '', nextYear));
}
function createEdition() {
  closeMenu();
  const latest = Math.max(Number(year.value), ...(editionsQuery.data.value?.editions ?? []).map(item => item.year));

  editionForm.year = latest + 1;
  editionForm.label = `December ${editionForm.year}`;
  editionForm.provisional_date = `${editionForm.year}-12-19`;
  editionForm.task_creator_email = '';
  editionOpen.value = true;
  void nextTick(() => yearInput.value?.focus());
}
</script>

<template>
  <div class="conference-phone-shell">
    <header class="conference-phone-header">
      <button v-if="isOrganizer || section !== 'overview'" type="button" class="conference-phone-header__back" :aria-label="conference && section !== 'overview' ? 'Back to conference overview' : 'Back to home'" @click="goBack">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
      </button>
      <span v-else aria-hidden="true" />
      <div class="conference-phone-header__title">
        <strong>{{ title }}</strong>
        <span>{{ conference ? editionLabel : "Organizer workspace" }}</span>
      </div>
      <span aria-hidden="true" />
    </header>
    <nav v-if="conference" ref="conferenceFooter" class="conference-phone-bottom" aria-label="Annual Conference workspace">
      <button
        v-for="item in visibleItems"
        :key="item.key"
        type="button"
        :aria-label="item.key === 'badge' ? 'Conference badge' : undefined"
        :aria-current="section === item.key || (item.key === 'speakers' && title === 'Speakers') || (item.key === 'registration' && (title === 'Registration' || title === 'Check-in')) ? 'page' : undefined"
        @click="select(item.key)"
      >
        <svg viewBox="0 0 24 24" class="conference-phone-bottom__icon" aria-hidden="true">
          <path v-if="item.icon === 'overview'" d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
          <path v-else-if="item.icon === 'tasks'" d="M5 6h14v14H5zM8 3h8v5H8zM8 12l2 2 4-4M8 17h7" />
          <path v-else-if="item.icon === 'volunteers'" d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 10a2.5 2.5 0 1 0 0-5M3 19c0-3 2-5 5-5s5 2 5 5M13 14c3 0 5 2 5 5" />
          <path v-else-if="item.icon === 'speakers'" d="M4 20c.5-3 2.5-5 5.5-5s5 2 5.5 5M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M17 8h5M19.5 5.5v5" />
          <path v-else-if="item.icon === 'badge'" d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" />
          <path v-else d="M4 5h16v14H4zM8 9h8M8 13h5" />
        </svg>
        <span>{{ item.label }}</span>
      </button>
      <button
        v-if="showMore"
        ref="bottomMore"
        type="button"
        :aria-expanded="menuOpen"
        aria-controls="conference-phone-more"
        :aria-current="!section && !items.some(item => item.key === 'speakers' && title === 'Speakers' || item.key === 'registration' && (title === 'Registration' || title === 'Check-in')) ? 'page' : undefined"
        @click="toggleBottomMenu"
      >
        <svg viewBox="0 0 24 24" class="conference-phone-bottom__icon" aria-hidden="true"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
        <span>More</span>
      </button>
      <button v-else-if="signOut" type="button" @click="signOut">
        <svg viewBox="0 0 24 24" class="conference-phone-bottom__icon" aria-hidden="true"><path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10" /></svg>
        <span>Sign out</span>
      </button>
    </nav>
    <nav v-else class="conference-phone-bottom" aria-label="Organizer workspaces">
      <RouterLink :to="adminPath('mobile')">
        <svg viewBox="0 0 24 24" class="conference-phone-bottom__icon" aria-hidden="true"><path d="m3 11 9-7 9 7M5 10v10h14V10M9 20v-6h6v6" /></svg>
        <span>Home</span>
      </RouterLink>
      <RouterLink :to="adminPath('mobile/events')">
        <svg viewBox="0 0 24 24" class="conference-phone-bottom__icon" aria-hidden="true"><path d="M4 6h16v14H4zM8 3v6M16 3v6M4 10h16" /></svg>
        <span>Events</span>
      </RouterLink>
      <RouterLink :to="mobileAnnualConferencePath(lastYear)">
        <svg viewBox="0 0 24 24" class="conference-phone-bottom__icon" aria-hidden="true"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /></svg>
        <span>Conference</span>
      </RouterLink>
      <button ref="bottomMore" type="button" :aria-expanded="menuOpen" aria-controls="conference-phone-more" aria-current="page" @click="toggleBottomMenu">
        <svg viewBox="0 0 24 24" class="conference-phone-bottom__icon" aria-hidden="true"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
        <span>More</span>
      </button>
    </nav>
    <Teleport to="body">
      <Transition name="phone-menu">
      <div v-if="menuOpen" class="conference-phone-menu-backdrop" @click.self="closeMenu(true)">
        <section id="conference-phone-more" ref="menuPanel" class="conference-phone-menu__panel" role="dialog" aria-modal="true" aria-labelledby="conference-phone-more-title" tabindex="-1">
          <header class="conference-phone-menu__header">
            <h2 id="conference-phone-more-title">More</h2>
            <button ref="menuClose" type="button" aria-label="Close menu" @click="closeMenu(true)">×</button>
          </header>
          <div class="conference-phone-menu__content">
            <AppDropdown v-if="conference && isOrganizer" :model-value="year" :options="editionOptions" label="Edition" density="compact" :teleport="true" @update:model-value="changeEdition" />
            <button v-if="conference && canCreateEdition" type="button" @click="createEdition">New edition</button>
            <nav v-if="conference" aria-label="More conference destinations">
              <button v-for="item in overflowItems" :key="item.key" type="button" @click="select(item.key)">{{ item.label }}</button>
              <RouterLink v-if="isOrganizer" :to="annualConferencePath('programme', year)" @click="closeMenu()">Programme</RouterLink>
              <RouterLink v-if="registration && !items.some(item => item.key === 'registration')" :to="registration" @click="closeMenu()">{{ registration.endsWith('/check-in') ? 'Check-in' : 'Registration' }}</RouterLink>
              <RouterLink v-if="canTicketing" :to="annualConferencePath('ticketing', year)" @click="closeMenu()">Ticketing</RouterLink>
              <span v-if="capabilities.includes('finance.view')" aria-disabled="true">Finance <small>Unavailable</small></span>
            </nav>
            <nav v-if="isOrganizer" aria-label="Organizer destinations">
              <template v-if="conference">
                <RouterLink :to="adminPath('mobile')" @click="closeMenu()">Home</RouterLink>
                <RouterLink :to="adminPath('mobile/events')" @click="closeMenu()">Events</RouterLink>
              </template>
              <RouterLink :to="adminPath('reports')" @click="closeMenu()">Reports</RouterLink>
              <RouterLink :to="adminPath('organizers')" @click="closeMenu()">People &amp; Access</RouterLink>
              <RouterLink v-if="role === 'owner'" :to="adminPath('audit-log')" @click="closeMenu()">Audit Log</RouterLink>
              <RouterLink v-if="role === 'owner'" :to="adminPath('present-forms')" @click="closeMenu()">Present forms</RouterLink>
            </nav>
            <button v-if="signOut" type="button" @click="closeMenu(); signOut()">Sign out</button>
          </div>
        </section>
      </div>
      </Transition>
    </Teleport>
    <form
      v-if="editionOpen"
      class="conference-phone-edition"
      aria-labelledby="phone-edition-title"
      @submit.prevent="createMutation.mutate({ ...editionForm, name: editionForm.name.trim(), label: editionForm.label.trim(), task_creator_email: editionForm.task_creator_email || null })"
    >
      <h2 id="phone-edition-title">Create future edition</h2>
      <label>
        Year
        <input ref="yearInput" v-model.number="editionForm.year" class="editorial-input" type="number" min="2000" max="2200" required>
      </label>
      <label>
        Edition label
        <input v-model="editionForm.label" class="editorial-input" maxlength="120" required>
      </label>
      <AppDatePicker v-model="editionForm.provisional_date" label="Conference date" required />
      <AppDropdown v-model="editionForm.task_creator_email" label="Planning owner" :options="ownerOptions" :teleport="true" />
      <div>
        <button type="button" @click="editionOpen = false; bottomMore?.focus()">Cancel</button>
        <button type="submit" :disabled="createMutation.isPending.value">{{ createMutation.isPending.value ? 'Creating…' : 'Create edition' }}</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.conference-phone-shell {
  display: none;
}
@media (max-width: 767px) {
  .conference-phone-shell {
    display: block;
  }

  .conference-phone-header {
    position: relative;
    z-index: 40;
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    align-items: center;
    gap: 8px;
    min-height: 64px;
    padding: max(8px, env(safe-area-inset-top)) 12px 8px;
    border-bottom: 1px solid #dedbd4;
    background: #f5f2e8;
  }

  .conference-phone-header__back {
    display: grid;
    width: 44px;
    height: 44px;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #111;
    font-size: 24px;
    cursor: pointer;
    list-style: none;
  }

  .conference-phone-header__title {
    display: grid;
    min-width: 0;
    gap: 1px;
    line-height: 1.2;
  }

  .conference-phone-header__title strong {
    overflow: hidden;
    font-size: 16px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .conference-phone-header__title span {
    color: #666;
    font-size: 13px;
  }

  .conference-phone-menu-backdrop {
    position: fixed;
    z-index: var(--layer-app-modal);
    inset: 0;
    display: flex;
    align-items: end;
    background: rgb(0 0 0 / 30%);
  }

  .phone-menu-enter-active,
  .phone-menu-leave-active {
    transition: opacity 200ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .phone-menu-enter-active .conference-phone-menu__panel,
  .phone-menu-leave-active .conference-phone-menu__panel {
    transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .phone-menu-enter-from,
  .phone-menu-leave-to {
    opacity: 0;
  }

  .phone-menu-enter-from .conference-phone-menu__panel,
  .phone-menu-leave-to .conference-phone-menu__panel {
    transform: translateY(100%);
  }

  @media (prefers-reduced-motion: reduce) {
    .phone-menu-enter-active,
    .phone-menu-leave-active,
    .phone-menu-enter-active .conference-phone-menu__panel,
    .phone-menu-leave-active .conference-phone-menu__panel {
      transition: none;
    }
  }

  .conference-phone-menu__panel {
    display: flex;
    width: 100%;
    max-height: min(80dvh, 640px);
    flex-direction: column;
    border-radius: 12px 12px 0 0;
    background: #fff;
  }

  .conference-phone-menu__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    border-bottom: 1px solid #dedbd4;
  }

  .conference-phone-menu__header h2 { margin: 0; font-size: 1.15rem; }
  .conference-phone-menu__header button { min-width: 44px; min-height: 44px; border: 0; background: transparent; font-size: 1.5rem; }
  .conference-phone-menu__content { overflow-y: auto; overscroll-behavior: contain; padding: 12px 16px max(16px, env(safe-area-inset-bottom)); }

  .conference-phone-menu__panel nav {
    display: grid;
    border-bottom: 1px solid #eeeae1;
  }

  .conference-phone-menu__panel a, .conference-phone-menu__panel nav span, .conference-phone-menu__panel nav button, .conference-phone-menu__content > button {
    display: flex;
    min-height: 44px;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    border: 0;
    background: transparent;
    padding: 0 8px;
    color: #25231f;
    text-align: left;
    text-decoration: none;
    font-size: 15px;
  }

  .conference-phone-menu__panel nav span {
    color: #888;
  }

  .conference-phone-menu__panel small {
    font-size: 12px;
  }

  .conference-phone-bottom {
    position: fixed;
    z-index: 40;
    right: 0;
    bottom: 0;
    left: 0;
    display: flex;
    border-top: 1px solid #dedbd4;
    background: #fff;
    padding: 4px max(6px, env(safe-area-inset-right)) max(4px, env(safe-area-inset-bottom)) max(6px, env(safe-area-inset-left));
  }

  .conference-phone-bottom button, .conference-phone-bottom a {
    display: grid;
    min-width: 0;
    min-height: 52px;
    flex: 1;
    place-content: center;
    gap: 2px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #5b5852;
    font-size: 12px;
    font-weight: 600;
    text-align: center;
    text-decoration: none;
  }

  .conference-phone-bottom button[aria-current="page"] {
    background: #fefce8;
    color: #b10d62;
  }

  .conference-phone-bottom__icon, .conference-phone-header svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .conference-phone-edition {
    display: grid;
    gap: 12px;
    padding: 16px;
    border: 1px solid #dedbd4;
    background: #fff;
  }

  .conference-phone-edition label {
    display: grid;
    gap: 4px;
    font-weight: 600;
  }

  .conference-phone-edition > div:last-child {
    display: flex;
    justify-content: end;
    gap: 12px;
  }

  .conference-phone-edition button {
    min-height: 44px;
    padding: 0 12px;
  }

  .conference-phone-shell :is(button, a):focus-visible,
  .conference-phone-menu__panel :is(button, a):focus-visible {
    outline: 2px solid #e8117f;
    outline-offset: 2px;
  }
}
</style>
