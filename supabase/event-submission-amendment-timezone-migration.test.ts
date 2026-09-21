import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(import.meta.dirname, 'migrations', '20260921193000_event_submission_amendment_timezones.sql'),
  'utf8',
);

describe('event submission amendment timezone migration', () => {
  it('backfills historical requests and carries the approved timezone to the public event', () => {
    expect(migration).toContain('add column if not exists timezone text');
    expect(migration).toContain("coalesce(event.timezone, submission.timezone, 'UTC')");
    expect(migration).toContain('timezone = amendment.timezone');
  });
});
