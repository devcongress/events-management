<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  type ComponentPublicInstance,
  watch,
} from 'vue';
import { useMutation, useQuery } from '@tanstack/vue-query';
import { useRoute, useRouter } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AppPagination from '@/src/components/AppPagination.vue';
import AnnualConferenceNav from '@/src/components/AnnualConferenceNav.vue';
import AnnualConferenceTaskBoard from '@/src/components/AnnualConferenceTaskBoard.vue';
import AnnualConferenceTaskDrawer from '@/src/components/AnnualConferenceTaskDrawer.vue';
import NaviiAvatar from '@/src/components/NaviiAvatar.vue';
import AnnualConferenceRouteSkeleton from '@/src/components/ui/page-skeletons/AnnualConferenceRouteSkeleton.vue';
import { annualConferencePhaseTiming } from '@/lib/annual-conference-phase-pace';
import {
  annualConferenceOwnerAvatarKey,
  annualConferenceOwnerAvatarSeed,
  annualConferenceOwnerAvatarSeeds,
} from '@/lib/annual-conference-owner-avatar';
import {
  ANNUAL_CONFERENCE_STATUS_LABELS,
  ANNUAL_CONFERENCE_WORKSTREAM_LABELS,
  createAnnualConferenceOwnerDirectory,
  defaultAnnualConferencePhaseScope,
  matchesAnnualConferenceTaskAttention,
  resolveAnnualConferenceOwnerFilter,
  type AnnualConferenceOwnerIdentity,
  type AnnualConferenceTask,
  type AnnualConferenceTaskAttention,
  type AnnualConferenceTaskCreateInput,
  type AnnualConferenceTaskUpdateInput,
} from '@/lib/annual-conference-work-plan';
import { isAnnualConferenceTaskAssignedTo } from '@/lib/annual-conference-access';
import { ACTIVE_ANNUAL_CONFERENCE_EDITION } from '@/src/annual-conference';
import {
  createAnnualConferenceTask,
  fetchAdminSession,
  queryKeys,
} from '@/src/lib/api';
import { notify } from '@/src/lib/notify';
import { useAnnualConferenceWorkspace } from '@/src/composables/useAnnualConferenceWorkspace';
import { organizerConferenceContextQuery } from '@/src/organizer-viewport';

const route = useRoute();
const router = useRouter();
const year = computed(() => String(route.params.year ?? ACTIVE_ANNUAL_CONFERENCE_EDITION.year));
const today = ref(currentAccraDate());
const LEDGER_PAGE_SIZE = 6;
const statusFilter = ref<'all' | AnnualConferenceTask['status']>('all');
const workstreamFilter = ref<'all' | AnnualConferenceTask['workstream']>('all');
const ownerFilter = ref('all');
const attentionFilter = ref<'all' | AnnualConferenceTaskAttention>('all');
const ledgerPage = ref(1);
const annualConferenceNav = ref<ComponentPublicInstance | null>(null);
const annualConferenceNavHeight = ref(0);
const annualTaskWorkspace = ref<HTMLElement | null>(null);
const annualTaskWorkspaceHeight = ref(0);
let annualConferenceNavObserver: ResizeObserver | null = null;
let annualTaskWorkspaceObserver: ResizeObserver | null = null;

const {
  workPlanQuery,
  organizersQuery,
  permissions,
  tasks,
  phases,
  projection,
  phaseScope: phaseFilter,
  scopedTasks,
  selectedPhase,
  selectedTask,
  selectedTaskId,
  editingTaskId,
  showCreateForm,
  updateTaskMutation: updateMutation,
  pendingStatusTaskIds,
  queueTaskStatus,
  refresh,
  openTask,
  editTask,
  openCreateDrawer,
  closeTaskDrawer,
} = useAnnualConferenceWorkspace({ year, today });
const assignedAccess = computed(() => permissions.value?.access_scope === 'assigned');
const sessionQuery = useQuery({
  queryKey: queryKeys.adminSession,
  queryFn: fetchAdminSession,
});
const currentMemberEmail = computed(() => sessionQuery.data.value?.user?.email ?? null);
const isConferenceOrganizer = computed(() => {
  const role = sessionQuery.data.value?.user?.role;

  return role === 'owner' || role === 'organizer';
});
const isConferenceVolunteer = computed(() => sessionQuery.data.value?.user?.role === 'volunteer');
const usesKanbanBoard = computed(() => isConferenceOrganizer.value || isConferenceVolunteer.value);
const phaseScopeLabel = computed(() => {
  if (selectedPhase.value) return selectedPhase.value.name;
  if (phaseFilter.value === 'unassigned') return 'No phase';

  return 'Entire conference';
});
const phaseScopeDescription = computed(() => {
  if (selectedPhase.value) {
    return `${formatDate(selectedPhase.value.starts_on)} – ${formatDate(selectedPhase.value.ends_on)}`;
  }
  if (phaseFilter.value === 'unassigned') return 'Tasks still waiting for a delivery phase';

  return null;
});
const canEditSelectedTask = computed(() => {
  if (!selectedTask.value || assignedAccess.value) return false;
  if (permissions.value?.can_edit_all_tasks) return true;

  return permissions.value?.can_edit_assigned_tasks === true
    && isAnnualConferenceTaskAssignedTo(selectedTask.value, currentMemberEmail.value);
});
const summary = computed(() => projection.value.summary);
const selectedPhaseHealth = computed(() => selectedPhase.value
  ? projection.value.health.phase_health.find((health) => health.phase_id === selectedPhase.value?.id) ?? null
  : null);
