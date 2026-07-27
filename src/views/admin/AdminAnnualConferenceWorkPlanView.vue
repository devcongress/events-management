<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AnnualConferenceNav from '@/src/components/AnnualConferenceNav.vue';
import AnnualConferenceTaskDrawer from '@/src/components/AnnualConferenceTaskDrawer.vue';
import {
  ANNUAL_CONFERENCE_STATUS_LABELS,
  ANNUAL_CONFERENCE_TASK_STATUSES,
  ANNUAL_CONFERENCE_WORKSTREAM_LABELS,
  ANNUAL_CONFERENCE_WORKSTREAMS,
  summarizeAnnualConferenceWorkPlan,
  type AnnualConferenceTask,
  type AnnualConferenceTaskCreateInput,
  type AnnualConferenceTaskUpdateInput,
} from '@/lib/annual-conference-work-plan';
import { ACTIVE_ANNUAL_CONFERENCE_EDITION } from '@/src/annual-conference';
import {
  createAnnualConferenceTask,
  fetchAdminOrganizers,
  fetchAnnualConferenceWorkPlan,
  queryKeys,
  updateAnnualConferenceTask,
} from '@/src/lib/api';
import { notify } from '@/src/lib/notify';

const year = ACTIVE_ANNUAL_CONFERENCE_EDITION.year;
const queryClient = useQueryClient();
const search = ref('');
const statusFilter = ref<'all' | AnnualConferenceTask['status']>('all');
const workstreamFilter = ref<'all' | AnnualConferenceTask['workstream']>('all');
const ownerFilter = ref('all');
const showCreateForm = ref(false);
const selectedTaskId = ref<string | null>(null);
const editingTaskId = ref<string | null>(null);

type LedgerViewTransition = {
  finished: Promise<void>;
  skipTransition?: () => void;
};

type LedgerViewTransitionDocument = Document & {
  startViewTransition?: (update: () => Promise<void> | void) => LedgerViewTransition;
};

let activeLedgerTransition: LedgerViewTransition | null = null;

const workPlanQuery = useQuery({
  queryKey: queryKeys.annualConferenceWorkPlan(year),
  queryFn: () => fetchAnnualConferenceWorkPlan(year),
});
const organizersQuery = useQuery({
  queryKey: queryKeys.adminOrganizers,
  queryFn: fetchAdminOrganizers,
});

const tasks = computed(() => workPlanQuery.data.value?.tasks ?? []);
const selectedTask = computed(() => tasks.value.find((task) => task.id === selectedTaskId.value) ?? null);
const summary = computed(() => summarizeAnnualConferenceWorkPlan(tasks.value));
const permissions = computed(() => workPlanQuery.data.value?.permissions);
const organizerLabels = computed<Record<string, string>>(() => Object.fromEntries(
  (organizersQuery.data.value?.organizers ?? []).map((organizer) => [
    organizer.email.trim().toLowerCase(),
    organizer.display_name?.trim() || organizer.email,
  ]),
));
const owners = computed(() => [...new Set(tasks.value
  .map((task) => task.accountable_owner)
  .filter((owner): owner is string => Boolean(owner)))]
  .sort((a, b) => a.localeCompare(b)));
const statusCounts = computed(() => ({
  not_started: tasks.value.filter((task) => task.status === 'not_started').length,
  in_progress: tasks.value.filter((task) => task.status === 'in_progress').length,
  blocked: tasks.value.filter((task) => task.status === 'blocked').length,
  done: tasks.value.filter((task) => task.status === 'done').length,
}));
const ownerFilterOptions = computed(() => [
  { value: 'all', label: 'All owners' },
  { value: 'unassigned', label: 'Unassigned' },
  ...owners.value.map((owner) => ({ value: owner, label: organizerDisplay(owner) })),
]);
const workstreamSummaries = computed(() => ANNUAL_CONFERENCE_WORKSTREAMS.map((workstream) => {
  const workstreamTasks = tasks.value.filter((task) => task.workstream === workstream);
  const done = workstreamTasks.filter((task) => task.status === 'done').length;
  return {
    workstream,
    total: workstreamTasks.length,
    done,
    blocked: workstreamTasks.filter((task) => task.status === 'blocked').length,
    unassigned: workstreamTasks.filter((task) => !task.accountable_owner).length,
    completionPercent: workstreamTasks.length ? Math.round((done / workstreamTasks.length) * 100) : 0,
  };
}));
const filtersActive = computed(() =>
  Boolean(search.value.trim())
  || statusFilter.value !== 'all'
  || workstreamFilter.value !== 'all'
  || ownerFilter.value !== 'all');

