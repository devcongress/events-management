<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useMutation } from '@tanstack/vue-query';
import { useRoute } from 'vue-router';
import AnnualConferenceNav from '@/src/components/AnnualConferenceNav.vue';
import AnnualConferenceTaskDrawer from '@/src/components/AnnualConferenceTaskDrawer.vue';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AppDatePicker from '@/src/components/ui/AppDatePicker.vue';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import {
  ANNUAL_CONFERENCE_STATUS_LABELS,
  ANNUAL_CONFERENCE_WORKSTREAM_LABELS,
  type AnnualConferencePhase,
  type AnnualConferencePhaseCreateInput,
  type AnnualConferencePhaseUpdateInput,
  type AnnualConferenceTask,
  type AnnualConferenceTaskUpdateInput,
} from '@/lib/annual-conference-work-plan';
import { ACTIVE_ANNUAL_CONFERENCE_EDITION } from '@/src/annual-conference';
import {
  deleteAnnualConferencePhase,
  reorderAnnualConferencePhases,
  updateAnnualConferencePhase,
  createAnnualConferencePhase,
} from '@/src/lib/api';
import { notify } from '@/src/lib/notify';
import { useAnnualConferenceWorkspace } from '@/src/composables/useAnnualConferenceWorkspace';

const route = useRoute();
const year = computed(() => String(route.params.year ?? ACTIVE_ANNUAL_CONFERENCE_EDITION.year));
const phaseManagerOpen = ref(false);
const editorOpen = ref(false);
const editingPhaseId = ref<string | null>(null);
const pendingDelete = ref<AnnualConferencePhase | null>(null);
const gapStatus = ref<'all' | AnnualConferenceTask['status']>('all');
const GAP_TABLE_PAGE_SIZE = 8;
const gapPage = ref(1);
const form = reactive({ name: '', starts_on: '', ends_on: '' });

const today = ref(currentAccraDate());
let dayRefreshTimer: number | null = null;
const {
  workPlanQuery,
  organizersQuery,
  phases,
  tasks,
  projection,
  phaseScope,
  scopedTasks,
  selectedPhase,
  selectedTask,
  selectedTaskId,
  editingTaskId,
  updateTaskMutation,
  refresh,
  editTask,
  closeTaskDrawer,
} = useAnnualConferenceWorkspace({
  year,
  today,
  refetchInterval: 30_000,
  refetchOnWindowFocus: true,
});
const phaseScopeLabel = computed(() => {
  if (selectedPhase.value) return selectedPhase.value.name;
  if (phaseScope.value === 'unassigned') return 'No phase';
  return 'Entire conference';
});
const phaseScopeOptions = computed(() => [
  ...phases.value.map((phase) => ({ value: phase.id, label: phase.name })),
  { value: 'unassigned', label: 'No phase' },
  { value: 'all', label: 'Entire conference' },
]);
const organizerLabels = computed<Record<string, string>>(() => Object.fromEntries(
  (organizersQuery.data.value?.organizers ?? []).map((organizer) => [
    organizer.email.trim().toLowerCase(),
    organizer.display_name?.trim() || organizer.email,
  ]),
));
const canManagePhases = computed(() => workPlanQuery.data.value?.permissions.can_manage_phases === true);
const health = computed(() => projection.value.health);
const unclassifiedCount = computed(() => projection.value.unclassified_count);
const undatedCount = computed(() => projection.value.undated_count);
const currentPhase = computed(() => projection.value.current_phase);
const nextPhase = computed(() => projection.value.next_phase);
const activePhase = computed(() => selectedPhase.value ?? currentPhase.value ?? nextPhase.value ?? phases.value.at(-1) ?? null);
const conferenceDate = computed(() => workPlanQuery.data.value?.edition.provisional_date ?? phases.value.at(-1)?.ends_on ?? null);
const scopeEndDate = computed(() => selectedPhase.value?.ends_on ?? conferenceDate.value);
const daysToScopeEnd = computed(() => scopeEndDate.value ? daysBetween(today.value, scopeEndDate.value) : null);
const scopeCountdownLabel = computed(() => selectedPhase.value?.name ?? 'Conference');
const phaseScopeWindow = computed(() => {
  if (selectedPhase.value) return `${shortDate(selectedPhase.value.starts_on)} – ${shortDate(selectedPhase.value.ends_on)}`;
  if (phaseScope.value === 'unassigned') return 'Not scheduled';
  return phases.value.length
    ? `${shortDate(phases.value[0].starts_on)} – ${shortDate(phases.value.at(-1)!.ends_on)}`
    : 'Not set';
});
const activePhaseHealth = computed(() => health.value.phase_health.find(
  (item) => item.phase_id === activePhase.value?.id,
) ?? null);
const timelineStart = computed(() => phases.value.at(0)?.starts_on ?? null);
const timelineEnd = computed(() => phases.value.at(-1)?.ends_on ?? conferenceDate.value);
const todayPosition = computed(() => {
  if (!timelineStart.value || !timelineEnd.value) return null;
  const total = Math.max(1, daysBetween(timelineStart.value, timelineEnd.value));
  return Math.min(100, Math.max(0, (daysBetween(timelineStart.value, today.value) / total) * 100));
});
const filteredGapTasks = computed(() => {
  return sortedTasks(projection.value.planning_gaps.filter((task) => {
    const matchesStatus = gapStatus.value === 'all' || task.status === gapStatus.value;
    return matchesStatus;
  }));
});
const totalPlanningGaps = computed(() => projection.value.planning_gaps.length);
const gapPageCount = computed(() => Math.max(1, Math.ceil(filteredGapTasks.value.length / GAP_TABLE_PAGE_SIZE)));
const paginatedGapTasks = computed(() => {
  const start = (gapPage.value - 1) * GAP_TABLE_PAGE_SIZE;
  return filteredGapTasks.value.slice(start, start + GAP_TABLE_PAGE_SIZE);
});
const gapRangeStart = computed(() => filteredGapTasks.value.length ? (gapPage.value - 1) * GAP_TABLE_PAGE_SIZE + 1 : 0);
const gapRangeEnd = computed(() => Math.min(gapPage.value * GAP_TABLE_PAGE_SIZE, filteredGapTasks.value.length));

