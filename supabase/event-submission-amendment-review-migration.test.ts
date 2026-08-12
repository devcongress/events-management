import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260812123000_fix_event_submission_amendment_review.sql',
);

describe('event submission amendment review migration', () => {
  const migration = readFileSync(migrationPath, 'utf8');

  it('updates only canonical community event location columns', () => {
    expect(migration).toContain('location_name = next_location_name');
    expect(migration).toContain('location_label = next_location_label');
    expect(migration).toContain('venue_address = amendment.venue_address');
    expect(migration).not.toMatch(/\n\s*venue_name\s*=/);
  });

  it('keeps canonical location names non-blank for every location type', () => {
    expect(migration).toContain("when amendment.location_type = 'online' then 'Online'");
    expect(migration).toContain("nullif(trim(amendment.venue_name), '')");
    expect(migration).toContain("nullif(trim(current_event.location_name), '')");
    expect(migration).toContain("'Venue to be announced'");
  });

  it('preserves unchanged covers and queues an idempotent decision email', () => {
    expect(migration).toContain("cover_url = coalesce(nullif(trim(amendment.cover_url), ''), current_event.cover_url)");
    expect(migration).toContain("case when p_approve then 'amendment_approved' else 'amendment_rejected' end");
    expect(migration).toContain('on conflict do nothing');
  });
});
