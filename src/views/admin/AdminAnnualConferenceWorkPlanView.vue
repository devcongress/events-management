<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useMutation, useQuery } from '@tanstack/vue-query';
import { useRoute } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AppPagination from '@/src/components/AppPagination.vue';
import AnnualConferenceNav from '@/src/components/AnnualConferenceNav.vue';
import AnnualConferenceTaskDrawer from '@/src/components/AnnualConferenceTaskDrawer.vue';
import {
  ANNUAL_CONFERENCE_STATUS_LABELS,
  ANNUAL_CONFERENCE_TASK_STATUSES,
  ANNUAL_CONFERENCE_WORKSTREAM_LABELS,
  type AnnualConferenceTask,
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

const route = useRoute();
const year = computed(() => String(route.params.year ?? ACTIVE_ANNUAL_CONFERENCE_EDITION.year));
const today = ref(currentAccraDate());
const LEDGER_PAGE_SIZE = 6;
const statusFilter = ref<'all' | AnnualConferenceTask['status']>('all');
const workstreamFilter = ref<'all' | AnnualConferenceTask['workstream']>('all');
const ownerFilter = ref('all');
const ledgerPage = ref(1);
const routeOwnerFilter = computed(() => {
  const owner = route.query.owner;
  return typeof owner === 'string' ? owner.trim() : '';
});
const routeOwnerFilterApplied = ref(false);

type LedgerViewTransition = {
  finished: Promise<void>;
  skipTransition?: () => void;
};

type LedgerViewTransitionDocument = Document & {
  startViewTransition?: (update: () => Promise<void> | void) => LedgerViewTransition;
};

let activeLedgerTransition: LedgerViewTransition | null = null;

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
  return 'All phases and unclassified tasks';
});
const canEditSelectedTask = computed(() => {
  if (!selectedTask.value || assignedAccess.value) return false;
  if (permissions.value?.can_edit_all_tasks) return true;
  return permissions.value?.can_edit_assigned_tasks === true
    && isAnnualConferenceTaskAssignedTo(selectedTask.value, currentMemberEmail.value);
});
const summary = computed(() => projection.value.summary);
const organizerLabels = computed<Record<string, string>>(() => Object.fromEntries(
  (organizersQuery.data.value?.organizers ?? []).map((organizer) => [
    organizer.email.trim().toLowerCase(),
    organizer.display_name?.trim() || organizer.email,
  ]),
));
const owners = computed(() => projection.value.owners);
const statusCounts = computed(() => projection.value.status_counts);
const ownerFilterOptions = computed(() => [
  { value: 'all', label: 'All owners' },
  { value: 'unassigned', label: 'Unassigned' },
  ...owners.value.map((owner) => ({ value: owner, label: organizerDisplay(owner) })),
]);
const phaseFilterOptions = computed(() => [
  ...phases.value.map((phase) => ({ value: phase.id, label: phase.name })),
  { value: 'unassigned', label: 'No phase' },
  { value: 'all', label: 'Entire conference' },
]);
const workstreamSummaries = computed(() => projection.value.workstreams.map((workstream) => ({
  ...workstream,
  completionPercent: workstream.completion_percent,
})));
const filtersActive = computed(() =>
  statusFilter.value !== 'all'
  || workstreamFilter.value !== 'all'
  || ownerFilter.value !== 'all');

