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
    expect(workPlanSource).toContain('watch([() => route.fullPath, tasks, phases, organizerMembers]');
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
    expect(mobileConferenceSource).toContain('watch([() => route.fullPath, tasks, phases]');
  });
});
