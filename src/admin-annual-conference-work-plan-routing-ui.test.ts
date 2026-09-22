import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const overviewSource = readFileSync(
  new URL('./views/admin/AdminAnnualConferenceView.vue', import.meta.url),
  'utf8',
);
const workPlanSource = readFileSync(
  new URL('./views/admin/AdminAnnualConferenceWorkPlanView.vue', import.meta.url),
  'utf8',
);
const workspaceSource = readFileSync(
  new URL('./composables/useAnnualConferenceWorkspace.ts', import.meta.url),
  'utf8',
);
const taskBoardSource = readFileSync(
  new URL('./components/AnnualConferenceTaskBoard.vue', import.meta.url),
  'utf8',
);
const mobileConferenceSource = readFileSync(
  new URL('./views/admin/AdminMobileAnnualConferenceView.vue', import.meta.url),
  'utf8',
);
const mobileEventSource = readFileSync(
  new URL('./views/admin/AdminMobileEventView.vue', import.meta.url),
  'utf8',
);

describe('Annual Conference assignee work-plan routing', () => {
  it('passes the selected assignee from Overview and applies it across the entire conference', () => {
    expect(overviewSource).toContain('query: { owner: person.filterOwner }');
    expect(workPlanSource).toContain('watch([() => route.fullPath, tasks, phases, organizerMembers, assignedAccess]');
    expect(workPlanSource).toContain('ownerDirectory.value.matches(task.accountable_owner, ownerFilter.value)');
    expect(workPlanSource).toContain('resolveAnnualConferenceOwnerFilter(tasks.value, context.owner, organizerMembers.value)');
    expect(workPlanSource).toContain("(context.owner ? 'all' : defaultAnnualConferencePhaseScope(phases.value, today.value))");
  });

  it('retains the current-phase initialization for direct work-plan visits', () => {
    expect(workspaceSource).toContain('phaseScope.value = defaultAnnualConferencePhaseScope(availablePhases, currentDate)');
    expect(workPlanSource).toContain('defaultAnnualConferencePhaseScope(phases.value, today.value)');
  });

  it('stores desktop filters, including an explicit Entire conference scope, and open tasks in the route', () => {
    expect(workPlanSource).toContain('router.push({ path: route.path, query: workPlanContextQuery(patch) })');
    expect(workPlanSource).toContain('if (!context.task && selectedTaskId.value) closeTaskDrawer()');
    expect(workPlanSource).toContain('phase: phaseFilter.value');
    expect(mobileConferenceSource).toContain('phase: phaseFilterValue.value');
  });

  it('uses route history for mobile sections and task drawers', () => {
    expect(mobileEventSource).toContain('void router.push({');
    expect(mobileEventSource).toContain('watch(() => route.query.section');
    expect(mobileConferenceSource).toContain('pushMobileConferenceContext({ task: taskId })');
    expect(mobileConferenceSource).toContain('watch([() => route.fullPath, tasks, phases, assignedAccess]');
  });

  it('keeps volunteers in a focused board without a redundant assigned-only owner control', () => {
    expect(workPlanSource).toContain("const isConferenceVolunteer = computed(() => sessionQuery.data.value?.user?.role === 'volunteer');");
    expect(workPlanSource).toContain('const usesKanbanBoard = computed(() => isConferenceOrganizer.value || isConferenceVolunteer.value);');
    expect(workPlanSource).toContain('v-if="!isConferenceVolunteer || filtersActive"');
    expect(workPlanSource).not.toContain('Tasks for');
    expect(workPlanSource).not.toContain('currentMemberLabel');
    expect(workPlanSource).toContain('v-if="!assignedAccess"');
    expect(mobileConferenceSource).toContain('class="assigned-task-owner"');
    expect(mobileConferenceSource).toContain('ownerFilter.value = assignedAccess.value ? \'all\'');
  });

  it('opens overview delivery signals and dependency tasks in the matching work-plan context', () => {
    expect(overviewSource).toContain(":to=\"workPlanTarget({ owner: 'unassigned' })\"");
    expect(overviewSource).toContain(":to=\"workPlanTarget({ status: 'blocked' })\"");
    expect(overviewSource).toContain(":to=\"workPlanTarget({ task: blocker.prerequisite.id })\"");
    expect(overviewSource).toContain(":to=\"workPlanTarget({ task: dependent.id })\"");
    expect(overviewSource).toContain("query: { phase: 'all', ...query }");
  });

  it('uses the route transition instead of a competing ledger transition', () => {
    expect(workPlanSource).toContain('function updateLedgerFilters(update: () => void, afterUpdate?: () => void)');
    expect(workPlanSource).not.toContain('startViewTransition');
  });

  it('keeps phase and owner controls in one labelled controls section', () => {
    expect(workPlanSource.match(/work plan controls/g)).toHaveLength(1);
    expect(workPlanSource).not.toContain('workstream-filter-label');
    expect(workPlanSource).not.toContain('workstreamSummaries');
    expect(workPlanSource).toContain('const activeWorkstreamLabel');
    expect(workPlanSource).toContain('@click="clearWorkstreamFilter"');
    expect(workPlanSource).not.toContain('One accountable owner');
    expect(workPlanSource).not.toContain('Filter tasks by status');
    expect(workPlanSource).not.toContain('Task ledger');
    expect(workPlanSource).toContain('Filter tasks by owner: ${owner.label}');
    expect(workPlanSource).toContain('ownerAvatarPreviews');
    expect(workPlanSource).toContain('const visibleOwners = owners.value.slice(0, 4);');
    expect(workPlanSource).toContain('return [...visibleOwners.slice(0, -1), selectedOwner];');
    expect(workPlanSource).toContain('!ownerAvatarPreviews.value.some((preview) => preview.key === owner.key)');
    expect(workPlanSource).toContain('selectedOwnerAvatarSeed(owner)');
    expect(workPlanSource).toContain('More owner filters. Current filter: ${selectedOwnerLabel}');
    expect(workPlanSource).toContain('@click="setOwnerFilter(owner.filter_value)"');
    expect(workPlanSource).toContain('hiddenOwnerCount');
    expect(workPlanSource).toContain('visibleOwnerKeys');
    expect(workPlanSource).toContain(':disabled="!filtersActive"');
    expect(workPlanSource).toContain(": 'cursor-not-allowed text-dc-gray/45'");
    expect(workPlanSource).toContain('role="tooltip"');
    expect(workPlanSource).toContain('owner-filter-tooltip-${owner.key}');
    expect(workPlanSource).toContain('group-hover:opacity-100');
    expect(workPlanSource).not.toContain('hover:-translate-y-0.5');
    expect(workPlanSource).toContain("'!border-2 !border-dc-paper !outline !outline-2 !outline-dotted !outline-dc-pink'");
  });

  it('applies attention filters consistently in desktop and mobile Work plans', () => {
    expect(workPlanSource).toContain('matchesAnnualConferenceTaskAttention(task, attentionFilter.value, today.value)');
    expect(mobileConferenceSource).toContain('matchesAnnualConferenceTaskAttention(task, attentionFilter.value, today.value)');
  });

  it('uses the desktop Work plan board for organizers and volunteers', () => {
    expect(workPlanSource).toContain('<AnnualConferenceTaskBoard');
    expect(workPlanSource).toContain(':tasks="visibleTasks"');
    expect(workPlanSource).toContain('class="hidden lg:block"');
    expect(workPlanSource).toContain(":class=\"{ 'lg:hidden': usesKanbanBoard }\"");
    expect(workPlanSource).toContain('v-if="usesKanbanBoard"');
    expect(workPlanSource).toContain('@change-status="moveTask"');
    expect(workPlanSource).toContain("return role === 'owner' || role === 'organizer';");
    expect(workPlanSource).toContain('function canMoveTask(task: AnnualConferenceTask): boolean');
    expect(workPlanSource).toContain('permissions.value?.can_update_all_task_status');
    expect(workPlanSource).toContain('permissions.value?.can_update_assigned_task_status === true');
  });

  it('moves a dragged card to the top of its destination column before its request settles', () => {
    expect(workspaceSource).toContain('const pendingBoardEntryOverrides = ref(new Map<string, string>());');
    expect(workspaceSource).toContain('const boardEnteredAt = new Date().toISOString();');
    expect(workspaceSource).toContain('setPendingBoardEntry(year, taskId, boardEnteredAt);');
    expect(workspaceSource).toContain('board_entered_at: pendingBoardEntry');
  });

  it('keeps the filtered board inside the shared Work plan workspace surface', () => {
    expect(workPlanSource).toContain('class="annual-task-workspace border-2 border-dc-ink bg-dc-paper md:sticky md:z-30"');
    expect(workPlanSource).toContain('annual-task-workspace__controls flex flex-wrap items-center justify-between gap-4 border-b border-dc-ink');
    expect(workPlanSource).toContain('annual-task-workspace__controls');
    expect(workPlanSource).toContain("'--annual-conference-nav-height': `${annualConferenceNavHeight}px`");
    expect(workPlanSource).toContain('function updateAnnualConferenceNavHeight()');
    expect(workPlanSource).toContain('annualConferenceNavObserver = new ResizeObserver(updateAnnualConferenceNavHeight)');
    expect(workPlanSource).toContain('ref="annualTaskWorkspace"');
    expect(workPlanSource).toContain('annualTaskWorkspaceObserver = new ResizeObserver(updateAnnualTaskWorkspaceHeight)');
    expect(workPlanSource).toContain("'--task-board-sticky-offset': `calc(${annualConferenceNavHeight}px + ${annualTaskWorkspaceHeight}px + .75rem)`");
    expect(workPlanSource).toContain('class="annual-task-ledger rounded-b-lg border-x-2 border-b-2 border-dc-ink bg-dc-paper"');
    expect(workPlanSource).toContain('top: var(--annual-conference-nav-height);');
    expect(taskBoardSource).toContain('top: var(--task-board-sticky-offset);');
    expect(taskBoardSource).toContain('.task-board__column-header {\n    position: sticky;');
    expect(taskBoardSource).toContain('box-shadow: 0 -.75rem 0 1px #f5f2e8;');
  });

  it('keeps native drag-and-drop without a per-card status selector', () => {
    expect(taskBoardSource).toContain('@dragstart="beginDrag($event, task)"');
    expect(taskBoardSource).toContain('@drop="dropTask($event, column.status)"');
    expect(taskBoardSource).toContain('requestStatusChange(task, status)');
    expect(taskBoardSource).toContain("'task-board__column--active-drop'");
    expect(taskBoardSource).not.toContain('<select');
    expect(taskBoardSource).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));');
    expect(taskBoardSource).toContain('.task-board__column {\n  min-width: 0;');
    expect(taskBoardSource).toContain('.task-board__card {\n  min-width: 0;');
  });

  it('queues board status moves per task without locking the whole board', () => {
    expect(workPlanSource).toContain('queueTaskStatus(task.id, status)');
    expect(workPlanSource).toContain(':saving-task-ids="pendingStatusTaskIds"');
    expect(workPlanSource).toContain('const selectedTaskStatusSaving = computed(() => selectedTaskId.value !== null');
    expect(workPlanSource).toContain("notify.info('Task status is still saving. Try again in a moment.')");
    expect(workPlanSource).toContain('updateMutation.isPending.value || selectedTaskStatusSaving');
    expect(workPlanSource).not.toContain('updateMutation.isPending.value || task.status === status');
    expect(workspaceSource).toContain('const pendingStatusOverrides = ref(new Map<string, AnnualConferenceTask[\'status\']>())');
    expect(workspaceSource).toContain('const statusQueues = ref(new Map<string, StatusQueueEntry>())');
    expect(workspaceSource).toContain('function queueTaskStatus(taskId: string, status: AnnualConferenceTask[\'status\'])');
    expect(workspaceSource).toContain('async function processStatusQueue(key: string): Promise<void>');
    expect(workspaceSource).toContain('if (!entry || entry.requestActive) return;');
    expect(workspaceSource).toContain('if (settledEntry.desiredStatus === settledEntry.confirmedStatus)');
    expect(workspaceSource).toContain('if (settledEntry.desiredStatus !== activeEntry.desiredStatus)');
    expect(workspaceSource).toContain('previousStatus = variables.previousStatus ?? cachedStatus');
    expect(taskBoardSource).toContain('savingTaskIds?: ReadonlySet<string>;');
    expect(taskBoardSource).toContain(':draggable="canMoveTask(task)"');
    expect(taskBoardSource).not.toContain('props.busy');
  });

  it('keeps board cards compact and opens their details from the card surface', () => {
    expect(taskBoardSource).toContain('@click="emit(\'openTask\', task)"');
    expect(taskBoardSource).toContain('@keydown.enter.prevent="emit(\'openTask\', task)"');
    expect(taskBoardSource).toContain('cursor: pointer;');
    expect(taskBoardSource).toContain('annualConferenceTaskCardDescription');
    expect(taskBoardSource).toContain('white-space: nowrap;');
    expect(taskBoardSource).toContain('text-overflow: ellipsis;');
    expect(taskBoardSource).toContain('-webkit-line-clamp: 2;');
    expect(taskBoardSource).toContain('class="task-board__target-date"');
    expect(taskBoardSource).toContain('M5 17.25V3.25');
    expect(taskBoardSource).not.toContain('Needs target date');
    expect(taskBoardSource).not.toContain('checklist items');
    expect(taskBoardSource).toContain("import NaviiAvatar from '@/src/components/NaviiAvatar.vue';");
    expect(taskBoardSource).toContain('ownerAvatarSeeds: ReadonlyMap<string, string>');
    expect(taskBoardSource).toContain(':seed="ownerAvatarSeed(task)!"');
    expect(taskBoardSource).toContain('function taskCountLabel(count: number): string');
    expect(taskBoardSource).toContain(':aria-label="taskCountLabel(column.tasks.length)"');
    expect(taskBoardSource).toContain("not_started: { accent: '#777777', countLabel: 'queued' }");
    expect(taskBoardSource).toContain("in_progress: { accent: '#d97706', countLabel: 'active' }");
    expect(taskBoardSource).toContain("done: { accent: '#0f766e', countLabel: 'shipped' }");
    expect(taskBoardSource).toContain('Clear runway');
    expect(taskBoardSource).toContain('No blocked tasks in this view. Drop a task here.');
    expect(taskBoardSource).toContain('task-board-status-accent');
    expect(taskBoardSource).not.toContain('background: #111;');
    expect(taskBoardSource).toContain('new ResizeObserver(animateBoardResize)');
    expect(taskBoardSource).toContain("easing: 'cubic-bezier(.16, 1, .3, 1)'");
    expect(taskBoardSource).toContain("window.matchMedia('(prefers-reduced-motion: reduce)')");
  });

  it('keeps date-only targets and the unassigned owner filter available', () => {
    expect(taskBoardSource).toContain("timeZone: 'UTC'");
    expect(workPlanSource).toContain('function toggleUnassignedFilter()');
    expect(workPlanSource).toContain('Need owners</span>');
    expect(workPlanSource).toContain('annualConferencePhaseTiming');
    expect(workPlanSource).toContain('const selectedPhaseHealth = computed');
    expect(workPlanSource).toContain('selectedPhaseHealth.time_elapsed_percent');
    expect(workPlanSource).toContain("? 'calc(100% - 2px)'");
    expect(workPlanSource).toContain('text-[#92400e]');
    expect(workPlanSource).toContain('Phase completion');
    expect(workPlanSource).toContain('All assigned');
  });
});