const phasePaceLabel = computed(() => selectedPhase.value
  ? annualConferencePhaseTiming(selectedPhase.value, today.value)
  : null);
const summaryLabel = computed(() => selectedPhase.value ? 'Phase completion' : 'Work completed');
const organizerMembers = computed(() => organizersQuery.data.value?.organizers ?? []);
const ownerDirectory = computed(() => createAnnualConferenceOwnerDirectory(organizerMembers.value));
const organizerLabels = computed<Record<string, string>>(() => Object.fromEntries(
  [
    ...organizerMembers.value.flatMap((organizer) => [
      organizer.email,
      organizer.display_name ?? '',
      organizer.email.split('@')[0] ?? '',
    ]),
    ...tasks.value.map((task) => task.accountable_owner ?? ''),
  ]
    .filter((value) => value.trim())
    .map((value) => [value.trim().toLowerCase(), ownerDirectory.value.resolve(value).label]),
));
const owners = computed(() => {
  const identities = new Map<string, AnnualConferenceOwnerIdentity>();

  for (const task of scopedTasks.value) {
    if (!task.accountable_owner?.trim()) continue;
    const identity = ownerDirectory.value.resolve(task.accountable_owner);

    identities.set(identity.key, identity);
  }

  return [...identities.values()].sort((left, right) => left.label.localeCompare(right.label));
});
const selectedOwnerLabel = computed(() => {
  if (ownerFilter.value === 'all') return 'All owners';
  if (ownerFilter.value === 'unassigned') return 'Unassigned';

  return ownerDirectory.value.resolve(ownerFilter.value).label;
});
const ownerAvatarPreviews = computed(() => {
  const selectedOwner = ownerFilter.value !== 'all' && ownerFilter.value !== 'unassigned'
    ? ownerDirectory.value.resolve(ownerFilter.value)
    : null;
  const visibleOwners = owners.value.slice(0, 4);

  if (!selectedOwner || visibleOwners.some((owner) => owner.key === selectedOwner.key)) {
    return visibleOwners;
  }

  return [...visibleOwners.slice(0, -1), selectedOwner];
});
const ownerAvatarSeeds = computed(() => {
  const aliases = [
    ...organizerMembers.value.flatMap((organizer) => [
      organizer.email,
      organizer.display_name ?? '',
      organizer.email.split('@')[0] ?? '',
    ]),
    ...tasks.value.flatMap((task) => task.accountable_owner ? [task.accountable_owner] : []),
  ].filter((owner) => owner.trim());
  const identities = aliases.map((owner) => ownerDirectory.value.resolve(owner));
  const canonicalSeeds = annualConferenceOwnerAvatarSeeds(identities.map((owner) => owner.filter_value));
  const aliasesWithCanonicalOwners = [
    ...aliases,
    ...identities.map((owner) => owner.filter_value),
  ];

  return new Map(aliasesWithCanonicalOwners.map((owner) => {
    const identity = ownerDirectory.value.resolve(owner);

    return [
      annualConferenceOwnerAvatarKey(owner),
      annualConferenceOwnerAvatarSeed(identity.filter_value, canonicalSeeds),
    ];
  }));
});
const hiddenOwnerCount = computed(() => {
  const visibleOwnerKeys = new Set(ownerAvatarPreviews.value.map((owner) => owner.key));

  return owners.value.filter((owner) => !visibleOwnerKeys.has(owner.key)).length;
});
const selectedOwnerAvatarSeed = (owner: AnnualConferenceOwnerIdentity) => (
  annualConferenceOwnerAvatarSeed(owner.filter_value, ownerAvatarSeeds.value)
);
const ownerFilterOptions = computed(() => [
  { value: 'all', label: 'All owners' },
  { value: 'unassigned', label: 'Unassigned' },
  ...owners.value
    .filter((owner) => !ownerAvatarPreviews.value.some((preview) => preview.key === owner.key))
    .map((owner) => ({ value: owner.filter_value, label: owner.label })),
]);
const phaseFilterOptions = computed(() => [
  ...phases.value.map((phase) => ({ value: phase.id, label: phase.name })),
  { value: 'unassigned', label: 'No phase' },
  { value: 'all', label: 'Entire conference' },
]);
const filtersActive = computed(() =>
  statusFilter.value !== 'all'
  || workstreamFilter.value !== 'all'
  || ownerFilter.value !== 'all'
  || attentionFilter.value !== 'all');
const attentionFilterLabel = computed(() => ({
  overdue: 'Overdue',
  due_soon: 'Due in 7 days',
  needs_planning: 'Needs planning',
})[attentionFilter.value as AnnualConferenceTaskAttention]);
const activeWorkstreamLabel = computed(() => workstreamFilter.value === 'all'
  ? null
  : ANNUAL_CONFERENCE_WORKSTREAM_LABELS[workstreamFilter.value]);
const selectedTaskStatusSaving = computed(() => selectedTaskId.value !== null
  && pendingStatusTaskIds.value.has(selectedTaskId.value));

