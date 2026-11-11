import { describe, expect, it } from 'vitest';
import { subtabAccessChanges, subtabAccessState } from './conference-subtab-access';

const leaves = ['registration.emails.view', 'registration.emails.manage', 'registration.emails.retry'] as const;

describe('conference sub-tab access', () => {
  it('reports off, limited and fully enabled states without changing grants', () => {
    expect(subtabAccessState(leaves, [], [])).toMatchObject({ checked: false, limited: false, label: 'Off' });
    expect(subtabAccessState(leaves, [leaves[0]], leaves)).toMatchObject({ checked: true, limited: true, label: 'Limited access', provenance: 'Includes role defaults' });
    expect(subtabAccessState(leaves, leaves, [])).toMatchObject({ checked: true, limited: false, label: 'On', provenance: 'Edition access' });
    expect(subtabAccessState(leaves, [leaves[1]], [leaves[0]])).toMatchObject({ limited: true, provenance: 'Edition access' });
  });

  it('batches every delegable action for either switch direction', () => {
    for (const enabled of [true, false]) {
      expect(subtabAccessChanges(leaves, 'member', enabled)).toEqual(leaves.map((capability) => ({ capability, enabled })));
      expect(subtabAccessChanges(leaves, 'volunteer', enabled)).toEqual([]);
      expect(subtabAccessChanges(['volunteers.reviews.view', 'volunteers.reviews.manage', 'finance.view'], 'volunteer', enabled)).toEqual([
        { capability: 'volunteers.reviews.view', enabled }, { capability: 'volunteers.reviews.manage', enabled },
      ]);
    }
  });
});
