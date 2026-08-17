import { describe, expect, it } from 'vitest';

import { loadCatalog, validateCoverageContracts } from './catalog';

describe('Scenario Atlas workflow catalog', () => {
  it('loads the tracked catalog and accounts for every declared coverage dimension', () => {
    const catalog = loadCatalog();
    expect(catalog.workflows.map((workflow) => workflow.id)).toEqual([
      'external-submission',
      'organizer-moderation',
    ]);
    expect(() => validateCoverageContracts(catalog)).not.toThrow();
  });

  it('fails when a required dimension is silently omitted', () => {
    const catalog = structuredClone(loadCatalog());
    catalog.workflows[0].coverageContract.required.failure.push('unknown-new-failure');
    expect(() => validateCoverageContracts(catalog)).toThrow(/unknown-new-failure/);
  });
});