const effectiveScopedTasks = computed(() => scopedTasks.value);
const visibleTasks = computed(() => {
  return effectiveScopedTasks.value.filter((task) => {
    const matchesStatus = statusFilter.value === 'all' || task.status === statusFilter.value;
    const matchesWorkstream = workstreamFilter.value === 'all' || task.workstream === workstreamFilter.value;
    const matchesOwner = ownerFilter.value === 'all'
      || (ownerFilter.value === 'unassigned'
        ? !task.accountable_owner
        : ownerDirectory.value.matches(task.accountable_owner, ownerFilter.value));
    const matchesAttention = attentionFilter.value === 'all'
      || matchesAnnualConferenceTaskAttention(task, attentionFilter.value, today.value);

    return matchesStatus && matchesWorkstream && matchesOwner && matchesAttention;
  });
});
const ledgerPageCount = computed(() => Math.max(1, Math.ceil(visibleTasks.value.length / LEDGER_PAGE_SIZE)));
const paginatedTasks = computed(() => {
  const start = (ledgerPage.value - 1) * LEDGER_PAGE_SIZE;

  return visibleTasks.value.slice(start, start + LEDGER_PAGE_SIZE);
});
const ledgerRangeStart = computed(() => visibleTasks.value.length
  ? (ledgerPage.value - 1) * LEDGER_PAGE_SIZE + 1
  : 0);
const ledgerRangeEnd = computed(() => Math.min(ledgerPage.value * LEDGER_PAGE_SIZE, visibleTasks.value.length));

watch([phaseFilter, statusFilter, workstreamFilter, ownerFilter, attentionFilter], () => {
  ledgerPage.value = 1;
});

watch(visibleTasks, () => {
  ledgerPage.value = Math.min(ledgerPage.value, ledgerPageCount.value);
});

watch([() => route.fullPath, tasks, phases, organizerMembers, assignedAccess], () => {
  if (!phases.value.length) return;
  const context = organizerConferenceContextQuery({ ...route.query, section: 'tasks' }, 'tasks');
  const requestedOwner = !assignedAccess.value && context.owner
    ? resolveAnnualConferenceOwnerFilter(tasks.value, context.owner, organizerMembers.value)
    : null;
  const requestedPhase = context.phase && (
    context.phase === 'all'
    || context.phase === 'unassigned'
    || phases.value.some((phase) => phase.id === context.phase)
  ) ? context.phase : null;
  const requestedTask = context.task
    ? tasks.value.find((task) => task.id === context.task)
    : null;
  const hasInvalidContext = Boolean(
    (context.owner && (assignedAccess.value || (tasks.value.length && !requestedOwner)))
    || (context.phase && !requestedPhase)
    || (context.task && tasks.value.length && !requestedTask),
  );

  updateLedgerFilters(() => {
    phaseFilter.value = requestedPhase
      ?? (context.owner ? 'all' : defaultAnnualConferencePhaseScope(phases.value, today.value));
    statusFilter.value = (context.status ?? 'all') as typeof statusFilter.value;
    workstreamFilter.value = (context.workstream ?? 'all') as typeof workstreamFilter.value;
    ownerFilter.value = requestedOwner ?? 'all';
    attentionFilter.value = (context.attention ?? 'all') as typeof attentionFilter.value;
  }, () => {
    if (hasInvalidContext) void replaceWorkPlanContext({ task: requestedTask?.id ?? null });
  });

  if (requestedTask && selectedTaskId.value !== requestedTask.id) openTask(requestedTask.id);
  if (!context.task && selectedTaskId.value) closeTaskDrawer();
}, { immediate: true });

const createMutation = useMutation({
  mutationFn: (input: AnnualConferenceTaskCreateInput) => createAnnualConferenceTask(year.value, input),
  onSuccess: async () => {
    await refresh();
    showCreateForm.value = false;
    notify.success('Conference task added.');
  },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to add the task.'),
});

function startEditing(taskId: string) {
  const task = tasks.value.find((item) => item.id === taskId);

  if (!task || assignedAccess.value) return;
  const canEditTask = permissions.value?.can_edit_all_tasks === true
    || (permissions.value?.can_edit_assigned_tasks === true
      && isAnnualConferenceTaskAssignedTo(task, currentMemberEmail.value));

  if (!canEditTask) return;
  editTask(taskId);
}

function canMoveTask(task: AnnualConferenceTask): boolean {
  if (permissions.value?.can_update_all_task_status) return true;

  const canUpdateAssignedStatus = permissions.value?.can_edit_all_tasks === true
    || permissions.value?.can_edit_assigned_tasks === true
    || permissions.value?.can_update_assigned_task_status === true;

  return canUpdateAssignedStatus
    && isAnnualConferenceTaskAssignedTo(task, currentMemberEmail.value);
}

function moveTask(task: AnnualConferenceTask, status: AnnualConferenceTask['status']) {
  if (!canMoveTask(task) || task.status === status) return;

  queueTaskStatus(task.id, status);
}

function openBoardTask(task: AnnualConferenceTask) {
  toggleTask(task.id);
}

function requestCreateDrawer() {
  if (!permissions.value) {
    notify.info('Task permissions are still loading.');

    return;
  }

  if (!permissions.value.can_create_tasks) {
    notify.info(
      `Only a platform owner or this edition’s planning owner (${permissions.value.task_creator_email}) can add tasks. Other organizers can edit assigned tasks.`,
    );

    return;
  }

  openCreateDrawer();
}

