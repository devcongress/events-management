<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AnnualConferenceTaskDrawer from '@/src/components/AnnualConferenceTaskDrawer.vue';
import VolunteerApplicationSheet from '@/src/components/VolunteerApplicationSheet.vue';
import AppDatePicker from '@/src/components/ui/AppDatePicker.vue';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import type { VolunteerApplication } from '@/types';
import { useAnnualConferenceWorkspace } from '@/src/composables/useAnnualConferenceWorkspace';
import {
  ANNUAL_CONFERENCE_STATUS_LABELS,
  ANNUAL_CONFERENCE_TASK_STATUSES,
  ANNUAL_CONFERENCE_WORKSTREAM_LABELS,
  ANNUAL_CONFERENCE_WORKSTREAMS,
  calculateAnnualConferenceHealth,
  summarizeAnnualConferenceWorkPlan,
  type AnnualConferencePhase,
  type AnnualConferencePhaseCreateInput,
  type AnnualConferencePhaseUpdateInput,
  type AnnualConferenceTask,
  type AnnualConferenceTaskCreateInput,
  type AnnualConferenceTaskStatus,
  type AnnualConferenceTaskUpdateInput,
} from '@/lib/annual-conference-work-plan';
import { isAnnualConferenceTaskAssignedTo } from '@/lib/annual-conference-access';
import {
  ACTIVE_ANNUAL_CONFERENCE_EDITION,
  DECEMBER_2026_VOLUNTEER_PUBLIC_PATH,
  annualConferencePath,
} from '@/src/annual-conference';
import {
  createAnnualConferenceEdition,
  createAnnualConferencePhase,
  createAnnualConferenceTask,
  deleteAnnualConferencePhase,
  fetchAdminSession,
  fetchAnnualConferenceEditions,
  fetchVolunteerApplications,
  queryKeys,
  reorderAnnualConferencePhases,
  updateAnnualConferencePhase,
} from '@/src/lib/api';
import { notify } from '@/src/lib/notify';
import { ORGANIZER_PHONE_ROUTE_PATH } from '@/src/organizer-viewport';

type MobileConferenceTab = 'overview' | 'tasks' | 'timeline' | 'volunteers';
type TaskStatusFilter = 'all' | AnnualConferenceTaskStatus;

const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const year = computed(() => String(route.params.year ?? ACTIVE_ANNUAL_CONFERENCE_EDITION.year));
const today = ref(currentAccraDate());
const activeTab = ref<MobileConferenceTab>('overview');
const search = ref('');
const statusFilter = ref<TaskStatusFilter>('all');
const workstreamFilter = ref('all');
const ownerFilter = ref('all');
const editionFormOpen = ref(false);
const phaseManagerOpen = ref(false);
const phaseEditorOpen = ref(false);
const editingPhaseId = ref<string | null>(null);
const pendingDeletePhase = ref<AnnualConferencePhase | null>(null);
const copiedVolunteerLink = ref(false);
const selectedVolunteerApplication = ref<VolunteerApplication | null>(null);

const editionForm = reactive({
  year: Number(year.value) + 1,
  name: 'DevCongress Annual Conference',
  label: '',
  provisional_date: '',
  task_creator_email: '',
});
const phaseForm = reactive({ name: '', starts_on: '', ends_on: '' });

const {
  workPlanQuery,
  organizersQuery,
  permissions,
  phases,
  tasks,
  selectedTask,
  editingTaskId,
  showCreateForm,
  updateTaskMutation,
  refresh,
  openTask,
  editTask,
  openCreateDrawer,
  closeTaskDrawer,
} = useAnnualConferenceWorkspace({
  year,
  today,
  refetchInterval: 30_000,
  refetchOnWindowFocus: true,
  loadOrganizers: true,
});

const sessionQuery = useQuery({ queryKey: queryKeys.adminSession, queryFn: fetchAdminSession });
const editionsQuery = useQuery({ queryKey: queryKeys.annualConferenceEditions, queryFn: fetchAnnualConferenceEditions });
const isVolunteer = computed(() => sessionQuery.data.value?.user?.role === 'volunteer');
const volunteerQuery = useQuery({
  queryKey: queryKeys.volunteerApplications,
  queryFn: fetchVolunteerApplications,
  enabled: computed(() => !isVolunteer.value && year.value === '2026' && activeTab.value === 'volunteers'),
});
const edition = computed(() => workPlanQuery.data.value?.edition);
const editions = computed(() => editionsQuery.data.value?.editions ?? []);
const summary = computed(() => summarizeAnnualConferenceWorkPlan(tasks.value));
const health = computed(() => calculateAnnualConferenceHealth(tasks.value, phases.value, today.value));
const applications = computed(() => volunteerQuery.data.value?.applications ?? []);
const organizerLabels = computed(() => Object.fromEntries(
  (organizersQuery.data.value?.organizers ?? []).map((organizer) => [
    organizer.email.trim().toLowerCase(),
    organizer.display_name?.trim() || nameFromEmail(organizer.email),
  ]),
));
const currentMemberEmail = computed(() => sessionQuery.data.value?.user?.email ?? null);
const currentPhase = computed(() => phases.value.find((phase) => today.value >= phase.starts_on && today.value <= phase.ends_on) ?? null);
const conferenceDate = computed(() => edition.value?.provisional_date ?? phases.value.at(-1)?.ends_on ?? null);
const daysToConference = computed(() => conferenceDate.value ? daysBetween(today.value, conferenceDate.value) : null);
const phaseRows = computed(() => phases.value.map((phase) => {
  const phaseTasks = tasks.value.filter((task) => task.phase_id === phase.id);
  const done = phaseTasks.filter((task) => task.status === 'done').length;
  return { ...phase, total: phaseTasks.length, done, completion: phaseTasks.length ? Math.round((done / phaseTasks.length) * 100) : 0 };
}));
const planningGaps = computed(() => sortedTasks(tasks.value.filter((task) => !task.phase_id || !task.target_date)));
const availableTabs = computed<Array<{ id: MobileConferenceTab; label: string }>>(() => isVolunteer.value
  ? [
      { id: 'overview', label: 'Overview' },
      { id: 'tasks', label: 'My tasks' },
    ]
  : [
      { id: 'overview', label: 'Overview' },
      { id: 'tasks', label: 'Work plan' },
      { id: 'timeline', label: 'Timeline' },
      ...(year.value === '2026' ? [{ id: 'volunteers' as const, label: 'Volunteers' }] : []),
    ]);