function changeGapPage(direction: -1 | 1) {
  gapPage.value = Math.min(gapPageCount.value, Math.max(1, gapPage.value + direction));
}

function resetGapPage() {
  gapPage.value = 1;
}

function organizerDisplay(value: string | null): string {
  if (!value) return 'Unassigned';
  return organizerLabels.value[value.trim().toLowerCase()] ?? value;
}

function planningStatusClass(status: AnnualConferenceTask['status']): string {
  if (status === 'done') return 'planning-status--done';
  if (status === 'blocked') return 'planning-status--blocked';
  if (status === 'in_progress') return 'planning-status--active';
  return 'planning-status--idle';
}

watch(gapStatus, resetGapPage);
watch(phaseScope, () => {
  resetGapPage();
  closeTaskDrawer();
});
watch(filteredGapTasks, () => {
  gapPage.value = Math.min(gapPage.value, gapPageCount.value);
});
const gapStatusOptions = [
  { value: 'all', label: 'All statuses' },
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
];
function refreshToday() {
  today.value = currentAccraDate();
}

onMounted(() => {
  dayRefreshTimer = window.setInterval(refreshToday, 60_000);
  window.addEventListener('focus', refreshToday);
});

onUnmounted(() => {
  if (dayRefreshTimer !== null) window.clearInterval(dayRefreshTimer);
  window.removeEventListener('focus', refreshToday);
});

function currentAccraDate(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Accra', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function dateOrdinal(value: string): number {
  return Date.parse(`${value}T12:00:00Z`) / 86_400_000;
}

function daysBetween(start: string, end: string): number {
  return Math.ceil(dateOrdinal(end) - dateOrdinal(start));
}

function phaseDuration(phase: AnnualConferencePhase): number {
  return Math.max(1, daysBetween(phase.starts_on, phase.ends_on) + 1);
}

function sortedTasks(items: AnnualConferenceTask[]): AnnualConferenceTask[] {
  return [...items].sort((left, right) => {
    if (!left.target_date && !right.target_date) return left.sort_order - right.sort_order;
    if (!left.target_date) return 1;
    if (!right.target_date) return -1;
    return left.target_date.localeCompare(right.target_date) || left.sort_order - right.sort_order;
  });
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(`${value}T12:00:00`));
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat('en-GH', { day: '2-digit', month: 'short' })
    .format(new Date(`${value}T12:00:00`));
}

