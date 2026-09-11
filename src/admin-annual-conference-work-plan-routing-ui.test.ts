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

describe('Annual Conference assignee work-plan routing', () => {
  it('passes the selected assignee from Overview and applies it across the entire conference', () => {
    expect(overviewSource).toContain('query: { owner: person.filterOwner }');
    expect(workPlanSource).toContain('watch([tasks, routeOwnerFilter]');
    expect(workPlanSource).toContain('resolveAnnualConferenceOwnerFilter(tasks.value, routeOwnerFilter.value)');
    expect(workPlanSource).toContain("phaseFilter.value = 'all';\n    ownerFilter.value = requestedOwner;");
  });

  it('retains the current-phase initialization for direct work-plan visits', () => {
    expect(workspaceSource).toContain('phaseScope.value = defaultAnnualConferencePhaseScope(availablePhases, currentDate)');
    expect(workPlanSource).toContain("if (routeOwnerFilterApplied.value || !routeOwnerFilter.value || tasks.value.length === 0) return;");
  });
});