function toggleTask(taskId: string) {
  if (selectedTaskId.value === taskId) {
    closeTaskWithContext();

    return;
  }
  openTask(taskId);
  void pushWorkPlanContext({ task: taskId });
}

function workPlanContextQuery(patch: { task?: string | null } = {}): Record<string, string> {
  const task = patch.task === undefined ? selectedTaskId.value : patch.task;
  const context = organizerConferenceContextQuery({
    section: 'tasks',
    phase: phaseFilter.value,
    ...(statusFilter.value !== 'all' ? { status: statusFilter.value } : {}),
    ...(workstreamFilter.value !== 'all' ? { workstream: workstreamFilter.value } : {}),
    ...(ownerFilter.value !== 'all' ? { owner: ownerFilter.value } : {}),
    ...(attentionFilter.value !== 'all' ? { attention: attentionFilter.value } : {}),
    ...(task ? { task } : {}),
  }, 'tasks');

  delete context.section;

  return context;
}

function replaceWorkPlanContext(patch: { task?: string | null } = {}) {
  return router.replace({ path: route.path, query: workPlanContextQuery(patch) });
}

function pushWorkPlanContext(patch: { task?: string | null } = {}) {
  return router.push({ path: route.path, query: workPlanContextQuery(patch) });
}

function closeTaskWithContext() {
  closeTaskDrawer();
  void replaceWorkPlanContext({ task: null });
}

function handleUpdate(value: AnnualConferenceTaskUpdateInput) {
  if (!selectedTask.value) return;
  if (selectedTaskStatusSaving.value) {
    notify.info('Task status is still saving. Try again in a moment.');

    return;
  }

  updateMutation.mutate({ taskId: selectedTask.value.id, input: value });
}

function handleDrawerSubmit(value: AnnualConferenceTaskUpdateInput) {
  if (showCreateForm.value) {
    handleCreate(value);

    return;
  }

  handleUpdate(value);
}

function updateLedgerFilters(update: () => void, afterUpdate?: () => void) {
  update();
  afterUpdate?.();
}

function clearFilters() {
  if (!filtersActive.value) return;
  updateLedgerFilters(() => {
    statusFilter.value = 'all';
    workstreamFilter.value = 'all';
    ownerFilter.value = 'all';
    attentionFilter.value = 'all';
  }, () => { void replaceWorkPlanContext(); });
}

function clearAttentionFilter() {
  if (attentionFilter.value === 'all') return;
  updateLedgerFilters(() => {
    attentionFilter.value = 'all';
  }, () => { void replaceWorkPlanContext(); });
}

function clearWorkstreamFilter() {
  if (workstreamFilter.value === 'all') return;

  updateLedgerFilters(() => {
    workstreamFilter.value = 'all';
  }, () => { void replaceWorkPlanContext(); });
}

function toggleUnassignedFilter() {
  setOwnerFilter(ownerFilter.value === 'unassigned' ? 'all' : 'unassigned');
}

function setOwnerFilter(value: string | number) {
  const nextOwner = String(value);

  if (ownerFilter.value === nextOwner) return;
  updateLedgerFilters(() => {
    ownerFilter.value = nextOwner;
  }, () => { void replaceWorkPlanContext(); });
}

function setPhaseFilter(value: string | number) {
  const nextPhase = String(value);

  if (phaseFilter.value === nextPhase) return;
  updateLedgerFilters(() => {
    phaseFilter.value = nextPhase;
    statusFilter.value = 'all';
    workstreamFilter.value = 'all';
    ownerFilter.value = 'all';
    attentionFilter.value = 'all';
  }, () => { void replaceWorkPlanContext(); });
}

function setStatusFilter(value: 'all' | AnnualConferenceTask['status']) {
  if (statusFilter.value === value) return;
  updateLedgerFilters(() => {
    statusFilter.value = value;
  }, () => { void replaceWorkPlanContext(); });
}

