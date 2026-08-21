import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(path.resolve('supabase/migrations/20260821090000_event_page_monitors.sql'), 'utf8');

describe('event page monitor migration', () => {
  it('keeps monitoring state private and constrained', () => {
    expect(migration).toContain('alter table public.event_page_monitors enable row level security');
    expect(migration).toContain('revoke all on public.event_page_monitors from public, anon, authenticated');
    expect(migration).toContain("check (source_url ~ '^https://')");
    expect(migration).toContain('where enabled = true and next_check_at is not null');
  });
});
