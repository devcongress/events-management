import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('./migrations/20261012140000_annual_conference_ticketing_capability.sql', import.meta.url),
  'utf8',
);

describe('annual conference Ticketing capability migration', () => {
  it('adds Ticketing to the grant catalogue and makes it Organizer-only', () => {
    expect(migration).toContain("'ticketing.manage'");
    expect(migration).toContain("'finance.view', 'ticketing.manage'");
    expect(migration).not.toMatch(/v_membership\.role = 'volunteer'[\s\S]*?'ticketing\.manage'/);
  });
});