const visibleTasks = computed(() => {
  return scopedTasks.value.filter((task) => {
    const matchesStatus = statusFilter.value === 'all' || task.status === statusFilter.value;
    const matchesWorkstream = workstreamFilter.value === 'all' || task.workstream === workstreamFilter.value;
    const matchesOwner = ownerFilter.value === 'all'
      || (ownerFilter.value === 'unassigned' ? !task.accountable_owner : task.accountable_owner === ownerFilter.value);
    return matchesStatus && matchesWorkstream && matchesOwner;
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

watch([phaseFilter, statusFilter, workstreamFilter, ownerFilter], () => {
  ledgerPage.value = 1;
});

watch(visibleTasks, () => {
  ledgerPage.value = Math.min(ledgerPage.value, ledgerPageCount.value);
});

watch([owners, routeOwnerFilter], () => {
  if (routeOwnerFilterApplied.value || !routeOwnerFilter.value || owners.value.length === 0) return;
  const requestedOwner = owners.value.find((owner) => owner === routeOwnerFilter.value);
  if (!requestedOwner) return;

  updateLedgerFilters(() => {
    phaseFilter.value = 'all';
    ownerFilter.value = requestedOwner;
  });
  routeOwnerFilterApplied.value = true;
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
    closeTaskDrawer();
    return;
  }
  openTask(taskId);
}

function handleUpdate(value: AnnualConferenceTaskUpdateInput) {
  if (!selectedTask.value) return;
  updateMutation.mutate({ taskId: selectedTask.value.id, input: value });
}

function handleDrawerSubmit(value: AnnualConferenceTaskUpdateInput) {
  if (showCreateForm.value) {
    handleCreate(value);
    return;
  }

  handleUpdate(value);
}

function updateLedgerFilters(update: () => void) {
  if (
    typeof document === 'undefined'
    || typeof window === 'undefined'
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    update();
    return;
  }

  const transitionDocument = document as LedgerViewTransitionDocument;
  if (!transitionDocument.startViewTransition) {
    update();
    return;
  }

  activeLedgerTransition?.skipTransition?.();
  const transition = transitionDocument.startViewTransition(async () => {
    update();
    await nextTick();
  });
  activeLedgerTransition = transition;

  void transition.finished
    .catch(() => undefined)
    .finally(() => {
      if (activeLedgerTransition === transition) activeLedgerTransition = null;
    });
}

function clearFilters() {
  if (!filtersActive.value) return;
  updateLedgerFilters(() => {
    statusFilter.value = 'all';
    workstreamFilter.value = 'all';
    ownerFilter.value = 'all';
  });
}

function toggleUnassignedFilter() {
  setOwnerFilter(ownerFilter.value === 'unassigned' ? 'all' : 'unassigned');
}

function setOwnerFilter(value: string | number) {
  const nextOwner = String(value);
  if (ownerFilter.value === nextOwner) return;
  updateLedgerFilters(() => {
    ownerFilter.value = nextOwner;
  });
}

function setPhaseFilter(value: string | number) {
  const nextPhase = String(value);
  if (phaseFilter.value === nextPhase) return;
  updateLedgerFilters(() => {
    phaseFilter.value = nextPhase;
    statusFilter.value = 'all';
    workstreamFilter.value = 'all';
    ownerFilter.value = 'all';
  });
}

function setStatusFilter(value: 'all' | AnnualConferenceTask['status']) {
  if (statusFilter.value === value) return;
  updateLedgerFilters(() => {
    statusFilter.value = value;
  });
}

function setWorkstreamFilter(value: 'all' | AnnualConferenceTask['workstream']) {
  if (workstreamFilter.value === value) return;
  updateLedgerFilters(() => {
    workstreamFilter.value = value;
  });
}

function handleCreate(value: AnnualConferenceTaskUpdateInput) {
  if (!value.title || !value.workstream || !value.accountable_owner) {
    notify.error('A title, workstream, and accountable owner are required.');
    return;
  }

  createMutation.mutate({
    title: value.title,
    details: value.details ?? null,
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
  return organizerLabels.value[value.trim().toLowerCase()] ?? value;
}

function statusClass(status: AnnualConferenceTask['status']): string {
  if (status === 'done') return 'border-dc-ink bg-dc-yellow text-dc-ink';
  if (status === 'blocked') return 'border-dc-ink bg-dc-pink text-white';
  if (status === 'in_progress') return 'border-[#0f766e] bg-[#e7f5f2] text-[#0f766e]';
  return 'border-dc-border bg-dc-paper-warm text-dc-gray';
}
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <AnnualConferenceNav title="Work plan">
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

      <section v-if="workPlanQuery.isLoading.value" class="editorial-panel p-8">
        <p class="font-mono text-sm font-semibold uppercase tracking-[0.14em] text-dc-gray">Loading work plan…</p>
      </section>

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
        <section :aria-label="`${phaseScopeLabel} work plan controls`" class="mb-4 overflow-hidden rounded-lg border-2 border-dc-ink bg-dc-paper">
          <div class="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5">
            <div class="min-w-0">
              <p class="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-dc-pink">Viewing phase</p>
              <div class="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 class="text-xl font-semibold text-dc-ink">{{ phaseScopeLabel }}</h2>
                <p class="text-xs font-medium text-dc-gray">{{ phaseScopeDescription }}</p>
              </div>
              <p class="mt-1 text-xs text-dc-gray">{{ scopedTasks.length }} tasks in this view</p>
            </div>

            <div class="flex w-full flex-wrap items-center justify-end gap-3 lg:w-auto">
              <div class="min-w-[8.5rem] flex-1 sm:flex-none">
                <div class="flex items-baseline justify-between gap-3">
                  <p class="text-xs font-medium text-dc-gray"><span class="text-base font-semibold text-dc-ink">{{ summary.done }}</span> of {{ summary.total }} done</p>
                  <span class="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-dc-gray">{{ summary.completion_percent }}%</span>
                </div>
                <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-dc-border" role="progressbar" :aria-label="`${phaseScopeLabel} task completion`" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="summary.completion_percent">
                  <div class="h-full bg-dc-pink" :style="{ width: `${summary.completion_percent}%` }" />
                </div>
              </div>
              <button
                v-if="!assignedAccess"
                type="button"
                class="min-h-10 rounded-md border px-3 py-1.5 text-left"
                :class="ownerFilter === 'unassigned' ? 'border-dc-pink bg-[#fce7f3] text-dc-pink' : 'border-dc-border bg-dc-paper-warm text-dc-ink hover:border-dc-pink'"
                :disabled="summary.unassigned === 0"
                :aria-pressed="ownerFilter === 'unassigned'"
                :aria-label="`Filter to ${summary.unassigned} tasks needing an accountable owner`"
                @click="toggleUnassignedFilter"
              >
                <span class="block text-sm font-semibold leading-none">{{ summary.unassigned }}</span>
                <span class="mt-1 block font-mono text-[8px] font-semibold uppercase tracking-[0.08em]">Need owners</span>
              </button>
              <div class="w-full sm:w-52">
                <AppDropdown :model-value="phaseFilter" :options="phaseFilterOptions" density="compact" menu-align="right" menu-class="min-w-52" teleport @update:model-value="setPhaseFilter" />
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-dc-border bg-dc-paper-warm p-2.5">
            <div class="flex min-w-0 max-w-full items-center gap-2">
              <span class="hidden shrink-0 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-dc-gray sm:block">Status</span>
              <div class="flex max-w-full items-center gap-1 overflow-x-auto rounded-md border border-dc-border bg-dc-paper p-1" role="group" aria-label="Filter tasks by status">
                <button type="button" class="min-h-9 shrink-0 rounded border px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em]" :class="statusFilter === 'all' ? 'border-dc-pink bg-[#fce7f3] text-dc-pink' : 'border-transparent text-dc-gray hover:bg-dc-paper-warm hover:text-dc-ink'" :aria-pressed="statusFilter === 'all'" @click="setStatusFilter('all')">
                  All <span class="ml-1 opacity-70">{{ scopedTasks.length }}</span>
                </button>
                <button v-for="status in ANNUAL_CONFERENCE_TASK_STATUSES" :key="status" type="button" class="min-h-9 shrink-0 rounded border px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em]" :class="statusFilter === status ? 'border-dc-pink bg-[#fce7f3] text-dc-pink' : 'border-transparent text-dc-gray hover:bg-dc-paper-warm hover:text-dc-ink'" :aria-pressed="statusFilter === status" @click="setStatusFilter(status)">
                  {{ ANNUAL_CONFERENCE_STATUS_LABELS[status] }} <span class="ml-1 opacity-70">{{ statusCounts[status] }}</span>
                </button>
              </div>
            </div>

            <div class="ml-auto flex w-full items-center justify-end gap-2 sm:w-auto">
              <div class="min-w-0 flex-1 sm:w-52 sm:flex-none">
                <AppDropdown :model-value="ownerFilter" :options="ownerFilterOptions" density="compact" menu-align="right" menu-class="min-w-48" teleport @update:model-value="setOwnerFilter" />
              </div>
              <button type="button" class="min-h-10 rounded-md border border-transparent px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]" :class="filtersActive ? 'text-dc-pink hover:border-dc-pink' : 'cursor-default text-dc-gray/50'" :disabled="!filtersActive" @click="clearFilters">Clear</button>
            </div>
          </div>
        </section>

        <section class="mb-4 overflow-hidden rounded-lg border-2 border-dc-ink bg-dc-paper">
          <div class="flex items-center justify-between gap-4 border-b-2 border-dc-ink bg-dc-paper-warm px-3 py-2">
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <h2 class="text-sm font-semibold text-dc-ink">{{ phaseScopeLabel }} workstreams</h2>
              <p class="text-[11px] font-medium text-dc-gray">Select one to filter the ledger.</p>
            </div>
            <button
              v-if="workstreamFilter !== 'all'"
              type="button"
              class="min-h-9 rounded-md px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-pink underline decoration-2 underline-offset-4"
              @click="setWorkstreamFilter('all')"
            >
              Show all
            </button>
          </div>
          <div class="grid sm:grid-cols-2 md:grid-cols-4">
            <button
              v-for="item in workstreamSummaries"
              :key="item.workstream"
              type="button"
              class="group min-h-[4.5rem] border-b border-dc-border px-3 py-2 text-left sm:border-r md:[&:nth-child(4n)]:border-r-0 md:[&:nth-last-child(-n+4)]:border-b-0"
              :class="workstreamFilter === item.workstream ? 'bg-dc-yellow/40' : 'bg-dc-paper hover:bg-dc-paper-warm'"
              :aria-pressed="workstreamFilter === item.workstream"
              @click="setWorkstreamFilter(workstreamFilter === item.workstream ? 'all' : item.workstream)"
            >
              <span class="flex items-start justify-between gap-3">
                <span class="text-xs font-semibold leading-4 text-dc-ink">
                  {{ ANNUAL_CONFERENCE_WORKSTREAM_LABELS[item.workstream] }}
                </span>
                <span class="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-dc-gray">
                  {{ item.done }}/{{ item.total }}
                </span>
              </span>
              <span class="mt-1.5 block h-1 overflow-hidden rounded-full bg-dc-border">
                <span class="block h-full bg-dc-ink" :style="{ width: `${item.completionPercent}%` }" />
              </span>
              <span class="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.06em] text-dc-gray">
                <span>{{ item.completionPercent }}% done</span>
                <span v-if="item.blocked" class="text-dc-pink">{{ item.blocked }} blocked</span>
                <span v-if="item.unassigned" class="text-dc-pink">{{ item.unassigned }} unassigned</span>
              </span>
            </button>
            <p v-if="!workstreamSummaries.length" class="px-4 py-6 text-sm text-dc-gray sm:col-span-2 md:col-span-4">
              No workstreams have tasks in {{ phaseScopeLabel }} yet.
            </p>
          </div>
        </section>

        <section class="annual-task-ledger overflow-hidden rounded-lg border-2 border-dc-ink bg-dc-paper">
          <div class="flex items-center justify-between gap-4 border-b-2 border-dc-ink bg-dc-paper-warm px-4 py-3">
            <div>
              <h2 class="text-lg font-bold text-dc-ink">Task ledger</h2>
              <p class="mt-0.5 text-xs font-medium text-dc-gray">
                {{ assignedAccess
                  ? `${visibleTasks.length} of ${scopedTasks.length} assigned tasks in ${phaseScopeLabel} match the current filters.`
                  : `${visibleTasks.length} of ${scopedTasks.length} ${phaseScopeLabel} tasks match the current filters.` }}
              </p>
            </div>
            <span class="hidden shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-gray sm:block">
              One accountable owner
            </span>
          </div>

          <div class="hidden border-b border-dc-border bg-dc-paper-warm px-4 py-2 md:grid md:grid-cols-[minmax(0,1.6fr)_8.5rem_10rem_7rem_2.5rem] md:gap-3">
            <span class="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-dc-gray">Task</span>
            <span class="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-dc-gray">Status</span>
            <span class="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-dc-gray">Accountable</span>
            <span class="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-dc-gray">Target</span>
            <span class="sr-only">View details</span>
          </div>

          <div aria-label="Conference tasks">
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

          <AppPagination v-model:page="ledgerPage" :page-count="ledgerPageCount" :total="visibleTasks.length" :range-start="ledgerRangeStart" :range-end="ledgerRangeEnd" item-label="tasks" aria-label="Work plan pagination" />
        </section>
      </template>
    </div>

    <AnnualConferenceTaskDrawer
      :open="showCreateForm || Boolean(selectedTask)"
      :mode="showCreateForm ? 'create' : editingTaskId ? 'edit' : 'details'"
      :task="showCreateForm ? null : selectedTask"
      :tasks="tasks"
      :phases="phases"
      :default-phase-id="selectedPhase?.id ?? null"
      :organizer-labels="organizerLabels"
      :can-edit="canEditSelectedTask"
      :status-only="permissions?.can_update_assigned_task_status === true"
      :submitting="showCreateForm ? createMutation.isPending.value : updateMutation.isPending.value"
      @close="closeTaskDrawer"
      @edit="selectedTask && startEditing(selectedTask.id)"
      @cancel-edit="editingTaskId = null"
      @submit="handleDrawerSubmit"
    />
  </div>
</template>

<style scoped>
.annual-task-ledger {
  contain: paint;
  view-transition-name: annual-task-ledger;
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