const visibleTasks = computed(() => {
  const needle = search.value.trim().toLowerCase();
  return tasks.value.filter((task) => {
    const matchesSearch = !needle || [
      task.title,
      task.details,
      task.internal_note,
      task.dependency_note,
      task.accountable_owner,
      organizerDisplay(task.accountable_owner),
      ...task.collaborators,
      ...task.collaborators.map(organizerDisplay),
    ].some((value) => value?.toLowerCase().includes(needle));
    const matchesStatus = statusFilter.value === 'all' || task.status === statusFilter.value;
    const matchesWorkstream = workstreamFilter.value === 'all' || task.workstream === workstreamFilter.value;
    const matchesOwner = ownerFilter.value === 'all'
      || (ownerFilter.value === 'unassigned' ? !task.accountable_owner : task.accountable_owner === ownerFilter.value);
    return matchesSearch && matchesStatus && matchesWorkstream && matchesOwner;
  });
});

const createMutation = useMutation({
  mutationFn: (input: AnnualConferenceTaskCreateInput) => createAnnualConferenceTask(year, input),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.annualConferenceWorkPlan(year) });
    showCreateForm.value = false;
    notify.success('Conference task added.');
  },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to add the task.'),
});

const updateMutation = useMutation({
  mutationFn: ({ taskId, input }: { taskId: string; input: AnnualConferenceTaskUpdateInput }) =>
    updateAnnualConferenceTask(year, taskId, input),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.annualConferenceWorkPlan(year) });
    editingTaskId.value = null;
    notify.success('Conference task updated.');
  },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to update the task.'),
});

function startEditing(taskId: string) {
  showCreateForm.value = false;
  selectedTaskId.value = taskId;
  editingTaskId.value = taskId;
}

function openCreateDrawer() {
  selectedTaskId.value = null;
  editingTaskId.value = null;
  showCreateForm.value = true;
}