const editionOptions = computed(() => editions.value.map((item) => ({ value: String(item.year), label: item.label })));
const currentEdition = computed(() => editions.value.find((item) => String(item.year) === year.value));
const canCreateEdition = computed(() => permissions.value?.can_create_tasks === true && editions.value[0]?.year === currentEdition.value?.year);
const planningOwnerOptions = computed(() => [
  { value: '', label: `Keep ${currentEdition.value?.task_creator_email ?? 'current owner'}` },
  ...(organizersQuery.data.value?.organizers ?? [])
    .filter((organizer) => organizer.status === 'active' && organizer.role !== 'volunteer')
    .map((organizer) => ({ value: organizer.email, label: organizer.display_name?.trim() || nameFromEmail(organizer.email) })),
]);
const phaseOptions = computed(() => [
  { value: 'all', label: 'All phases' },
  ...phases.value.map((phase) => ({ value: phase.id, label: phase.name })),
  { value: 'unassigned', label: 'No phase' },
]);
const workstreamOptions = [
  { value: 'all', label: 'All workstreams' },
  ...ANNUAL_CONFERENCE_WORKSTREAMS.map((workstream) => ({ value: workstream, label: ANNUAL_CONFERENCE_WORKSTREAM_LABELS[workstream] })),
];
const statusOptions = [
  { value: 'all', label: 'All statuses' },
  ...ANNUAL_CONFERENCE_TASK_STATUSES.map((status) => ({ value: status, label: ANNUAL_CONFERENCE_STATUS_LABELS[status] })),
];
const ownerOptions = computed(() => [
  { value: 'all', label: 'All owners' },
  { value: 'unassigned', label: 'Unassigned' },
  ...(organizersQuery.data.value?.organizers ?? [])
    .filter((organizer) => organizer.status === 'active')
    .map((organizer) => ({ value: organizer.email.trim().toLowerCase(), label: organizer.display_name?.trim() || nameFromEmail(organizer.email) })),
]);
const filteredTasks = computed(() => sortedTasks(tasks.value.filter((task) => {
  const needle = search.value.trim().toLowerCase();
  const matchesSearch = !needle || [task.title, task.details, task.accountable_owner, ANNUAL_CONFERENCE_WORKSTREAM_LABELS[task.workstream]]
    .some((value) => value?.toLowerCase().includes(needle));
  const matchesStatus = statusFilter.value === 'all' || task.status === statusFilter.value;
  const matchesPhase = phaseFilterValue.value === 'all'
    || (phaseFilterValue.value === 'unassigned' ? !task.phase_id : task.phase_id === phaseFilterValue.value);
  const matchesWorkstream = workstreamFilter.value === 'all' || task.workstream === workstreamFilter.value;
  const matchesOwner = ownerFilter.value === 'all'
    || (ownerFilter.value === 'unassigned' ? !task.accountable_owner : task.accountable_owner?.toLowerCase() === ownerFilter.value);
  return matchesSearch && matchesStatus && matchesPhase && matchesWorkstream && matchesOwner;
})));
const phaseFilterValue = ref('all');
const filtersActive = computed(() => Boolean(search.value.trim())
  || statusFilter.value !== 'all'
  || phaseFilterValue.value !== 'all'
  || workstreamFilter.value !== 'all'
  || ownerFilter.value !== 'all');
const canEditSelectedTask = computed(() => {
  if (!selectedTask.value || isVolunteer.value) return false;
  if (permissions.value?.can_edit_all_tasks) return true;
  return permissions.value?.can_edit_assigned_tasks === true
    && isAnnualConferenceTaskAssignedTo(selectedTask.value, currentMemberEmail.value);
});
const volunteerPublicUrl = `${window.location.origin}${DECEMBER_2026_VOLUNTEER_PUBLIC_PATH}`;

watch(availableTabs, (tabs) => {
  if (!tabs.some((tab) => tab.id === activeTab.value)) activeTab.value = tabs[0]?.id ?? 'overview';
});

const createTaskMutation = useMutation({
  mutationFn: (input: AnnualConferenceTaskCreateInput) => createAnnualConferenceTask(year.value, input),
  onSuccess: async () => { await refresh(); closeTaskDrawer(); notify.success('Conference task added.'); },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to add the task.'),
});
const createEditionMutation = useMutation({
  mutationFn: createAnnualConferenceEdition,
  onSuccess: async (created) => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.annualConferenceEditions });
    editionFormOpen.value = false;
    notify.success(`${created.label} created.`);
    await router.replace({ name: route.name ?? undefined, params: { ...route.params, year: String(created.year) } });
  },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to create the edition.'),
});
const createPhaseMutation = useMutation({
  mutationFn: (input: AnnualConferencePhaseCreateInput) => createAnnualConferencePhase(year.value, input),
  onSuccess: async () => { await refresh(); closePhaseEditor(); notify.success('Conference phase added.'); },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to add the phase.'),
});
const updatePhaseMutation = useMutation({
  mutationFn: ({ phaseId, input }: { phaseId: string; input: AnnualConferencePhaseUpdateInput }) => updateAnnualConferencePhase(year.value, phaseId, input),
  onSuccess: async () => { await refresh(); closePhaseEditor(); notify.success('Conference phase updated.'); },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to update the phase.'),
});
const deletePhaseMutation = useMutation({
  mutationFn: (phaseId: string) => deleteAnnualConferencePhase(year.value, phaseId),
  onSuccess: async (result) => {
    await refresh();
    pendingDeletePhase.value = null;
    notify.success(result.tasks_unassigned ? `Phase removed. ${result.tasks_unassigned} tasks moved to No phase.` : 'Phase removed.');
  },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to remove the phase.'),
});

function currentAccraDate(): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Accra', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function daysBetween(start: string, end: string): number {
  return Math.ceil((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000);
}