function handleCreate(value: AnnualConferenceTaskUpdateInput) {
  if (!value.title || !value.workstream || !value.accountable_owner) {
    notify.error('A title, workstream, and accountable owner are required.');

    return;
  }

  createMutation.mutate({
    title: value.title,
    details: value.details ?? null,
    details_format: value.details_format,
    phase_id: value.phase_id ?? null,
    workstream: value.workstream,
    accountable_owner: value.accountable_owner,
    collaborators: value.collaborators ?? [],
    priority: value.priority ?? null,
    target_date: value.target_date ?? null,
    status: value.status ?? 'not_started',
    dependency_task_ids: value.dependency_task_ids ?? [],
  });
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00`));
}

function currentAccraDate(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Accra', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';

  return `${part('year')}-${part('month')}-${part('day')}`;
}

function organizerDisplay(value: string | null): string {
  if (!value) return 'Unassigned';

  return ownerDirectory.value.resolve(value).label;
}

function statusClass(status: AnnualConferenceTask['status']): string {
  if (status === 'done') return 'border-dc-ink bg-dc-yellow text-dc-ink';
  if (status === 'blocked') return 'border-dc-ink bg-dc-pink text-white';
  if (status === 'in_progress') return 'border-[#0f766e] bg-[#e7f5f2] text-[#0f766e]';

  return 'border-dc-border bg-dc-paper-warm text-dc-gray';
}

function updateAnnualConferenceNavHeight() {
  const navigationElement = annualConferenceNav.value?.$el;

  if (navigationElement instanceof HTMLElement) {
    annualConferenceNavHeight.value = navigationElement.getBoundingClientRect().height;
  }
}

function updateAnnualTaskWorkspaceHeight() {
  if (annualTaskWorkspace.value) {
    annualTaskWorkspaceHeight.value = annualTaskWorkspace.value.getBoundingClientRect().height;
  }
}

onMounted(() => {
  const navigationElement = annualConferenceNav.value?.$el;

  if (!(navigationElement instanceof HTMLElement)) return;

  updateAnnualConferenceNavHeight();
  annualConferenceNavObserver = new ResizeObserver(updateAnnualConferenceNavHeight);
  annualConferenceNavObserver.observe(navigationElement);
});

watch(annualTaskWorkspace, (workspace) => {
  annualTaskWorkspaceObserver?.disconnect();
  if (!workspace) return;

  updateAnnualTaskWorkspaceHeight();
  annualTaskWorkspaceObserver = new ResizeObserver(updateAnnualTaskWorkspaceHeight);
  annualTaskWorkspaceObserver.observe(workspace);
}, { flush: 'post' });

onBeforeUnmount(() => {
  annualConferenceNavObserver?.disconnect();
  annualTaskWorkspaceObserver?.disconnect();
});
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <AnnualConferenceNav ref="annualConferenceNav" title="Work plan">
        <template #description>
          <p class="mt-1 max-w-4xl text-xs font-medium leading-5 text-dc-gray">
            {{ assignedAccess
              ? 'These are the Annual Conference tasks assigned to you. Open a task to review it or update its status.'
              : 'See delivery health at a glance, then open only the task that needs attention.' }}
            <span
              v-if="permissions && !permissions.can_create_tasks && !assignedAccess"
              id="annual-task-create-permission"
              class="block sm:ml-1 sm:inline"
            >
              New tasks: platform owner or planning owner <span class="font-mono font-semibold text-dc-ink">{{ permissions.task_creator_email }}</span>. Other organizers edit assigned tasks.
            </span>
          </p>
        </template>
        <template #actions>
          <button
            v-if="!assignedAccess"
            type="button"
            class="motion-press inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border-2 px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]"
            :class="permissions?.can_create_tasks
              ? 'border-dc-ink bg-dc-pink text-white shadow-[3px_3px_0_#111111]'
              : 'cursor-not-allowed border-dc-ink bg-dc-paper text-dc-gray shadow-[2px_2px_0_#111111]'"
            :aria-disabled="permissions?.can_create_tasks ? undefined : 'true'"
            :aria-describedby="permissions && !permissions.can_create_tasks ? 'annual-task-create-permission' : undefined"
            :title="permissions && !permissions.can_create_tasks
              ? `Only a platform owner or this edition’s planning owner (${permissions.task_creator_email}) can add tasks.`
              : undefined"
            @click="requestCreateDrawer"
          >
            Add task
            <svg
              v-if="!permissions?.can_create_tasks"
              viewBox="0 0 20 20"
              class="size-3.5 text-dc-pink"
              fill="none"
              aria-hidden="true"
            >
              <path d="M6.5 8V6.5a3.5 3.5 0 0 1 7 0V8M5.5 8h9A1.5 1.5 0 0 1 16 9.5v6A1.5 1.5 0 0 1 14.5 17h-9A1.5 1.5 0 0 1 4 15.5v-6A1.5 1.5 0 0 1 5.5 8Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </template>
      </AnnualConferenceNav>

      <AnnualConferenceRouteSkeleton v-if="workPlanQuery.isLoading.value" variant="work-plan" />

      <section v-else-if="workPlanQuery.isError.value" class="editorial-panel border-dc-pink p-8">
        <p class="text-lg font-semibold text-dc-ink">The work plan could not be loaded.</p>
        <p class="mt-2 text-sm font-medium text-dc-gray">
          {{ workPlanQuery.error.value instanceof Error ? workPlanQuery.error.value.message : 'Please try again.' }}
        </p>
        <button
          type="button"
          class="motion-press mt-5 min-h-11 rounded-md border-2 border-dc-ink bg-dc-yellow px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em]"
          @click="workPlanQuery.refetch()"
        >
          Try again
        </button>
      </section>

      <template v-else>
        <section
          ref="annualTaskWorkspace"
          :aria-label="`${phaseScopeLabel} work plan controls`"
          class="annual-task-workspace border-2 border-dc-ink bg-dc-paper md:sticky md:z-30"
          :style="{ '--annual-conference-nav-height': `${annualConferenceNavHeight}px` }"
        >
          <div class="annual-task-workspace__controls flex flex-wrap items-center justify-between gap-4 border-b border-dc-ink bg-dc-paper px-4 py-3.5">
            <div class="min-w-0">
              <p class="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-dc-pink">Viewing phase</p>
              <div class="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 class="text-xl font-semibold text-dc-ink">{{ phaseScopeLabel }}</h2>
                <p v-if="phaseScopeDescription" class="text-xs font-medium text-dc-gray">{{ phaseScopeDescription }}</p>
              </div>
              <p class="mt-1 text-xs text-dc-gray">{{ scopedTasks.length }} tasks in this view</p>
            </div>

            <div class="flex w-full flex-wrap items-center justify-end gap-3 lg:w-auto">
              <section class="min-w-[11rem] flex-1 sm:flex-none" :aria-label="`${phaseScopeLabel} pace`">
                <template v-if="summary.total">
                  <p class="font-mono text-[8px] font-semibold uppercase tracking-[0.1em] text-dc-gray">{{ summaryLabel }}</p>
                  <div class="mt-0.5 flex items-baseline justify-between gap-3">
                    <p class="text-lg font-semibold leading-none text-dc-ink">{{ summary.completion_percent }}<span class="text-xs text-dc-gray">%</span></p>
                    <span class="text-[11px] font-medium text-dc-gray">{{ summary.done }} of {{ summary.total }} complete</span>
                  </div>
                  <div class="relative mt-2 h-1.5 overflow-hidden rounded-full bg-dc-border" role="progressbar" :aria-label="`${phaseScopeLabel} completion: ${summary.completion_percent}%`" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="summary.completion_percent">
                    <div class="h-full bg-[#0f766e]" :style="{ width: `${summary.completion_percent}%` }" />
                    <span
                      v-if="selectedPhaseHealth"
                      class="absolute -top-0.5 bottom-[-0.125rem] w-0.5 rounded-full bg-[#d97706]"
                      :style="{
                        left: selectedPhaseHealth.time_elapsed_percent === 100
                          ? 'calc(100% - 2px)'
                          : `${selectedPhaseHealth.time_elapsed_percent}%`,
                      }"
                      aria-hidden="true"
                    />
                  </div>
                  <p v-if="selectedPhaseHealth && phasePaceLabel" class="mt-1.5 text-[10px] font-medium text-dc-gray">
                    <span class="font-semibold text-[#92400e]">{{ selectedPhaseHealth.time_elapsed_percent }}% elapsed</span>
                    <span aria-hidden="true"> · </span>
                    {{ phasePaceLabel }}
                  </p>
                  <p v-else class="mt-1.5 text-[10px] font-medium text-dc-gray">Across this view</p>
                </template>
                <p v-else class="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-dc-gray">No tasks yet</p>
              </section>
              <span class="hidden h-10 w-px bg-dc-border lg:block" aria-hidden="true" />
              <button
                v-if="!assignedAccess && summary.unassigned > 0"
                type="button"
                class="min-h-10 rounded-md border px-3 py-1.5 text-left"
                :class="ownerFilter === 'unassigned' ? 'border-dc-pink bg-[#fce7f3] text-dc-pink' : 'border-dc-border bg-dc-paper-warm text-dc-ink hover:border-dc-pink'"
                :aria-pressed="ownerFilter === 'unassigned'"
                :aria-label="`Filter to ${summary.unassigned} tasks needing an accountable owner`"
                @click="toggleUnassignedFilter"
              >
                <span class="block text-sm font-semibold leading-none">{{ summary.unassigned }}</span>
                <span class="mt-1 block font-mono text-[8px] font-semibold uppercase tracking-[0.08em]">Need owners</span>
              </button>
              <p v-else-if="!assignedAccess" class="inline-flex min-h-10 items-center gap-1.5 px-1 text-[10px] font-semibold text-[#0f766e]">
                <svg viewBox="0 0 20 20" class="size-3.5" fill="none" aria-hidden="true">
                  <path d="m5.25 10.25 3.05 3.05 6.45-6.6" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" />
                </svg>
                All assigned
              </p>
              <div class="w-full sm:w-52">
                <AppDropdown :model-value="phaseFilter" :options="phaseFilterOptions" density="compact" menu-align="right" menu-class="min-w-52" teleport @update:model-value="setPhaseFilter" />
              </div>
              <div v-if="!assignedAccess" class="w-full sm:w-auto">
                <div class="flex w-fit items-center rounded-full border border-dc-border bg-dc-paper-warm p-1" role="group" aria-label="Filter tasks by owner">
                  <button
                    v-for="(owner, index) in ownerAvatarPreviews"
                    :key="owner.key"
                    type="button"
                    class="group relative size-7.5 shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-dc-pink focus:ring-offset-2"
                    :class="index > 0 ? '-ml-2.5' : ''"
                    :aria-label="`Filter tasks by owner: ${owner.label}`"
                    :aria-describedby="`owner-filter-tooltip-${owner.key}`"
                    :aria-pressed="ownerFilter === owner.filter_value"
                    @click="setOwnerFilter(owner.filter_value)"
                  >
                    <NaviiAvatar
                      :seed="selectedOwnerAvatarSeed(owner)"
                      title=""
                      :size="30"
                      :class="ownerFilter === owner.filter_value
                        ? '!border-2 !border-dc-paper !outline !outline-2 !outline-dotted !outline-dc-pink'
                        : '!border-2 !border-dc-paper'"
                      aria-hidden="true"
                    />
                    <span
                      :id="`owner-filter-tooltip-${owner.key}`"
                      role="tooltip"
                      class="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-dc-border bg-dc-ink px-2 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-dc-paper opacity-0 shadow-[0_6px_16px_rgba(17,17,17,0.2)] transition-opacity duration-100 group-hover:opacity-100 group-focus:opacity-100"
                    >
                      {{ owner.label }}
                    </span>
                  </button>
                  <AppDropdown
                    :model-value="ownerFilter"
                    :options="ownerFilterOptions"
                    density="compact"
                    menu-align="right"
                    menu-class="min-w-52"
                    teleport
                    :aria-label="`More owner filters. Current filter: ${selectedOwnerLabel}`"
                    trigger-class="!ml-1 !min-h-8 !w-auto !rounded-none !border-0 !bg-transparent !px-1.5 !py-0 !text-dc-gray !shadow-none hover:!bg-transparent"
                    @update:model-value="setOwnerFilter"
                  >
                    <template #trigger>
                      <span v-if="hiddenOwnerCount" class="font-mono text-[11px] font-semibold tracking-[-0.04em]" aria-hidden="true">+{{ hiddenOwnerCount }}</span>
                      <svg v-else viewBox="0 0 20 20" class="size-3.5" fill="none" aria-hidden="true">
                        <path d="M5.5 8l4.5 4.5L14.5 8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
                      </svg>
                    </template>
                  </AppDropdown>
                </div>
              </div>
              <div class="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto">
                <button
                  v-if="statusFilter !== 'all'"
                  type="button"
                  class="min-h-10 rounded-md border border-dc-pink bg-[#fce7f3] px-3 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-dc-pink"
                  :aria-label="`Clear ${ANNUAL_CONFERENCE_STATUS_LABELS[statusFilter]} status filter`"
                  @click="setStatusFilter('all')"
                >
                  {{ ANNUAL_CONFERENCE_STATUS_LABELS[statusFilter] }} ×
                </button>
                <button
                  v-if="activeWorkstreamLabel"
                  type="button"
                  class="min-h-10 rounded-md border border-dc-pink bg-[#fce7f3] px-3 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-dc-pink"
                  :aria-label="`Clear ${activeWorkstreamLabel} workstream filter`"
                  @click="clearWorkstreamFilter"
                >
                  {{ activeWorkstreamLabel }} ×
                </button>
                <button
                  v-if="attentionFilter !== 'all'"
                  type="button"
                  class="min-h-10 rounded-md border border-dc-pink bg-[#fce7f3] px-3 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-dc-pink"
                  aria-label="Clear attention filter"
                  @click="clearAttentionFilter"
                >
                  {{ attentionFilterLabel }} ×
                </button>
                <button
                  v-if="!isConferenceVolunteer || filtersActive"
                  type="button"
                  class="min-h-10 rounded-md border border-transparent px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]"
                  :class="filtersActive
                    ? 'text-dc-pink hover:border-dc-pink'
                    : 'cursor-not-allowed text-dc-gray/45'"
                  :disabled="!filtersActive"
                  :aria-disabled="!filtersActive"
                  @click="clearFilters"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

        </section>

        <section class="annual-task-ledger rounded-b-lg border-x-2 border-b-2 border-dc-ink bg-dc-paper">
          <div
            class="hidden border-b border-dc-border bg-dc-paper-warm px-4 py-2 md:grid md:grid-cols-[minmax(0,1.6fr)_8.5rem_10rem_7rem_2.5rem] md:gap-3"
            :class="{ 'lg:hidden': usesKanbanBoard }"
          >
            <span class="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-dc-gray">Task</span>
            <span class="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-dc-gray">Status</span>
            <span class="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-dc-gray">Accountable</span>
            <span class="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-dc-gray">Target</span>
            <span class="sr-only">View details</span>
          </div>

          <div
            v-if="usesKanbanBoard"
            class="hidden lg:block"
          >
            <AnnualConferenceTaskBoard
              :style="{
                '--task-board-sticky-offset': `calc(${annualConferenceNavHeight}px + ${annualTaskWorkspaceHeight}px + .75rem)`,
              }"
              :tasks="visibleTasks"
              :organizer-labels="organizerLabels"
              :owner-avatar-seeds="ownerAvatarSeeds"
              :can-move-task="canMoveTask"
              :saving-task-ids="pendingStatusTaskIds"
              @open-task="openBoardTask"
              @change-status="moveTask"
            />
          </div>

          <div
            aria-label="Conference tasks"
            :class="{ 'lg:hidden': usesKanbanBoard }"
          >
            <div v-if="visibleTasks.length === 0" class="grid min-h-[18rem] place-items-center p-8 text-center">
              <div>
                <h3 class="text-xl font-semibold text-dc-ink">{{ assignedAccess && tasks.length === 0 ? 'No tasks assigned yet' : scopedTasks.length ? 'No matching tasks' : `No tasks in ${phaseScopeLabel}` }}</h3>
                <p class="mt-2 text-sm font-medium text-dc-gray">
                  {{ assignedAccess && tasks.length === 0
                    ? 'An organizer will assign conference work to you here.'
                    : scopedTasks.length
                      ? 'Clear or change the filters to see the work plan.'
                      : 'Switch phases or add the first task for this phase.' }}
                </p>
                <button
                  v-if="scopedTasks.length"
                  type="button"
                  class="mt-4 min-h-10 rounded-md border-2 border-dc-ink bg-dc-yellow px-4 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]"
                  @click="clearFilters"
                >
                  Clear filters
                </button>
              </div>
            </div>

            <article
              v-for="task in paginatedTasks"
              v-else
              :key="task.id"
              class="border-b border-dc-border last:border-b-0"
              :class="selectedTaskId === task.id ? 'bg-dc-paper-warm' : 'bg-dc-paper'"
            >
              <div class="grid min-h-14 grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-3 px-4 py-2 md:grid-cols-[minmax(0,1.6fr)_8.5rem_10rem_7rem_2.5rem]">
                <button
                  type="button"
                  class="min-w-0 py-1 text-left"
                  :aria-expanded="selectedTaskId === task.id"
                  aria-controls="annual-conference-task-drawer"
                  @click="toggleTask(task.id)"
                >
                  <span class="block truncate text-sm font-semibold text-dc-ink">{{ task.title }}</span>
                  <span class="mt-0.5 flex min-w-0 items-center gap-2">
                    <span class="truncate font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-dc-gray">
                      {{ ANNUAL_CONFERENCE_WORKSTREAM_LABELS[task.workstream] }}
                    </span>
                    <span v-if="task.priority" class="shrink-0 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-dc-pink">
                      {{ task.priority }}
                    </span>
                    <span class="shrink-0 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-dc-gray">
                      {{ phases.find((phase) => phase.id === task.phase_id)?.name ?? 'No phase' }}
                    </span>
                  </span>
                  <span class="mt-1 flex items-center gap-2 md:hidden">
                    <span
                      class="rounded border px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.08em]"
                      :class="statusClass(task.status)"
                    >
                      {{ ANNUAL_CONFERENCE_STATUS_LABELS[task.status] }}
                    </span>
                    <span class="truncate text-[11px] font-medium" :class="task.accountable_owner ? 'text-dc-gray' : 'text-dc-pink'">
                      {{ organizerDisplay(task.accountable_owner) }}
                    </span>
                  </span>
                </button>

                <span
                  class="hidden w-fit rounded-md border-2 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] md:inline-flex"
                  :class="statusClass(task.status)"
                >
                  {{ ANNUAL_CONFERENCE_STATUS_LABELS[task.status] }}
                </span>
                <span
                  class="hidden truncate text-xs font-semibold md:block"
                  :class="task.accountable_owner ? 'text-dc-ink' : 'text-dc-pink'"
                  :title="task.accountable_owner ?? 'Unassigned'"
                >
                  {{ organizerDisplay(task.accountable_owner) }}
                </span>
                <span class="hidden text-xs font-medium text-dc-gray md:block">
                  {{ task.target_date ? formatDate(task.target_date) : 'No date' }}
                </span>
                <button
                  type="button"
                  class="grid min-h-10 min-w-10 place-items-center rounded-md border-2 border-transparent text-dc-ink hover:border-dc-ink hover:bg-dc-yellow"
                  :aria-label="`View details for ${task.title}`"
                  :aria-expanded="selectedTaskId === task.id"
                  aria-controls="annual-conference-task-drawer"
                  @click="toggleTask(task.id)"
                >
                  <svg
                    viewBox="0 0 20 20"
                    class="size-[1.1rem]"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M2.25 10s2.7-4.5 7.75-4.5 7.75 4.5 7.75 4.5-2.7 4.5-7.75 4.5S2.25 10 2.25 10Z"
                      stroke="currentColor"
                      stroke-width="1.7"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                    <circle cx="10" cy="10" r="2.15" stroke="currentColor" stroke-width="1.7" />
                  </svg>
                </button>
              </div>
            </article>
          </div>

          <AppPagination
            :class="{ 'lg:hidden': usesKanbanBoard }"
            v-model:page="ledgerPage"
            :page-count="ledgerPageCount"
            :total="visibleTasks.length"
            :range-start="ledgerRangeStart"
            :range-end="ledgerRangeEnd"
            item-label="tasks"
            aria-label="Work plan pagination"
          />
        </section>
      </template>
    </div>

    <AnnualConferenceTaskDrawer
      :year="year"
      :open="showCreateForm || Boolean(selectedTask)"
      :mode="showCreateForm ? 'create' : editingTaskId ? 'edit' : 'details'"
      :task="showCreateForm ? null : selectedTask"
      :tasks="tasks"
      :phases="phases"
      :default-phase-id="selectedPhase?.id ?? null"
      :organizer-labels="organizerLabels"
      :can-edit="canEditSelectedTask"
      :status-only="permissions?.can_update_assigned_task_status === true"
      :submitting="showCreateForm ? createMutation.isPending.value : updateMutation.isPending.value || selectedTaskStatusSaving"
      @close="closeTaskWithContext"
      @edit="selectedTask && startEditing(selectedTask.id)"
      @cancel-edit="editingTaskId = null"
      @submit="handleDrawerSubmit"
    />
  </div>
</template>

<style scoped>
.annual-task-ledger {
  view-transition-name: annual-task-ledger;
}

@media (min-width: 768px) {
  .annual-task-workspace {
    top: var(--annual-conference-nav-height);
  }
}

@supports (view-transition-name: annual-task-ledger) {
  :global(::view-transition-group(annual-task-ledger)) {
    animation-duration: 220ms;
    animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
  }

  :global(::view-transition-old(annual-task-ledger)),
  :global(::view-transition-new(annual-task-ledger)) {
    animation-duration: 220ms;
    mix-blend-mode: normal;
  }

  :global(::view-transition-old(root)),
  :global(::view-transition-new(root)) {
    animation: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  :global(::view-transition-group(annual-task-ledger)),
  :global(::view-transition-old(annual-task-ledger)),
  :global(::view-transition-new(annual-task-ledger)) {
    animation-duration: 1ms;
  }
}
</style>