function requestCreateDrawer() {
  if (!permissions.value) {
    notify.info('Task permissions are still loading.');
    return;
  }

  if (!permissions.value.can_create_tasks) {
    notify.info(
      `Only Angela (${permissions.value.task_creator_email}) can add tasks. All organizers can edit existing tasks.`,
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

  showCreateForm.value = false;
  editingTaskId.value = null;
  selectedTaskId.value = taskId;
}

function closeTaskDrawer() {
  showCreateForm.value = false;
  selectedTaskId.value = null;
  editingTaskId.value = null;
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
    search.value = '';
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
    internal_note: value.internal_note ?? null,
    workstream: value.workstream,
    accountable_owner: value.accountable_owner,
    collaborators: value.collaborators ?? [],
    priority: value.priority ?? null,
    target_date: value.target_date ?? null,
    status: value.status ?? 'not_started',
    dependency_note: value.dependency_note ?? null,
  });
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00`));
}

function organizerDisplay(value: string | null): string {
  if (!value) return 'Unassigned';
  return organizerLabels.value[value.trim().toLowerCase()] ?? value;
}

function statusClass(status: AnnualConferenceTask['status']): string {
  if (status === 'done') return 'border-dc-ink bg-dc-yellow text-dc-ink';
  if (status === 'blocked') return 'border-dc-ink bg-dc-pink text-white';
  if (status === 'in_progress') return 'border-dc-ink bg-dc-ink text-white';
  return 'border-dc-border bg-dc-paper-warm text-dc-gray';
}
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <AnnualConferenceNav title="Work plan">
        <template #description>
          <p class="mt-1 max-w-4xl text-xs font-semibold leading-5 text-dc-gray">
            See delivery health at a glance, then open only the task that needs attention.
            <span
              v-if="permissions && !permissions.can_create_tasks"
              id="annual-task-create-permission"
              class="block sm:ml-1 sm:inline"
            >
              New tasks: Angela (<span class="font-mono font-black text-dc-ink">{{ permissions.task_creator_email }}</span>). All organizers can edit.
            </span>
          </p>
        </template>
        <template #actions>
          <button
            type="button"
            class="motion-press inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border-2 px-4 py-2.5 font-mono text-[11px] font-black uppercase tracking-[0.14em]"
            :class="permissions?.can_create_tasks
              ? 'border-dc-ink bg-dc-pink text-white shadow-[3px_3px_0_#111111]'
              : 'cursor-not-allowed border-dc-ink bg-dc-paper text-dc-gray shadow-[2px_2px_0_#111111]'"
            :aria-disabled="permissions?.can_create_tasks ? undefined : 'true'"
            :aria-describedby="permissions && !permissions.can_create_tasks ? 'annual-task-create-permission' : undefined"
            :title="permissions && !permissions.can_create_tasks
              ? `Only Angela (${permissions.task_creator_email}) can add tasks.`
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
        <p class="font-mono text-sm font-black uppercase tracking-[0.14em] text-dc-gray">Loading work plan…</p>
      </section>

      <section v-else-if="workPlanQuery.isError.value" class="editorial-panel border-dc-pink p-8">
        <p class="text-lg font-black text-dc-ink">The work plan could not be loaded.</p>
        <p class="mt-2 text-sm font-semibold text-dc-gray">
          {{ workPlanQuery.error.value instanceof Error ? workPlanQuery.error.value.message : 'Please try again.' }}
        </p>
        <button
          type="button"
          class="motion-press mt-5 min-h-11 rounded-md border-2 border-dc-ink bg-dc-yellow px-4 py-2 font-mono text-[11px] font-black uppercase tracking-[0.12em]"
          @click="workPlanQuery.refetch()"
        >
          Try again
        </button>
      </section>

      <template v-else>
        <section aria-label="Work plan status" class="mb-4 rounded-lg border-2 border-dc-ink bg-dc-paper px-3 py-2.5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-2">
              <span class="hidden shrink-0 font-mono text-[9px] font-black uppercase tracking-[0.12em] text-dc-gray sm:block">
                Status
              </span>
              <div
                class="flex max-w-full items-center gap-1 overflow-x-auto rounded-md border border-dc-border bg-dc-paper-warm p-1"
                role="group"
                aria-label="Filter tasks by status"
              >
                <button
                  type="button"
                  class="min-h-9 shrink-0 rounded border-2 px-2.5 py-1 font-mono text-[9px] font-black uppercase tracking-[0.08em]"
                  :class="statusFilter === 'all' ? 'border-dc-ink bg-dc-yellow text-dc-ink' : 'border-transparent text-dc-gray hover:bg-dc-paper hover:text-dc-ink'"
                  :aria-pressed="statusFilter === 'all'"
                  @click="setStatusFilter('all')"
                >
                  All <span class="ml-1 opacity-70">{{ tasks.length }}</span>
                </button>
                <button
                  v-for="status in ANNUAL_CONFERENCE_TASK_STATUSES"
                  :key="status"
                  type="button"
                  class="min-h-9 shrink-0 rounded border-2 px-2.5 py-1 font-mono text-[9px] font-black uppercase tracking-[0.08em]"
                  :class="statusFilter === status ? 'border-dc-ink bg-dc-yellow text-dc-ink' : 'border-transparent text-dc-gray hover:bg-dc-paper hover:text-dc-ink'"
                  :aria-pressed="statusFilter === status"
                  @click="setStatusFilter(status)"
                >
                  {{ ANNUAL_CONFERENCE_STATUS_LABELS[status] }}
                  <span class="ml-1 opacity-70">{{ statusCounts[status] }}</span>
                </button>
              </div>
            </div>

            <div class="ml-auto flex shrink-0 items-center gap-3">
              <div class="min-w-[8.5rem]">
                <div class="flex items-baseline justify-between gap-3">
                  <p class="text-xs font-semibold text-dc-gray">
                    <span class="text-base font-black text-dc-ink">{{ summary.done }}</span>
                    of {{ summary.total }} done
                  </p>
                  <span class="font-mono text-[9px] font-black uppercase tracking-[0.08em] text-dc-gray">
                    {{ summary.completion_percent }}%
                  </span>
                </div>
                <div
                  class="mt-1 h-1.5 overflow-hidden rounded-full bg-dc-border"
                  role="progressbar"
                  aria-label="Conference task completion"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  :aria-valuenow="summary.completion_percent"
                >
                  <div class="h-full bg-dc-pink" :style="{ width: `${summary.completion_percent}%` }" />
                </div>
              </div>
              <button
                type="button"
                class="min-h-10 rounded-md border-2 px-3 py-1.5 text-left"
                :class="ownerFilter === 'unassigned'
                  ? 'border-dc-ink bg-dc-pink text-white'
                  : 'border-dc-border bg-dc-paper-warm text-dc-ink hover:border-dc-pink hover:bg-dc-paper'"
                :disabled="summary.unassigned === 0"
                :aria-pressed="ownerFilter === 'unassigned'"
                :aria-label="`Filter to ${summary.unassigned} tasks needing an accountable owner`"
                @click="toggleUnassignedFilter"
              >
                <span class="block text-sm font-black leading-none">{{ summary.unassigned }}</span>
                <span class="mt-1 block font-mono text-[8px] font-black uppercase tracking-[0.08em]">Need owners</span>
              </button>
            </div>
          </div>
        </section>

        <section class="mb-4 overflow-hidden rounded-lg border-2 border-dc-ink bg-dc-paper">
          <div class="flex items-center justify-between gap-4 border-b-2 border-dc-ink bg-dc-paper-warm px-3 py-2">
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <h2 class="text-sm font-black text-dc-ink">Workstreams at a glance</h2>
              <p class="text-[11px] font-semibold text-dc-gray">Select one to filter the ledger.</p>
            </div>
            <button
              v-if="workstreamFilter !== 'all'"
              type="button"
              class="min-h-9 rounded-md px-2 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-dc-pink underline decoration-2 underline-offset-4"
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
                <span class="text-xs font-black leading-4 text-dc-ink">
                  {{ ANNUAL_CONFERENCE_WORKSTREAM_LABELS[item.workstream] }}
                </span>
                <span class="shrink-0 font-mono text-[10px] font-black uppercase tracking-[0.08em] text-dc-gray">
                  {{ item.done }}/{{ item.total }}
                </span>
              </span>
              <span class="mt-1.5 block h-1 overflow-hidden rounded-full bg-dc-border">
                <span class="block h-full bg-dc-ink" :style="{ width: `${item.completionPercent}%` }" />
              </span>
              <span class="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[8px] font-black uppercase tracking-[0.06em] text-dc-gray">
                <span>{{ item.completionPercent }}% done</span>
                <span v-if="item.blocked" class="text-dc-pink">{{ item.blocked }} blocked</span>
                <span v-if="item.unassigned" class="text-dc-pink">{{ item.unassigned }} unassigned</span>
              </span>
            </button>
          </div>
        </section>

        <section class="mb-3 grid gap-2 rounded-lg border-2 border-dc-border bg-dc-paper-warm p-2 md:grid-cols-[minmax(14rem,1fr)_14rem_auto]">
          <label class="block">
            <span class="sr-only">Search tasks</span>
            <input v-model="search" class="editorial-input !min-h-10 !py-2 !text-sm" type="search" placeholder="Search task, owner, or note">
          </label>
          <AppDropdown
            :model-value="ownerFilter"
            :options="ownerFilterOptions"
            density="compact"
            menu-align="right"
            menu-class="min-w-48"
            @update:model-value="setOwnerFilter"
          />
          <button
            type="button"
            class="min-h-10 rounded-md border-2 border-transparent px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em]"
            :class="filtersActive ? 'text-dc-pink hover:border-dc-pink' : 'cursor-default text-dc-gray/50'"
            :disabled="!filtersActive"
            @click="clearFilters"
          >
            Clear
          </button>
        </section>

        <section class="annual-task-ledger overflow-hidden rounded-lg border-2 border-dc-ink bg-dc-paper">
          <div class="flex items-center justify-between gap-4 border-b-2 border-dc-ink bg-dc-paper-warm px-4 py-3">
            <div>
              <h2 class="text-lg font-black text-dc-ink">Task ledger</h2>
              <p class="mt-0.5 text-xs font-semibold text-dc-gray">
                {{ visibleTasks.length }} of {{ tasks.length }} tasks shown. View a task for notes, collaborators, and editing.
              </p>
            </div>
            <span class="hidden shrink-0 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-dc-gray sm:block">
              One accountable owner
            </span>
          </div>

          <div class="hidden border-b border-dc-border bg-dc-paper-warm px-4 py-2 md:grid md:grid-cols-[minmax(0,1.6fr)_8.5rem_10rem_7rem_2.5rem] md:gap-3">
            <span class="font-mono text-[9px] font-black uppercase tracking-[0.12em] text-dc-gray">Task</span>
            <span class="font-mono text-[9px] font-black uppercase tracking-[0.12em] text-dc-gray">Status</span>
            <span class="font-mono text-[9px] font-black uppercase tracking-[0.12em] text-dc-gray">Accountable</span>
            <span class="font-mono text-[9px] font-black uppercase tracking-[0.12em] text-dc-gray">Target</span>
            <span class="sr-only">View details</span>
          </div>

          <div
            class="annual-task-ledger__scroll max-h-[clamp(18rem,56svh,35rem)] overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
            tabindex="0"
            aria-label="Conference tasks"
          >
            <div v-if="visibleTasks.length === 0" class="grid min-h-[18rem] place-items-center p-8 text-center">
              <div>
                <h3 class="text-xl font-black text-dc-ink">No matching tasks</h3>
                <p class="mt-2 text-sm font-semibold text-dc-gray">Clear or change the filters to see the work plan.</p>
                <button
                  type="button"
                  class="mt-4 min-h-10 rounded-md border-2 border-dc-ink bg-dc-yellow px-4 font-mono text-[10px] font-black uppercase tracking-[0.1em]"
                  @click="clearFilters"
                >
                  Clear filters
                </button>
              </div>
            </div>

            <article
              v-for="task in visibleTasks"
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
                  <span class="block truncate text-sm font-black text-dc-ink">{{ task.title }}</span>
                  <span class="mt-0.5 flex min-w-0 items-center gap-2">
                    <span class="truncate font-mono text-[9px] font-black uppercase tracking-[0.08em] text-dc-gray">
                      {{ ANNUAL_CONFERENCE_WORKSTREAM_LABELS[task.workstream] }}
                    </span>
                    <span v-if="task.priority" class="shrink-0 font-mono text-[9px] font-black uppercase tracking-[0.08em] text-dc-pink">
                      {{ task.priority }}
                    </span>
                  </span>
                  <span class="mt-1 flex items-center gap-2 md:hidden">
                    <span
                      class="rounded border px-1.5 py-0.5 font-mono text-[8px] font-black uppercase tracking-[0.08em]"
                      :class="statusClass(task.status)"
                    >
                      {{ ANNUAL_CONFERENCE_STATUS_LABELS[task.status] }}
                    </span>
                    <span class="truncate text-[11px] font-semibold" :class="task.accountable_owner ? 'text-dc-gray' : 'text-dc-pink'">
                      {{ organizerDisplay(task.accountable_owner) }}
                    </span>
                  </span>
                </button>

                <span
                  class="hidden w-fit rounded-md border-2 px-2 py-1 font-mono text-[9px] font-black uppercase tracking-[0.08em] md:inline-flex"
                  :class="statusClass(task.status)"
                >
                  {{ ANNUAL_CONFERENCE_STATUS_LABELS[task.status] }}
                </span>
                <span
                  class="hidden truncate text-xs font-black md:block"
                  :class="task.accountable_owner ? 'text-dc-ink' : 'text-dc-pink'"
                  :title="task.accountable_owner ?? 'Unassigned'"
                >
                  {{ organizerDisplay(task.accountable_owner) }}
                </span>
                <span class="hidden text-xs font-semibold text-dc-gray md:block">
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
        </section>
      </template>
    </div>

    <AnnualConferenceTaskDrawer
      :open="showCreateForm || Boolean(selectedTask)"
      :mode="showCreateForm ? 'create' : editingTaskId ? 'edit' : 'details'"
      :task="showCreateForm ? null : selectedTask"
      :organizer-labels="organizerLabels"
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

.annual-task-ledger__scroll {
  overflow-anchor: none;
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