function formatDate(value: string, long = false): string {
  return new Intl.DateTimeFormat('en-GH', long
    ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
    : { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(`${value}T12:00:00`));
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('en-GH', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function applicationInitials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || '—';
}

function nameFromEmail(value: string): string {
  return (value.split('@')[0] ?? value).split(/[._-]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function organizerDisplay(value: string | null): string {
  if (!value) return 'Unassigned';
  return organizerLabels.value[value.trim().toLowerCase()] ?? nameFromEmail(value);
}

function sortedTasks(items: AnnualConferenceTask[]): AnnualConferenceTask[] {
  return [...items].sort((left, right) => {
    const urgency = taskUrgency(left) - taskUrgency(right);
    if (urgency !== 0) return urgency;
    if (!left.target_date && !right.target_date) return left.sort_order - right.sort_order;
    if (!left.target_date) return 1;
    if (!right.target_date) return -1;
    return left.target_date.localeCompare(right.target_date) || left.sort_order - right.sort_order;
  });
}

function taskUrgency(task: AnnualConferenceTask): number {
  if (task.status === 'blocked') return 0;
  if (task.status !== 'done' && task.target_date && task.target_date < today.value) return 1;
  if (task.status === 'in_progress') return 2;
  if (task.status === 'done') return 4;
  return 3;
}

function taskTiming(task: AnnualConferenceTask): string {
  if (task.status === 'done') return 'Completed';
  if (!task.target_date) return 'No target date';
  const difference = daysBetween(today.value, task.target_date);
  if (difference < 0) return `${Math.abs(difference)}d overdue`;
  if (difference === 0) return 'Due today';
  return `Due in ${difference}d`;
}

function statusClass(status: AnnualConferenceTaskStatus): string {
  return `conference-status conference-status--${status.replace('_', '-')}`;
}

function selectTab(tab: MobileConferenceTab) {
  activeTab.value = tab;
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function clearFilters() {
  search.value = '';
  statusFilter.value = 'all';
  phaseFilterValue.value = 'all';
  workstreamFilter.value = 'all';
  ownerFilter.value = 'all';
}

function requestCreateTask() {
  if (!permissions.value?.can_create_tasks) {
    notify.info(`Only ${permissions.value?.task_creator_email ?? 'the planning owner'} can add tasks.`);
    return;
  }
  openCreateDrawer();
}

function startEditingSelectedTask() {
  if (selectedTask.value && canEditSelectedTask.value) editTask(selectedTask.value.id);
}

function handleTaskSubmit(value: AnnualConferenceTaskUpdateInput) {
  if (showCreateForm.value) {
    if (!value.title || !value.workstream || !value.accountable_owner) {
      notify.error('A title, workstream, and accountable owner are required.');
      return;
    }
    createTaskMutation.mutate({
      title: value.title,
      details: value.details ?? null,
      internal_note: value.internal_note ?? null,
      phase_id: value.phase_id ?? null,
      workstream: value.workstream,
      accountable_owner: value.accountable_owner,
      collaborators: value.collaborators ?? [],
      priority: value.priority ?? null,
      target_date: value.target_date ?? null,
      status: value.status ?? 'not_started',
      dependency_note: value.dependency_note ?? null,
    });
    return;
  }
  if (selectedTask.value) updateTaskMutation.mutate({ taskId: selectedTask.value.id, input: value });
}

function changeEdition(value: string | number) {
  const nextYear = String(value);
  if (nextYear === year.value) return;
  void router.replace({ name: route.name ?? undefined, params: { ...route.params, year: nextYear } });
}

function openEditionForm() {
  const latestYear = Math.max(Number(year.value), ...editions.value.map((item) => item.year));
  editionForm.year = latestYear + 1;
  editionForm.label = `December ${editionForm.year}`;
  editionForm.provisional_date = `${editionForm.year}-12-19`;
  editionForm.task_creator_email = '';
  editionFormOpen.value = true;
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

function openPhaseEditor(phase?: AnnualConferencePhase) {
  editingPhaseId.value = phase?.id ?? null;
  phaseForm.name = phase?.name ?? `Phase ${phases.value.length + 1}`;
  phaseForm.starts_on = phase?.starts_on ?? (phases.value.at(-1) ? nextDay(phases.value.at(-1)!.ends_on) : `${year.value}-08-01`);
  const defaultEnd = conferenceDate.value ?? `${year.value}-12-01`;
  phaseForm.ends_on = phase?.ends_on ?? (defaultEnd >= phaseForm.starts_on ? defaultEnd : phaseForm.starts_on);
  phaseEditorOpen.value = true;
}

function closePhaseEditor() {
  phaseEditorOpen.value = false;
  editingPhaseId.value = null;
}

function submitPhase() {
  const input = { name: phaseForm.name.trim(), starts_on: phaseForm.starts_on, ends_on: phaseForm.ends_on };
  if (editingPhaseId.value) updatePhaseMutation.mutate({ phaseId: editingPhaseId.value, input });
  else createPhaseMutation.mutate(input);
}

function nextDay(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function movePhase(phase: AnnualConferencePhase, direction: -1 | 1) {
  const index = phases.value.findIndex((item) => item.id === phase.id);
  if (!phases.value[index + direction]) return;
  const ids = phases.value.map((item) => item.id);
  [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
  try {
    await reorderAnnualConferencePhases(year.value, ids);
    await refresh();
  } catch (error) {
    notify.error(error instanceof Error ? error.message : 'Unable to reorder phases.');
  }
}

async function copyVolunteerLink() {
  try {
    await navigator.clipboard.writeText(volunteerPublicUrl);
    copiedVolunteerLink.value = true;
    window.setTimeout(() => { copiedVolunteerLink.value = false; }, 1800);
  } catch {
    notify.error('Unable to copy the volunteer form link.');
  }
}

function openVolunteerDisplay() {
  window.open(annualConferencePath('volunteers/display', year.value), '_blank', 'noopener,noreferrer');
}
</script>

<template>
  <section class="conference-mobile">
    <header class="conference-mobile__header">
      <RouterLink :to="ORGANIZER_PHONE_ROUTE_PATH" class="icon-button" aria-label="Back to Mobile Ops">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 4-6 6 6 6" /></svg>
      </RouterLink>
      <div class="conference-mobile__title">
        <span>Annual Conference</span>
        <strong>{{ edition?.label ?? `December ${year}` }}</strong>
      </div>
      <span class="conference-mobile__role">{{ isVolunteer ? 'Volunteer' : 'Organizer' }}</span>
    </header>

    <div v-if="!isVolunteer" class="conference-mobile__edition-bar">
      <AppDropdown :model-value="year" :options="editionOptions" density="compact" menu-class="min-w-48" @update:model-value="changeEdition" />
      <button
        v-if="canCreateEdition"
        type="button"
        class="secondary-button conference-mobile__edition-action"
        aria-label="Create new Annual Conference edition"
        @click="openEditionForm"
      >
        New edition
      </button>
    </div>

    <main class="conference-mobile__content">
      <section v-if="workPlanQuery.isPending.value" class="conference-state" aria-live="polite">
        <h1>Loading conference workspace</h1>
        <p>Getting the latest plan.</p>
      </section>

      <section v-else-if="workPlanQuery.isError.value" class="conference-state conference-state--error">
        <h1>Conference workspace unavailable</h1>
        <p>Check your connection and try again.</p>
        <button type="button" class="primary-button" @click="workPlanQuery.refetch()">Try again</button>
      </section>

      <Transition v-else name="conference-view" mode="out-in">
        <section v-if="activeTab === 'overview'" key="overview" class="conference-view">
          <header class="page-intro">
            <span>{{ isVolunteer ? 'Your conference work' : `${year} edition` }}</span>
            <h1>{{ conferenceDate ? formatDate(conferenceDate, true) : 'Conference date to be confirmed' }}</h1>
            <p>{{ isVolunteer ? 'See the work assigned to you and keep its status current.' : 'Conference delivery, planning notes, and the work that needs attention.' }}</p>
          </header>

          <section class="overview-progress" aria-labelledby="mobile-progress-title">
            <div>
              <span>{{ isVolunteer ? 'My progress' : 'Delivery progress' }}</span>
              <h2 id="mobile-progress-title">{{ summary.done }} of {{ summary.total }} complete</h2>
            </div>
            <strong>{{ summary.completion_percent }}%</strong>
            <div class="progress-track" role="progressbar" aria-label="Conference completion" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="summary.completion_percent">
              <span :style="{ transform: `scaleX(${summary.completion_percent / 100})` }" />
            </div>
          </section>

          <div class="signal-grid" aria-label="Conference operating summary">
            <button type="button" @click="statusFilter = 'blocked'; selectTab('tasks')"><span>Blocked</span><strong>{{ summary.blocked }}</strong></button>
            <div v-if="isVolunteer"><span>In progress</span><strong>{{ summary.in_progress }}</strong></div>
            <button v-else type="button" @click="ownerFilter = 'unassigned'; selectTab('tasks')"><span>Unassigned</span><strong>{{ summary.unassigned }}</strong></button>
            <div><span>Overdue</span><strong>{{ health.overdue }}</strong></div>
            <div><span>{{ isVolunteer ? 'Completed' : 'Days to go' }}</span><strong>{{ isVolunteer ? summary.done : daysToConference === null ? '—' : Math.max(0, daysToConference) }}</strong></div>
          </div>

          <section v-if="!isVolunteer" class="content-card">
            <header class="content-card__header"><div><span>Planning notes</span><h2>Edition details</h2></div></header>
            <dl class="detail-list">
              <div><dt>Venue</dt><dd>{{ edition?.venue_note ?? 'UPSA or Accra Digital Centre under consideration.' }}</dd></div>
              <div><dt>Keynote</dt><dd>{{ edition?.keynote_note ?? 'Patrick G. Awuah is preferred.' }}</dd></div>
              <div><dt>Current phase</dt><dd>{{ currentPhase?.name ?? 'No active phase today' }}</dd></div>
              <div><dt>Date status</dt><dd class="capitalize">{{ edition?.date_status ?? 'Provisional' }}</dd></div>
            </dl>
          </section>

          <button type="button" class="wide-action" @click="selectTab('tasks')">
            <span><small>{{ isVolunteer ? 'Assigned work' : 'Work plan' }}</small><strong>{{ isVolunteer ? 'Open my tasks' : 'Manage conference tasks' }}</strong></span>
            <span aria-hidden="true">→</span>
          </button>
        </section>

        <section v-else-if="activeTab === 'tasks'" key="tasks" class="conference-view">
          <header class="page-intro page-intro--with-action">
            <div><span>{{ isVolunteer ? 'Assigned work' : 'Work plan' }}</span><h1>{{ isVolunteer ? 'My tasks' : 'Conference tasks' }}</h1><p>{{ filteredTasks.length }} of {{ tasks.length }} shown</p></div>
            <button v-if="!isVolunteer" type="button" class="primary-button" :aria-disabled="!permissions?.can_create_tasks" @click="requestCreateTask">Add task</button>
          </header>

          <label class="search-field">
            <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg>
            <span class="sr-only">Search tasks</span>
            <input v-model="search" type="search" placeholder="Search tasks">
          </label>

          <div v-if="!isVolunteer" class="filter-grid">
            <AppDropdown v-model="phaseFilterValue" label="Phase" :options="phaseOptions" density="compact" />
            <AppDropdown
              :model-value="statusFilter"
              label="Status"
              :options="statusOptions"
              density="compact"
              @update:model-value="statusFilter = $event as TaskStatusFilter"
            />
            <AppDropdown v-model="workstreamFilter" class="filter-grid__wide" label="Workstream" :options="workstreamOptions" density="compact" />
            <AppDropdown v-model="ownerFilter" class="filter-grid__wide" label="Owner" :options="ownerOptions" density="compact" />
            <button type="button" class="clear-button filter-grid__wide" :disabled="!filtersActive" @click="clearFilters">Clear filters</button>
          </div>
          <AppDropdown
            v-else
            :model-value="statusFilter"
            label="Status"
            :options="statusOptions"
            density="compact"
            @update:model-value="statusFilter = $event as TaskStatusFilter"
          />

          <p v-if="filteredTasks.length === 0" class="empty-state">No tasks match these filters.</p>
          <div v-else class="task-list">
            <button v-for="task in filteredTasks" :key="task.id" type="button" class="task-row" @click="openTask(task.id)">
              <span :class="statusClass(task.status)">{{ ANNUAL_CONFERENCE_STATUS_LABELS[task.status] }}</span>
              <strong>{{ task.title }}</strong>
              <small>{{ ANNUAL_CONFERENCE_WORKSTREAM_LABELS[task.workstream] }}</small>
              <span class="task-row__meta"><span>{{ organizerDisplay(task.accountable_owner) }}</span><span>{{ taskTiming(task) }}</span></span>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 5 5 5-5 5" /></svg>
            </button>
          </div>
        </section>

        <section v-else-if="activeTab === 'timeline'" key="timeline" class="conference-view">
          <header class="page-intro page-intro--with-action">
            <div><span>Schedule</span><h1>Timeline</h1><p>Phase progress and planning gaps.</p></div>
            <button v-if="permissions?.can_manage_phases" type="button" class="secondary-button" @click="phaseManagerOpen = !phaseManagerOpen">{{ phaseManagerOpen ? 'Close' : 'Manage' }}</button>
          </header>

          <section v-if="phaseManagerOpen && permissions?.can_manage_phases" class="content-card">
            <header class="content-card__header"><div><span>Planning controls</span><h2>Manage phases</h2></div><button type="button" class="primary-button" @click="openPhaseEditor()">Add phase</button></header>
            <form v-if="phaseEditorOpen" class="mobile-form" @submit.prevent="submitPhase">
              <label><span>Phase name</span><input v-model="phaseForm.name" class="editorial-input min-h-[50px]" maxlength="80" required></label>
              <AppDatePicker v-model="phaseForm.starts_on" label="Starts" required />
              <AppDatePicker v-model="phaseForm.ends_on" label="Ends" required />
              <div class="mobile-form__actions"><button type="button" class="secondary-button" @click="closePhaseEditor">Cancel</button><button type="submit" class="primary-button">Save phase</button></div>
            </form>
            <div class="phase-manager-list">
              <article v-for="(phase, index) in phases" :key="phase.id">
                <div><strong>{{ phase.name }}</strong><span>{{ formatDate(phase.starts_on) }} – {{ formatDate(phase.ends_on) }}</span></div>
                <div class="phase-manager-actions">
                  <button type="button" :disabled="index === 0" aria-label="Move phase earlier" @click="movePhase(phase, -1)">↑</button>
                  <button type="button" :disabled="index === phases.length - 1" aria-label="Move phase later" @click="movePhase(phase, 1)">↓</button>
                  <button type="button" @click="openPhaseEditor(phase)">Edit</button>
                  <button type="button" class="danger-text" @click="pendingDeletePhase = phase">Delete</button>
                </div>
              </article>
            </div>
          </section>

          <div class="phase-list">
            <article v-for="phase in phaseRows" :key="phase.id" :class="{ 'phase-card--current': phase.id === currentPhase?.id }" class="phase-card">
              <header><div><span>{{ phase.id === currentPhase?.id ? 'Current phase' : phase.starts_on > today ? 'Upcoming' : 'Past phase' }}</span><h2>{{ phase.name }}</h2></div><strong>{{ phase.completion }}%</strong></header>
              <p>{{ formatDate(phase.starts_on) }} – {{ formatDate(phase.ends_on) }}</p>
              <div class="progress-track"><span :style="{ transform: `scaleX(${phase.completion / 100})` }" /></div>
              <small>{{ phase.done }} of {{ phase.total }} tasks complete</small>
            </article>
          </div>

          <section class="content-card">
            <header class="content-card__header"><div><span>Plan quality</span><h2>Planning gaps</h2></div><strong>{{ planningGaps.length }}</strong></header>
            <p v-if="planningGaps.length === 0" class="empty-state empty-state--plain">Every task has a phase and target date.</p>
            <div v-else class="task-list task-list--embedded">
              <button v-for="task in planningGaps" :key="task.id" type="button" class="task-row" @click="openTask(task.id)">
                <span class="gap-label">{{ !task.phase_id && !task.target_date ? 'Phase + date' : !task.phase_id ? 'Phase missing' : 'Date missing' }}</span>
                <strong>{{ task.title }}</strong><small>{{ organizerDisplay(task.accountable_owner) }}</small>
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 5 5 5-5 5" /></svg>
              </button>
            </div>
          </section>
        </section>

        <section v-else key="volunteers" class="conference-view">
          <header class="page-intro"><span>People</span><h1>Volunteers</h1><p>Share the public form and review applications.</p></header>
          <div class="volunteer-actions">
            <button type="button" class="primary-button" @click="openVolunteerDisplay">Show QR</button>
            <button type="button" class="secondary-button" @click="copyVolunteerLink">{{ copiedVolunteerLink ? 'Copied' : 'Copy link' }}</button>
            <a :href="volunteerPublicUrl" target="_blank" rel="noreferrer" class="secondary-button">Open form</a>
          </div>
          <section class="content-card">
            <header class="content-card__header"><div><span>Applications</span><h2>{{ applications.length }} {{ applications.length === 1 ? 'application' : 'applications' }}</h2></div></header>
            <p v-if="volunteerQuery.isPending.value" class="empty-state empty-state--plain">Loading applications…</p>
            <p v-else-if="volunteerQuery.isError.value" class="empty-state">Unable to load applications.</p>
            <p v-else-if="applications.length === 0" class="empty-state empty-state--plain">No volunteer applications yet.</p>
            <div v-else class="application-list">
              <button
                v-for="application in applications"
                :key="application.id"
                type="button"
                class="application-row"
                aria-haspopup="dialog"
                @click="selectedVolunteerApplication = application"
              >
                <span class="application-avatar" aria-hidden="true">{{ applicationInitials(application.name) }}</span>
                <strong>{{ application.name }}</strong>
                <time :datetime="application.created_at"><span>Joined</span>{{ formatTimestamp(application.created_at) }}</time>
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 5 5 5-5 5" /></svg>
              </button>
            </div>
          </section>
        </section>
      </Transition>
    </main>

    <nav class="conference-mobile__tabs" :style="{ '--tab-count': availableTabs.length }" aria-label="Annual Conference workspace">
      <button v-for="tab in availableTabs" :key="tab.id" type="button" :aria-current="activeTab === tab.id ? 'page' : undefined" @click="selectTab(tab.id)">
        <svg v-if="tab.id === 'overview'" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" /></svg>
        <svg v-else-if="tab.id === 'tasks'" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14v14H5zM8 3h8v5H8zM8 12l2 2 4-4M8 17h7" /></svg>
        <svg v-else-if="tab.id === 'timeline'" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4v16M18 4v16M6 8h7l-2 4h7" /></svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 10a2.5 2.5 0 1 0 0-5M3 19c0-3 2-5 5-5s5 2 5 5M13 14c3 0 5 2 5 5" /></svg>
        <span>{{ tab.label }}</span>
      </button>
    </nav>

    <AnnualConferenceTaskDrawer
      :open="showCreateForm || Boolean(selectedTask)"
      :mode="showCreateForm ? 'create' : editingTaskId ? 'edit' : 'details'"
      :task="showCreateForm ? null : selectedTask"
      :phases="phases"
      :organizer-labels="organizerLabels"
      :can-edit="canEditSelectedTask"
      :status-only="isVolunteer && permissions?.can_update_assigned_task_status === true"
      :read-only-message="isVolunteer
        ? 'Only the status of tasks assigned to you can be updated.'
        : 'Only a platform owner, planning owner, or assigned task owner/collaborator can edit this task.'"
      :submitting="showCreateForm ? createTaskMutation.isPending.value : updateTaskMutation.isPending.value"
      @close="closeTaskDrawer"
      @edit="startEditingSelectedTask"
      @cancel-edit="editingTaskId = null"
      @submit="handleTaskSubmit"
    />

    <VolunteerApplicationSheet
      :open="Boolean(selectedVolunteerApplication)"
      :application="selectedVolunteerApplication"
      @close="selectedVolunteerApplication = null"
    />

    <Teleport to="body">
      <Transition name="conference-sheet">
        <section v-if="editionFormOpen" class="conference-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-edition-title">
          <header><button type="button" class="icon-button" aria-label="Close new edition form" @click="editionFormOpen = false">×</button><div><span>Annual Conference</span><h2 id="mobile-edition-title">Create future edition</h2></div></header>
          <form @submit.prevent="submitEdition">
            <label><span>Year</span><input v-model.number="editionForm.year" class="editorial-input" type="number" min="2000" max="2200" required></label>
            <label><span>Edition label</span><input v-model="editionForm.label" class="editorial-input" maxlength="120" required></label>
            <AppDatePicker v-model="editionForm.provisional_date" label="Conference date" required />
            <AppDropdown v-model="editionForm.task_creator_email" label="Planning owner" :options="planningOwnerOptions" />
            <div class="conference-sheet__actions"><button type="button" class="secondary-button" @click="editionFormOpen = false">Cancel</button><button type="submit" class="primary-button" :disabled="createEditionMutation.isPending.value">{{ createEditionMutation.isPending.value ? 'Creating…' : 'Create edition' }}</button></div>
          </form>
        </section>
      </Transition>
    </Teleport>

    <ConfirmDialog
      :open="Boolean(pendingDeletePhase)"
      title="Delete phase?"
      :message="pendingDeletePhase ? `Tasks in ${pendingDeletePhase.name} will return to No phase. No tasks will be deleted.` : ''"
      confirm-label="Delete phase"
      cancel-label="Keep phase"
      busy-label="Deleting…"
      danger
      :busy="deletePhaseMutation.isPending.value"
      @cancel="pendingDeletePhase = null"
      @confirm="pendingDeletePhase && deletePhaseMutation.mutate(pendingDeletePhase.id)"
    />
  </section>
</template>

<style scoped>
.conference-mobile {
  --conference-bg: #f5f2e8;
  --conference-surface: #ffffff;
  --conference-soft: #faf9f5;
  --conference-border: #d9d5cc;
  --conference-text: #111111;
  --conference-muted: #66635d;
  --conference-accent: #e8117f;
  min-height: 100svh;
  background: var(--conference-bg);
  color: var(--conference-text);
}

.conference-mobile__header {
  position: sticky;
  top: 0;
  z-index: 30;
  display: grid;
  grid-template-columns: 2.75rem minmax(0, 1fr) auto;
  align-items: center;
  gap: .75rem;
  border-bottom: 1px solid var(--conference-border);
  background: rgba(245, 242, 232, .96);
  padding: max(.7rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) .7rem max(1rem, env(safe-area-inset-left));
  backdrop-filter: blur(14px);
}

.conference-mobile__title { display: grid; min-width: 0; gap: .12rem; }
.conference-mobile__title span, .page-intro > span, .page-intro > div > span, .overview-progress span, .content-card__header span, .phase-card header span, .conference-sheet header span, .mobile-form label > span {
  color: var(--conference-muted);
  font-family: var(--font-mono), monospace;
  font-size: .58rem;
  font-weight: 700;
  letter-spacing: .11em;
  text-transform: uppercase;
}
.conference-mobile__title strong { overflow: hidden; font-size: 1rem; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
.conference-mobile__role { border: 1px solid #b8b3a9; border-radius: 999px; padding: .28rem .5rem; color: #555; font-family: var(--font-mono), monospace; font-size: .52rem; font-weight: 700; text-transform: uppercase; }
.icon-button { position: relative; isolation: isolate; display: grid; width: 2.75rem; height: 2.75rem; place-items: center; border: 0; background: transparent; color: #111; transition: transform 100ms var(--motion-fast); }
.icon-button::before { position: absolute; z-index: -1; width: 2.25rem; height: 2.25rem; border: 1px solid #111; border-radius: 7px; background: #fff; content: ''; transition: background-color 150ms var(--motion-fast); }
.icon-button svg, .task-row svg, .search-field svg, .conference-mobile__tabs svg { width: .95rem; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

.conference-mobile__edition-bar { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .65rem; border-bottom: 1px solid var(--conference-border); background: var(--conference-surface); padding: .65rem 1rem; }
.secondary-button.conference-mobile__edition-action { position: relative; isolation: isolate; min-height: 2.75rem; align-self: center; border: 0; background: transparent; padding: 0 .7rem; font-size: .54rem; }
.secondary-button.conference-mobile__edition-action::before { position: absolute; inset: 50% 0 auto; z-index: -1; height: 2rem; transform: translateY(-50%); border: 1px solid #aaa69d; border-radius: 7px; background: #fff; content: ''; }
.conference-mobile__content { width: min(100%, 42rem); margin: 0 auto; padding: 1.25rem max(1rem, env(safe-area-inset-right)) calc(5.75rem + env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left)); }
.conference-view { display: grid; gap: 1rem; }
.page-intro { padding: .15rem 0 .35rem; }
.page-intro h1 { margin: .35rem 0 0; max-width: 18ch; font-size: clamp(1.7rem, 8vw, 2.3rem); font-weight: 700; letter-spacing: -.035em; line-height: 1.04; }
.page-intro p { margin: .55rem 0 0; max-width: 40rem; color: var(--conference-muted); font-size: .84rem; font-weight: 500; line-height: 1.5; }
.page-intro--with-action { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
.page-intro--with-action h1 { font-size: 1.8rem; }

.primary-button, .secondary-button, .clear-button, .volunteer-actions a { display: inline-flex; min-height: 2.75rem; align-items: center; justify-content: center; border-radius: 8px; padding: .55rem .85rem; font-family: var(--font-mono), monospace; font-size: .6rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; transition: transform 100ms var(--motion-fast), background-color 150ms var(--motion-fast), border-color 150ms var(--motion-fast), opacity 150ms var(--motion-fast); }
.primary-button { border: 1.5px solid var(--conference-accent); background: var(--conference-accent); color: #fff; }
.primary-button[aria-disabled=true] { border-color: #c9c5bb; background: #eeeae1; color: #777; }
.secondary-button { border: 1px solid #aaa69d; background: #fff; color: #222; }
.clear-button { border: 1px solid transparent; background: transparent; color: var(--conference-accent); }
.clear-button:disabled { color: #aaa; opacity: .55; }

.overview-progress, .content-card, .phase-card { overflow: hidden; border: 1px solid var(--conference-border); border-radius: 12px; background: var(--conference-surface); }
.overview-progress { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: .75rem; padding: 1rem; }
.overview-progress h2 { margin: .25rem 0 0; font-size: 1.1rem; }
.overview-progress > strong { color: var(--conference-accent); font-size: 1.8rem; line-height: 1; }
.progress-track { grid-column: 1 / -1; height: .35rem; overflow: hidden; border-radius: 999px; background: #e5e2da; }
.progress-track span { display: block; width: 100%; height: 100%; transform-origin: left; background: var(--conference-accent); transition: transform 220ms var(--motion-smooth); }
.signal-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); overflow: hidden; margin: 0; border: 1px solid var(--conference-border); border-radius: 12px; background: var(--conference-surface); }
.signal-grid > * { min-height: 4rem; border: 0; background: transparent; padding: .75rem; text-align: left; }
.signal-grid > :nth-child(even) { border-left: 1px solid var(--conference-border); }
.signal-grid > :nth-child(n + 3) { border-top: 1px solid var(--conference-border); }
.signal-grid span { display: block; color: var(--conference-muted); font-size: .68rem; font-weight: 600; }
.signal-grid strong { display: block; margin-top: .3rem; font-size: 1.3rem; font-weight: 700; }
.content-card__header { display: flex; min-height: 4rem; align-items: center; justify-content: space-between; gap: 1rem; border-bottom: 1px solid var(--conference-border); padding: .85rem 1rem; }
.content-card__header h2 { margin: .18rem 0 0; font-size: 1.05rem; }
.content-card__header > strong { color: var(--conference-accent); font-size: 1.25rem; }
.detail-list { margin: 0; }
.detail-list > div { padding: .9rem 1rem; }
.detail-list > div + div { border-top: 1px solid var(--conference-border); }
.detail-list dt { color: var(--conference-muted); font-family: var(--font-mono), monospace; font-size: .56rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.detail-list dd { margin: .35rem 0 0; font-size: .83rem; font-weight: 600; line-height: 1.5; }
.wide-action { display: flex; min-height: 4.5rem; align-items: center; justify-content: space-between; gap: 1rem; border: 1.5px solid #111; border-radius: 10px; background: #f5e642; padding: .85rem 1rem; text-align: left; transition: transform 100ms var(--motion-fast), background-color 150ms var(--motion-fast); }
.wide-action span:first-child { display: grid; gap: .2rem; }
.wide-action small { font-family: var(--font-mono), monospace; font-size: .55rem; font-weight: 700; text-transform: uppercase; }
.wide-action strong { font-size: .95rem; }

.search-field { display: grid; min-height: 3rem; grid-template-columns: 1.2rem minmax(0, 1fr); align-items: center; gap: .65rem; border: 1.5px solid #8f8b83; border-radius: 10px; background: #fff; padding: 0 .8rem; }
.search-field:focus-within { border-color: var(--conference-accent); box-shadow: 0 0 0 3px rgba(232, 17, 127, .1); }
.search-field input { min-width: 0; border: 0; background: transparent; font-size: 1rem; outline: 0; }
.filter-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .7rem; border: 1px solid var(--conference-border); border-radius: 10px; background: var(--conference-surface); padding: .8rem; }
.filter-grid__wide { grid-column: 1 / -1; }
.task-list { overflow: hidden; border: 1px solid var(--conference-border); border-radius: 12px; background: #fff; }
.task-list--embedded { border: 0; border-radius: 0; }
.task-row { position: relative; display: grid; width: 100%; min-height: 5.5rem; grid-template-columns: minmax(0, 1fr) 1.2rem; gap: .2rem .75rem; border: 0; border-bottom: 1px solid var(--conference-border); background: #fff; padding: .85rem 1rem; color: #111; text-align: left; transition: transform 100ms var(--motion-fast), background-color 150ms var(--motion-fast); }
.task-row:last-child { border-bottom: 0; }
.task-row > .conference-status, .task-row > .gap-label { grid-column: 1; width: fit-content; }
.task-row > strong, .task-row > small, .task-row__meta { grid-column: 1; }
.task-row > strong { margin-top: .15rem; font-size: .92rem; line-height: 1.3; }
.task-row > small { color: var(--conference-muted); font-size: .68rem; font-weight: 600; }
.task-row > svg { grid-column: 2; grid-row: 1 / 5; align-self: center; }
.task-row__meta { display: flex; justify-content: space-between; gap: .75rem; color: var(--conference-muted); font-size: .68rem; font-weight: 600; }
.conference-status, .gap-label { display: inline-flex; border: 1px solid currentColor; border-radius: 999px; padding: .18rem .42rem; font-family: var(--font-mono), monospace; font-size: .5rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.conference-status--not-started { border-color: #bdb9b0; background: #f4f2ec; color: #68645d; }
.conference-status--in-progress { border-color: #7bbeb8; background: #e7f5f2; color: #0f766e; }
.conference-status--blocked { border-color: #e8117f; background: #fce7f3; color: #b20d61; }
.conference-status--done { border-color: #8bc39a; background: #eaf7ee; color: #15803d; }
.gap-label { border-color: #d4a31e; background: #fff8d6; color: #7a5b00; }
.empty-state { margin: 0; border: 1px dashed #c7c2b8; border-radius: 10px; background: #fff9dc; padding: 1rem; color: #625d54; font-size: .82rem; font-weight: 600; line-height: 1.5; }
.empty-state--plain { border: 0; border-radius: 0; background: transparent; }

.mobile-form { display: grid; gap: 1rem; border-bottom: 1px solid var(--conference-border); background: var(--conference-soft); padding: 1rem; }
.mobile-form label { display: grid; gap: .45rem; }
.mobile-form__actions { display: flex; justify-content: flex-end; gap: .6rem; }
.phase-manager-list article { display: grid; gap: .75rem; padding: .9rem 1rem; }
.phase-manager-list article + article { border-top: 1px solid var(--conference-border); }
.phase-manager-list article > div:first-child { display: grid; gap: .25rem; }
.phase-manager-list article span { color: var(--conference-muted); font-size: .7rem; font-weight: 600; }
.phase-manager-actions { display: flex; flex-wrap: wrap; gap: .4rem; }
.phase-manager-actions button { min-height: 2.5rem; border: 1px solid var(--conference-border); border-radius: 7px; background: #fff; padding: 0 .65rem; font-family: var(--font-mono), monospace; font-size: .55rem; font-weight: 700; text-transform: uppercase; }
.phase-manager-actions button:disabled { opacity: .35; }
.danger-text { color: #b20d61; }
.phase-list { display: grid; gap: .65rem; }
.phase-card { padding: 1rem; }
.phase-card--current { border-color: var(--conference-accent); }
.phase-card header { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
.phase-card h2 { margin: .2rem 0 0; font-size: 1rem; }
.phase-card header > strong { color: var(--conference-accent); font-size: 1.15rem; }
.phase-card p, .phase-card small { color: var(--conference-muted); font-size: .7rem; font-weight: 600; }
.phase-card .progress-track { margin: .75rem 0 .5rem; }

.volunteer-actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .5rem; }
.application-row { display: grid; width: 100%; min-height: 4.25rem; grid-template-columns: 2.25rem minmax(0, 1fr) auto .85rem; align-items: center; gap: .7rem; border: 0; background: #fff; padding: .75rem 1rem; color: #111; text-align: left; transition: transform 100ms var(--motion-fast), background-color 150ms var(--motion-fast); }
.application-row + .application-row { border-top: 1px solid var(--conference-border); }
.application-avatar { display: grid; width: 2.25rem; height: 2.25rem; place-items: center; border: 1px solid #c9c5bb; border-radius: 50%; background: #fefce8; font-family: var(--font-mono), monospace; font-size: .62rem; font-weight: 700; }
.application-row > strong { min-width: 0; overflow: hidden; font-size: .86rem; line-height: 1.25; text-overflow: ellipsis; white-space: nowrap; }
.application-list time { display: grid; gap: .12rem; color: #555; font-family: var(--font-mono), monospace; font-size: .52rem; font-weight: 700; text-align: right; text-transform: uppercase; white-space: nowrap; }
.application-list time span { color: #918d85; font-size: .46rem; letter-spacing: .06em; }
.application-row svg { width: .85rem; fill: none; stroke: #77736b; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

.conference-mobile__tabs { position: fixed; right: 0; bottom: 0; left: 0; z-index: 40; display: grid; grid-template-columns: repeat(var(--tab-count), minmax(0, 1fr)); border-top: 1px solid var(--conference-border); background: rgba(255, 255, 255, .97); padding: .35rem max(.5rem, env(safe-area-inset-right)) max(.35rem, env(safe-area-inset-bottom)) max(.5rem, env(safe-area-inset-left)); backdrop-filter: blur(16px); }
.conference-mobile__tabs button { position: relative; display: grid; min-height: 3.5rem; place-items: center; align-content: center; gap: .2rem; border: 0; border-radius: 8px; background: transparent; color: #77736b; font-family: var(--font-mono), monospace; font-size: .5rem; font-weight: 700; text-transform: uppercase; transition: transform 100ms var(--motion-fast), color 150ms var(--motion-fast), background-color 150ms var(--motion-fast); }
.conference-mobile__tabs button[aria-current=page] { background: #fefce8; color: #111; }
.conference-mobile__tabs button[aria-current=page]::before { position: absolute; top: .2rem; width: 1.2rem; height: .16rem; border-radius: 999px; background: var(--conference-accent); content: ''; }

.conference-state { display: grid; min-height: 18rem; place-items: center; align-content: center; border: 1px solid var(--conference-border); border-radius: 12px; background: #fff; padding: 2rem; text-align: center; }
.conference-state h1 { margin: 0; font-size: 1.2rem; }
.conference-state p { margin: .4rem 0 0; color: var(--conference-muted); font-size: .82rem; }
.conference-state .primary-button { margin-top: 1rem; }
.conference-sheet { position: fixed; inset: 0; z-index: 170; min-height: 100svh; overflow-y: auto; background: var(--conference-bg, #f5f2e8); }
.conference-sheet > header { display: grid; grid-template-columns: 2.75rem minmax(0, 1fr); align-items: center; gap: .75rem; border-bottom: 1px solid #d9d5cc; background: #f5e642; padding: max(.7rem, env(safe-area-inset-top)) 1rem .7rem; }
.conference-sheet header h2 { margin: .15rem 0 0; font-size: 1rem; }
.conference-sheet > form { display: grid; gap: 1rem; width: min(100%, 42rem); margin: 0 auto; padding: 1.25rem 1rem max(1.25rem, env(safe-area-inset-bottom)); }
.conference-sheet > form > label { display: grid; gap: .45rem; }
.conference-sheet > form > label > span { color: #66635d; font-family: var(--font-mono), monospace; font-size: .58rem; font-weight: 700; text-transform: uppercase; }
.conference-sheet__actions { display: flex; justify-content: flex-end; gap: .6rem; border-top: 1px solid #d9d5cc; padding-top: 1rem; }

.conference-view-enter-active, .conference-view-leave-active { transition: opacity 140ms var(--motion-fast), transform 160ms var(--motion-smooth); }
.conference-view-enter-from { opacity: 0; transform: translate3d(.2rem, 0, 0); }
.conference-view-leave-to { opacity: 0; transform: translate3d(-.12rem, 0, 0); }
.conference-sheet-enter-active { transition: transform 240ms var(--motion-smooth), opacity 160ms var(--motion-fast); }
.conference-sheet-leave-active { transition: transform 170ms var(--motion-fast), opacity 130ms var(--motion-fast); }
.conference-sheet-enter-from, .conference-sheet-leave-to { opacity: 0; transform: translate3d(100%, 0, 0); }
.icon-button:active, .primary-button:active, .secondary-button:active, .wide-action:active, .signal-grid button:active, .task-row:active, .application-row:active, .conference-mobile__tabs button:active, .phase-manager-actions button:active { transform: scale(.97); }
.icon-button:focus-visible, .primary-button:focus-visible, .secondary-button:focus-visible, .wide-action:focus-visible, .signal-grid button:focus-visible, .task-row:focus-visible, .conference-mobile__tabs button:focus-visible, .phase-manager-actions button:focus-visible { outline: 2px solid var(--conference-accent, #e8117f); outline-offset: 2px; }
.application-row:focus-visible { outline: 2px solid var(--conference-accent, #e8117f); outline-offset: -2px; }
.capitalize { text-transform: capitalize; }

@media (hover: hover) and (pointer: fine) {
  .task-row:hover, .application-row:hover, .signal-grid button:hover { background: #fefce8; }
  .secondary-button:hover { border-color: #111; }
}

@media (prefers-reduced-motion: reduce) {
  .conference-view-enter-active, .conference-view-leave-active, .conference-sheet-enter-active, .conference-sheet-leave-active, .progress-track span, .icon-button, .primary-button, .secondary-button, .wide-action, .task-row, .application-row, .conference-mobile__tabs button { transition-duration: 1ms !important; }
  .conference-view-enter-from, .conference-view-leave-to, .conference-sheet-enter-from, .conference-sheet-leave-to { transform: none; }
}
</style>
