import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260810180000_fix_event_submission_root_outbox_conflicts.sql',
);

describe('event submission decision outbox migration', () => {
  it('targets the root-delivery partial unique index for approval and rejection', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    const qualifiedConflict = /on conflict \(submission_id, kind\) where amendment_id is null do nothing/g;

    expect(migration.match(qualifiedConflict)).toHaveLength(4);
    expect(migration).not.toMatch(/on conflict \(submission_id, kind\) do nothing/);
  });
});