function nextDay(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function readinessLabel(): string {
  if (scopedTasks.value.length === 0) return 'No work assigned';
  return {
    complete: 'Objectives complete',
    on_track: 'On track',
    at_risk: 'At risk',
    off_track: 'Off track',
    needs_planning: 'Needs planning',
  }[health.value.readiness];
}

function readinessClass(): string {
  if (scopedTasks.value.length === 0) return 'health-signal--neutral';
  if (health.value.readiness === 'complete' || health.value.readiness === 'on_track') return 'health-signal--good';
  if (health.value.readiness === 'needs_planning' || health.value.readiness === 'at_risk') return 'health-signal--warn';
  return 'health-signal--danger';
}

function setGapStatus(value: string | number) {
  gapStatus.value = value as typeof gapStatus.value;
}

function setPhaseScope(value: string | number) {
  phaseScope.value = String(value);
}

function startFixingTask(task: AnnualConferenceTask) {
  editTask(task.id);
}

function taskPhaseName(task: AnnualConferenceTask): string {
  return phases.value.find((phase) => phase.id === task.phase_id)?.name ?? 'No phase';
}

function resetEditor() {
  editorOpen.value = false;
  editingPhaseId.value = null;
  form.name = '';
  form.starts_on = '';
  form.ends_on = '';
}

function startCreate() {
  editingPhaseId.value = null;
  form.name = `Phase ${phases.value.length + 1}`;
  const proposedStart = phases.value.at(-1) ? nextDay(phases.value.at(-1)!.ends_on) : `${year.value}-08-01`;
  const endDate = conferenceDate.value ?? `${year.value}-12-01`;
  form.starts_on = proposedStart;
  form.ends_on = endDate >= proposedStart ? endDate : proposedStart;
  editorOpen.value = true;
}

function startEdit(phase: AnnualConferencePhase) {
  editingPhaseId.value = phase.id;
  form.name = phase.name;
  form.starts_on = phase.starts_on;
  form.ends_on = phase.ends_on;
  editorOpen.value = true;
}

const createMutation = useMutation({
  mutationFn: (input: AnnualConferencePhaseCreateInput) => createAnnualConferencePhase(year.value, input),
  onSuccess: async () => { await refresh(); resetEditor(); notify.success('Conference phase added.'); },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to add the phase.'),
});
const updatePhaseMutation = useMutation({
  mutationFn: ({ phaseId, input }: { phaseId: string; input: AnnualConferencePhaseUpdateInput }) =>
    updateAnnualConferencePhase(year.value, phaseId, input),
  onSuccess: async () => { await refresh(); resetEditor(); notify.success('Conference phase updated.'); },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to update the phase.'),
});
const deleteMutation = useMutation({
  mutationFn: (phaseId: string) => deleteAnnualConferencePhase(year.value, phaseId),
  onSuccess: async (result) => {
    await refresh();
    pendingDelete.value = null;
    notify.success(result.tasks_unassigned ? `Phase removed. ${result.tasks_unassigned} tasks moved to No phase.` : 'Phase removed.');
  },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to remove the phase.'),
});
function submitPhase() {
  const input = { name: form.name.trim(), starts_on: form.starts_on, ends_on: form.ends_on };
  if (editingPhaseId.value) updatePhaseMutation.mutate({ phaseId: editingPhaseId.value, input });
  else createMutation.mutate(input);
}

function submitTask(input: AnnualConferenceTaskUpdateInput) {
  if (selectedTask.value) updateTaskMutation.mutate({ taskId: selectedTask.value.id, input });
}

async function movePhase(phase: AnnualConferencePhase, direction: -1 | 1) {
  const index = phases.value.findIndex((item) => item.id === phase.id);
  const neighbor = phases.value[index + direction];
  if (!neighbor) return;
  try {
    const orderedIds = phases.value.map((item) => item.id);
    [orderedIds[index], orderedIds[index + direction]] = [orderedIds[index + direction], orderedIds[index]];
    await reorderAnnualConferencePhases(year.value, orderedIds);
    await refresh();
  } catch (error) {
    notify.error(error instanceof Error ? error.message : 'Unable to reorder phases.');
  }
}
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <AnnualConferenceNav
        title="Phase timeline"
        description="Track one delivery phase at a time, then switch scope when you need the wider conference picture."
      />

      <section v-if="workPlanQuery.isPending.value" class="editorial-panel p-8 text-dc-gray">Loading conference health…</section>
      <section v-else-if="workPlanQuery.isError.value" class="editorial-panel border-dc-pink p-8 text-dc-pink">Unable to load conference health.</section>

      <main v-else class="space-y-5">
        <section class="health-hero">
          <div class="health-hero__main">
            <header class="health-hero__header">
              <div>
                <p class="editorial-eyebrow">Phase progress</p>
                <p class="mt-1 text-sm font-semibold text-dc-ink">{{ phaseScopeLabel }}</p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <div class="w-48">
                  <AppDropdown
                    :model-value="phaseScope"
                    :options="phaseScopeOptions"
                    density="compact"
                    menu-align="right"
                    menu-class="min-w-52"
                    teleport
                    @update:model-value="setPhaseScope"
                  />
                </div>
                <button v-if="canManagePhases" type="button" class="motion-press health-hero__action" @click="phaseManagerOpen = !phaseManagerOpen">
                  {{ phaseManagerOpen ? 'Close phase manager' : 'Manage phases' }}
                </button>
              </div>
            </header>
            <div class="health-hero__overview">
              <div class="health-hero__metric">
                <strong>{{ health.completion_percent }}%</strong>
                <span>complete</span>
                <p>{{ health.done }} of {{ health.total }} {{ phaseScopeLabel }} objectives completed</p>
              </div>
              <div class="health-hero__status">
                <span>Schedule status</span>
                <strong class="health-signal" :class="readinessClass()">{{ readinessLabel() }}</strong>
              </div>
            </div>
            <div class="health-hero__progress" role="progressbar" :aria-label="`${phaseScopeLabel} task completion`" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="health.completion_percent">
              <span :style="{ '--progress': `${health.completion_percent / 100}` }" />
            </div>
            <dl class="health-hero__facts">
              <div><dt>Phase window</dt><dd>{{ phaseScopeWindow }}</dd></div>
              <div><dt>Planning confidence</dt><dd>{{ scopedTasks.length ? `${health.planning_confidence_percent}%` : '—' }}</dd></div>
              <div><dt>Overdue</dt><dd>{{ health.overdue }}</dd></div>
              <div><dt>Blocked</dt><dd>{{ health.blocked }}</dd></div>
              <div><dt>Due in 7 days</dt><dd>{{ health.due_soon }}</dd></div>
            </dl>
          </div>
          <div class="health-hero__countdown">
            <span class="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-dc-gray">{{ scopeCountdownLabel }}</span>
            <strong>{{ daysToScopeEnd == null ? '—' : Math.max(0, daysToScopeEnd) }}</strong>
            <span class="text-sm text-dc-gray">{{ daysToScopeEnd === 1 ? 'day remaining' : 'days remaining' }}</span>
            <time v-if="scopeEndDate" class="mt-4 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-gray">Ends {{ formatDate(scopeEndDate) }}</time>
          </div>
        </section>

        <Transition name="health-panel">
          <section v-if="phaseManagerOpen && canManagePhases" class="editorial-panel overflow-hidden" aria-label="Phase management">
            <header class="flex flex-wrap items-center justify-between gap-3 border-b border-dc-border bg-dc-paper-warm px-5 py-4">
              <div><p class="editorial-eyebrow">Planning controls</p><h2 class="mt-1 text-xl font-bold">Manage phases</h2></div>
              <button type="button" class="motion-press rounded-md border border-dc-pink bg-dc-pink px-4 py-2 font-mono text-[10px] font-semibold uppercase text-white" @click="startCreate">Add phase</button>
            </header>
            <Transition name="health-panel">
              <form v-if="editorOpen" class="grid gap-4 border-b border-dc-border bg-dc-paper-warm p-5 lg:grid-cols-3" @submit.prevent="submitPhase">
                <label><span class="editorial-label">Phase name</span><input v-model="form.name" class="editorial-input mt-2" maxlength="80" required></label>
                <AppDatePicker v-model="form.starts_on" label="Starts" required />
                <AppDatePicker v-model="form.ends_on" label="Ends" required />
                <div class="flex justify-end gap-2 lg:col-span-3">
                  <button type="button" class="motion-press min-h-10 rounded-md border border-dc-ink bg-white px-4 font-mono text-[10px] font-semibold uppercase" @click="resetEditor">Cancel</button>
                  <button type="submit" class="motion-press min-h-10 rounded-md border-2 border-dc-ink bg-dc-pink px-4 font-mono text-[10px] font-semibold uppercase text-white" :disabled="createMutation.isPending.value || updatePhaseMutation.isPending.value">Save phase</button>
                </div>
              </form>
            </Transition>
            <div class="divide-y divide-dc-border">
              <div v-for="(phase, index) in phases" :key="phase.id" class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div><p class="font-bold">{{ phase.name }}</p><p class="mt-1 font-mono text-[10px] uppercase text-dc-gray">{{ formatDate(phase.starts_on) }} → {{ formatDate(phase.ends_on) }}</p></div>
                <div class="flex gap-2">
                  <button type="button" class="motion-press phase-control" :disabled="index === 0" aria-label="Move phase earlier" @click="movePhase(phase, -1)">↑</button>
                  <button type="button" class="motion-press phase-control" :disabled="index === phases.length - 1" aria-label="Move phase later" @click="movePhase(phase, 1)">↓</button>
                  <button type="button" class="motion-press phase-control" @click="startEdit(phase)">Edit</button>
                  <button type="button" class="motion-press phase-control text-dc-pink" @click="pendingDelete = phase">Delete</button>
                </div>
              </div>
            </div>
          </section>
        </Transition>

        <section class="editorial-panel overflow-hidden">
          <header class="flex flex-wrap items-end justify-between gap-3 border-b border-dc-border px-5 py-4 sm:px-6">
            <div><p class="editorial-eyebrow">Delivery runway</p><h2 class="mt-1 text-xl font-bold">Time remaining versus work completed</h2></div>
            <p v-if="selectedPhase && activePhaseHealth" class="max-w-sm text-right text-xs leading-5 text-dc-gray">
              {{ selectedPhase.name }} has used <strong class="text-dc-ink">{{ activePhaseHealth.time_elapsed_percent }}%</strong> of its time and completed <strong class="text-dc-ink">{{ activePhaseHealth.completion_percent }}%</strong> of its assigned work.
            </p>
          </header>
          <div class="p-5 sm:p-6">
            <div v-if="phases.length" class="runway" aria-label="Conference phases timeline">
              <div class="runway__track">
                <button v-for="phase in phases" :key="phase.id" type="button" class="runway__phase" :class="{ 'runway__phase--active': phase.id === currentPhase?.id, 'runway__phase--selected': phase.id === selectedPhase?.id }" :style="{ flexGrow: phaseDuration(phase) }" :aria-pressed="phase.id === selectedPhase?.id" @click="setPhaseScope(phase.id)">
                  <span>{{ phase.name }}</span><small>{{ shortDate(phase.starts_on) }} – {{ shortDate(phase.ends_on) }}</small>
                </button>
                <div v-if="todayPosition != null" class="runway__today" :style="{ left: `${todayPosition}%` }"><span>Today</span></div>
              </div>
              <div class="runway__conference"><span aria-hidden="true">◆</span> {{ conferenceDate ? shortDate(conferenceDate) : 'Date pending' }} · Conference</div>
            </div>
            <p v-else class="text-sm text-dc-gray">Add phases to compare the schedule with completed work.</p>
          </div>
        </section>

        <section class="planning-desk" aria-labelledby="planning-gaps-title">
          <header class="planning-desk__header">
            <div class="min-w-0">
              <h2 id="planning-gaps-title" class="text-xl font-semibold">{{ phaseScopeLabel }} planning gaps</h2>
              <p class="mt-2 max-w-xl text-xs leading-5 text-dc-gray">Resolve the missing planning details for this phase before moving to the next one.</p>
            </div>
            <div class="planning-desk__controls">
              <dl class="planning-desk__totals" aria-label="Planning gap totals">
                <div v-if="!selectedPhase"><dt>No phase</dt><dd>{{ unclassifiedCount }}</dd></div>
                <div><dt>No target date</dt><dd>{{ undatedCount }}</dd></div>
              </dl>
              <div class="planning-desk__filter">
                <span>Status</span>
                <AppDropdown
                  :model-value="gapStatus"
                  :options="gapStatusOptions"
                  density="compact"
                  menu-align="right"
                  menu-class="min-w-44"
                  teleport
                  @update:model-value="setGapStatus"
                />
              </div>
            </div>
          </header>

          <div class="planning-table-scroll" tabindex="0" aria-label="Planning gaps table">
            <table class="planning-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Owner</th>
                  <th>Status</th>
                  <th>Phase</th>
                  <th>Target date</th>
                  <th><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody v-if="paginatedGapTasks.length">
                <tr v-for="task in paginatedGapTasks" :key="task.id">
                  <td>
                    <button type="button" class="planning-table__task" @click="startFixingTask(task)">
                      <strong>{{ task.title }}</strong>
                      <span>{{ ANNUAL_CONFERENCE_WORKSTREAM_LABELS[task.workstream] }}</span>
                    </button>
                  </td>
                  <td :class="{ 'planning-table__missing-value': !task.accountable_owner }">{{ organizerDisplay(task.accountable_owner) }}</td>
                  <td>
                    <span class="planning-status" :class="planningStatusClass(task.status)">
                      <span aria-hidden="true" />{{ ANNUAL_CONFERENCE_STATUS_LABELS[task.status] }}
                    </span>
                  </td>
                  <td :class="{ 'planning-table__missing-value': !task.phase_id }">{{ taskPhaseName(task) }}</td>
                  <td :class="{ 'planning-table__missing-value': !task.target_date }">{{ task.target_date ? formatDate(task.target_date) : 'Not set' }}</td>
                  <td><button type="button" class="motion-press planning-table__action" :aria-label="`Open ${task.title}`" @click="startFixingTask(task)">Open <span aria-hidden="true">→</span></button></td>
                </tr>
              </tbody>
              <tbody v-else>
                <tr><td colspan="6" class="planning-table__empty">{{ !scopedTasks.length ? `No tasks are assigned to ${phaseScopeLabel}.` : totalPlanningGaps ? 'No planning gaps match this status.' : 'All tasks in this view have the required planning details.' }}</td></tr>
              </tbody>
            </table>
          </div>
          <footer class="planning-table__footer">
            <span>{{ gapRangeStart }}–{{ gapRangeEnd }} of {{ filteredGapTasks.length }}</span>
            <div class="planning-table__pager">
              <button type="button" class="motion-press" :disabled="gapPage === 1" aria-label="Previous planning gap page" @click="changeGapPage(-1)">←</button>
              <span>{{ gapPage }}/{{ gapPageCount }}</span>
              <button type="button" class="motion-press" :disabled="gapPage === gapPageCount" aria-label="Next planning gap page" @click="changeGapPage(1)">→</button>
            </div>
          </footer>
        </section>
      </main>
    </div>

    <AnnualConferenceTaskDrawer
      :open="Boolean(selectedTask)"
      :mode="editingTaskId ? 'edit' : 'details'"
      :task="selectedTask"
      :phases="phases"
      :organizer-labels="organizerLabels"
      :submitting="updateTaskMutation.isPending.value"
      @close="closeTaskDrawer"
      @edit="selectedTask && (editingTaskId = selectedTask.id)"
      @cancel-edit="editingTaskId = null"
      @submit="submitTask"
    />

    <ConfirmDialog
      :open="Boolean(pendingDelete)"
      title="Delete phase?"
      :message="pendingDelete ? `Tasks in ${pendingDelete.name} will return to No phase. No tasks will be deleted.` : ''"
      confirm-label="Delete phase"
      cancel-label="Keep phase"
      busy-label="Deleting…"
      danger
      :busy="deleteMutation.isPending.value"
      @cancel="pendingDelete = null"
      @confirm="pendingDelete && deleteMutation.mutate(pendingDelete.id)"
    />
  </div>
</template>

<style scoped>
.health-hero { display: grid; overflow: hidden; border: 1px solid #e0ddd4; border-radius: 12px; background: white; }
.health-hero__main { min-width: 0; padding: 1.5rem; }
.health-hero__header { display: flex; min-height: 2.5rem; align-items: center; justify-content: space-between; gap: 1rem; }
.health-hero__overview { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 1.5rem; margin-top: 1rem; }
.health-hero__metric { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 .65rem; }
.health-hero__metric strong { font-size: clamp(3rem, 6vw, 4.75rem); font-weight: 800; line-height: .9; letter-spacing: -.055em; color: #111; }
.health-hero__metric > span { font-size: clamp(1.25rem, 2.5vw, 2rem); font-weight: 700; line-height: 1; color: #111; }
.health-hero__metric p { width: 100%; margin-top: .8rem; font-size: .8125rem; color: #666; }
.health-hero__status { min-width: 10rem; border-left: 1px solid #e0ddd4; padding-left: 1rem; }
.health-hero__status > span { display: block; font-family: var(--font-mono); font-size: .5rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #888; }
.health-hero__status strong { margin-top: .45rem; }
.health-hero__countdown { display: flex; min-width: 12rem; flex-direction: column; justify-content: center; border-top: 1px solid #e0ddd4; background: #f5f2e8; padding: 1.5rem; }
.health-hero__countdown strong { margin-top: .35rem; font-size: clamp(2.75rem, 6vw, 4rem); font-weight: 800; line-height: .95; color: #111; letter-spacing: -.05em; }
.health-hero__facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0; overflow: hidden; margin-top: 1.25rem; border: 1px solid #e0ddd4; border-radius: 8px; background: #faf9f5; }
.health-hero__facts > div { min-width: 0; padding: .8rem; }
.health-hero__facts dt { font-family: var(--font-mono); font-size: .5625rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #888; }
.health-hero__facts dd { margin-top: .35rem; font-size: .8125rem; font-weight: 700; color: #111; }
.health-signal { display: inline-flex; font-family: var(--font-mono); font-size: .5625rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.health-signal--good { color: #15803d; }.health-signal--warn { color: #9a6700; }.health-signal--danger { color: #e8117f; }.health-signal--neutral { color: #777; }
.health-hero__action { min-height: 2.5rem; border: 1px solid #e0ddd4; border-radius: 8px; padding: .55rem .85rem; background: white; font-family: var(--font-mono); font-size: .625rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #555; }
.health-hero__progress { overflow: hidden; background: #e0ddd4; }
.health-hero__progress { height: .4rem; margin-top: 1.25rem; border-radius: 999px; }
.health-hero__progress span { display: block; width: 100%; height: 100%; transform: scaleX(var(--progress)); transform-origin: left; background: #e8117f; }
.phase-control { min-height: 2.25rem; border: 1px solid #e0ddd4; border-radius: 6px; padding: 0 .7rem; background: white; font-family: var(--font-mono); font-size: .625rem; font-weight: 700; text-transform: uppercase; }
.phase-control:disabled { cursor: not-allowed; opacity: .35; }
.runway { overflow-x: auto; padding: 1.75rem .25rem .25rem; }.runway__track { position: relative; display: flex; min-width: 40rem; border-bottom: 2px solid #a8a49b; }
.runway__phase { min-width: 8rem; cursor: pointer; appearance: none; border: 0; border-left: 1px solid #e0ddd4; padding: .8rem 1rem 1rem; background: #f5f2e8; color: inherit; text-align: left; }.runway__phase:last-of-type { border-right: 1px solid #e0ddd4; }.runway__phase--active { box-shadow: inset 0 -3px 0 rgba(232, 17, 127, .35); }.runway__phase--selected { background: #fce7f3; box-shadow: inset 0 3px 0 #e8117f; }.runway__phase:focus-visible { position: relative; z-index: 3; outline: 3px solid rgba(232, 17, 127, .22); outline-offset: -3px; }
.runway__phase span, .runway__phase small { display: block; }.runway__phase span { font-size: .875rem; font-weight: 700; }.runway__phase small { margin-top: .35rem; font-family: var(--font-mono); font-size: .5625rem; font-weight: 600; text-transform: uppercase; color: #555; }
.runway__today { position: absolute; bottom: -.6rem; z-index: 2; width: 2px; height: calc(100% + 2rem); transform: translateX(-1px); background: #e8117f; }.runway__today::after { position: absolute; bottom: 0; left: 50%; width: .7rem; height: .7rem; border: 2px solid white; border-radius: 999px; background: #e8117f; content: ''; transform: translate(-50%, 50%); }
.runway__today span { position: absolute; top: -1.25rem; left: 50%; transform: translateX(-50%); font-family: var(--font-mono); font-size: .5625rem; font-weight: 700; text-transform: uppercase; color: #e8117f; }
.runway__conference { min-width: 40rem; padding-top: 1rem; text-align: right; font-family: var(--font-mono); font-size: .625rem; font-weight: 700; text-transform: uppercase; color: #555; }.runway__conference span { color: #e8117f; }
.planning-desk { overflow: hidden; border: 1px solid #e0ddd4; border-radius: 12px; background: #f5f2e8; }
.planning-desk__header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; border-bottom: 1px solid #e0ddd4; padding: 1.25rem 1.5rem; background: white; }
.planning-desk__controls { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: flex-end; gap: .75rem; }
.planning-desk__totals { display: flex; overflow: hidden; border: 1px solid #e0ddd4; border-radius: 8px; background: #f5f2e8; }
.planning-desk__totals div { display: flex; align-items: baseline; gap: .65rem; min-width: 7.5rem; padding: .65rem .8rem; }
.planning-desk__totals div + div { border-left: 1px solid #e0ddd4; }
.planning-desk__totals dt { font-family: var(--font-mono); font-size: .5rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #777; }
.planning-desk__totals dd { margin-left: auto; font-family: var(--font-mono); font-size: .75rem; font-weight: 700; color: #b20d61; }
.planning-desk__filter { width: 11rem; }
.planning-desk__filter > span { display: block; margin-bottom: .35rem; font-family: var(--font-mono); font-size: .5rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #777; }
.planning-table-scroll { overflow-x: auto; background: white; scrollbar-width: thin; scrollbar-color: rgba(17, 17, 17, .18) transparent; }
.planning-table-scroll::-webkit-scrollbar { height: .4rem; }.planning-table-scroll::-webkit-scrollbar-track { background: transparent; }.planning-table-scroll::-webkit-scrollbar-thumb { border-radius: 999px; background: rgba(17, 17, 17, .16); }
.planning-table { width: 100%; min-width: 54rem; border-collapse: collapse; text-align: left; }
.planning-table th { padding: .65rem 1rem; background: #f5f2e8; font-family: var(--font-mono); font-size: .5rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #777; }
.planning-table td { border-top: 1px solid #e0ddd4; padding: .75rem 1rem; font-size: .6875rem; color: #555; vertical-align: middle; }
.planning-table th:first-child, .planning-table td:first-child { padding-left: 1.5rem; }.planning-table th:last-child, .planning-table td:last-child { padding-right: 1.5rem; text-align: right; }
.planning-table__task { display: block; width: 100%; max-width: 22rem; text-align: left; }
.planning-table__task strong { display: block; font-size: .8125rem; font-weight: 600; line-height: 1.15rem; color: #111; }
.planning-table__task span { display: block; overflow: hidden; margin-top: .2rem; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); font-size: .475rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #888; }
.planning-table__missing-value { color: #b20d61 !important; }
.planning-status { display: inline-flex; align-items: center; gap: .35rem; white-space: nowrap; font-family: var(--font-mono); font-size: .5rem; font-weight: 700; text-transform: uppercase; color: #777; }
.planning-status > span { width: .4rem; height: .4rem; border-radius: 999px; background: currentColor; }
.planning-status--done { color: #15803d; }.planning-status--blocked { color: #b20d61; }.planning-status--active { color: #0f766e; }.planning-status--idle { color: #888; }
.planning-table__action { white-space: nowrap; font-family: var(--font-mono); font-size: .5rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #b20d61; }
.planning-table__action span { display: inline-block; transition: transform 140ms cubic-bezier(.4, 0, .2, 1); }
.planning-table__empty { padding: 2.5rem 1.5rem !important; text-align: center !important; color: #666 !important; }
.planning-table__footer { display: flex; min-height: 3.5rem; align-items: center; justify-content: space-between; gap: .75rem; border-top: 1px solid #e0ddd4; padding: .45rem .75rem .45rem 1.5rem; background: white; font-family: var(--font-mono); font-size: .5rem; font-weight: 700; text-transform: uppercase; color: #777; }
.planning-table__pager { display: flex; align-items: center; gap: .3rem; }
.planning-table__pager button { display: grid; width: 2.5rem; height: 2.5rem; place-items: center; border: 1px solid #e0ddd4; border-radius: 6px; color: #b20d61; }
.planning-table__pager button:disabled { cursor: not-allowed; color: #bbb; opacity: .45; }.planning-table__pager > span { min-width: 2.25rem; text-align: center; }
.health-panel-enter-active, .health-panel-leave-active { transition: opacity 200ms cubic-bezier(0.16, 1, 0.3, 1), transform 200ms cubic-bezier(0.16, 1, 0.3, 1); }.health-panel-enter-from, .health-panel-leave-to { opacity: 0; transform: translateY(-6px); }
@media (min-width: 640px) { .health-hero__main, .health-hero__countdown { padding: 2rem; }.health-hero__facts { grid-template-columns: repeat(3, minmax(0, 1fr)); }.health-hero__facts > div + div { border-left: 1px solid #e0ddd4; }.health-hero__facts > div:nth-child(4) { border-left: 0; }.health-hero__facts > div:nth-child(n + 4) { border-top: 1px solid #e0ddd4; } }
@media (min-width: 900px) { .health-hero { grid-template-columns: minmax(0, 1fr) auto; }.health-hero__countdown { border-top: 0; border-left: 1px solid #e0ddd4; } }
@media (min-width: 1200px) { .health-hero__facts { grid-template-columns: repeat(5, minmax(0, 1fr)); }.health-hero__facts > div:nth-child(4) { border-left: 1px solid #e0ddd4; }.health-hero__facts > div:nth-child(n + 4) { border-top: 0; } }
@media (hover: hover) and (pointer: fine) { .health-hero__action:hover { transform: translateY(-1px); border-color: #e8117f; color: #e8117f; }.phase-control:hover:not(:disabled) { transform: translateY(-1px); border-color: #111; }.planning-table__task:hover strong { color: #b20d61; }.planning-table__action:hover span { transform: translateX(.2rem); }.planning-table__pager button:hover:not(:disabled) { border-color: #b20d61; background: #fce7f3; } }
@media (prefers-reduced-motion: reduce) { .health-panel-enter-active, .health-panel-leave-active, .planning-table__action span { transition: none; }.health-hero__action:hover, .phase-control:hover, .planning-table__action span { transform: none; } }
</style>
