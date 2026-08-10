import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260810233000_event_submission_cover_fallback.sql',
);

describe('event submission cover fallback migration', () => {
  it('normalizes the Meet screenshot and uses the agreed fallback for future no-cover approvals', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain("set cover_url = '/images/event-announcement-fallback.png'");
    expect(migration).toContain("coalesce(nullif(trim(submission.cover_url), ''), '/images/event-announcement-fallback.png')");
    expect(migration).toContain("'/images/quarterly-april-meetup-2.jpeg'");
    expect(migration).not.toContain("coalesce(nullif(trim(submission.cover_url), ''), '/images/quarterly-april-meetup-2.jpeg')");
  });
});
