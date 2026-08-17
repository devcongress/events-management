import { describe, expect, it } from 'vitest';

import { loadCatalog } from '../catalog/catalog';
import { applyScenarioState, type ScenarioStateMap } from './status';

describe('Scenario Atlas status propagation', () => {
  it('marks stages after the first unresolved checkpoint as not reached', () => {
    const runtime = applyScenarioState(loadCatalog(), {});
    const submission = runtime.workflows.find((workflow) => workflow.id === 'external-submission');
    expect(submission?.checkpoints.map((checkpoint) => checkpoint.status)).toEqual([
      'untested',
      'not_reached',
      'not_reached',
      'not_reached',
    ]);
  });

  it('keeps parallel terminal branches at the same stage independently visible', () => {
    const catalog = loadCatalog();
    const state: ScenarioStateMap = Object.fromEntries(catalog.workflows.flatMap((workflow) => workflow.checkpoints.flatMap((checkpoint) => checkpoint.scenarios.map((scenario) => [scenario.id, { status: 'verified' as const, note: '', updatedAt: null }]))));
    state['MOD-03B'] = { status: 'failed', note: '', updatedAt: null };
    const moderation = applyScenarioState(catalog, state).workflows.find((workflow) => workflow.id === 'organizer-moderation');
    expect(moderation?.checkpoints.slice(-2).map((checkpoint) => checkpoint.status)).toEqual(['verified', 'failed']);
  });
});
