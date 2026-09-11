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
const timelineSource = readFileSync(
  new URL('./views/admin/AdminAnnualConferenceTimelineView.vue', import.meta.url),
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

  it('stores desktop filters and open tasks in the route', () => {
    expect(workPlanSource).toContain('router.push({ path: route.path, query: workPlanContextQuery(patch) })');
    expect(workPlanSource).toContain('if (!context.task && selectedTaskId.value) closeTaskDrawer()');
    expect(timelineSource).toContain('router.push({ path: route.path, query: timelineQuery(patch) })');
    expect(timelineSource).toContain('watch([() => route.fullPath, tasks, phases]');
  });

  it('uses route history for mobile sections and task drawers', () => {
    expect(mobileEventSource).toContain('void router.push({');
    expect(mobileEventSource).toContain('watch(() => route.query.section');
    expect(mobileConferenceSource).toContain('pushMobileConferenceContext({ task: taskId })');
    expect(mobileConferenceSource).toContain('watch([() => route.fullPath, tasks, phases, assignedAccess]');
  });

  it('shows volunteer identity instead of an owner selector for assigned-only work plans', () => {
    expect(workPlanSource).toContain('v-if="assignedAccess"');
    expect(workPlanSource).toContain('Tasks for');
    expect(workPlanSource).toContain('{{ currentMemberLabel }}');
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

  it('does not animate the ledger underneath an opening or open task drawer', () => {
    expect(workPlanSource).toContain('}, !requestedTask);');
    expect(workPlanSource).toContain('function updateLedgerFilters(update: () => void, afterUpdate?: () => void, animate = true)');
    expect(workPlanSource).toContain('!animate\n    || selectedTaskId.value\n    || showCreateForm.value');
  });

  it('keeps every work-plan filter in one labelled controls section', () => {
    expect(workPlanSource).toContain('id="workstream-filter-label"');
    expect(workPlanSource).toContain('aria-labelledby="workstream-filter-label"');
    expect(workPlanSource.match(/work plan controls/g)).toHaveLength(1);
    expect(workPlanSource).not.toContain('{{ phaseScopeLabel }} workstreams');
    expect(workPlanSource).not.toContain('Task ledger');
  });

  it('opens timeline readiness counts as exact desktop and mobile work-plan filters', () => {
    expect(timelineSource).toContain("workPlanTarget({ attention: 'needs_planning' })");
    expect(timelineSource).toContain("workPlanTarget({ attention: 'overdue' })");
    expect(timelineSource).toContain("workPlanTarget({ attention: 'due_soon' })");
    expect(timelineSource).toContain("workPlanTarget({ status: 'blocked' })");
    expect(workPlanSource).toContain('matchesAnnualConferenceTaskAttention(task, attentionFilter.value, today.value)');
    expect(mobileConferenceSource).toContain('matchesAnnualConferenceTaskAttention(task, attentionFilter.value, today.value)');
  });
});
