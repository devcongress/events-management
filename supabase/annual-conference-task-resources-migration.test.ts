import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('./migrations/20260908090000_annual_conference_task_resources.sql', import.meta.url),
  'utf8',
).toLowerCase();

describe('Annual Conference task resources migration', () => {
  it('serializes per-task inserts before enforcing the 20-row cap', () => {
    const lock = migration.indexOf('from public.annual_conference_tasks');
    const forUpdate = migration.indexOf('for update', lock);
    const count = migration.indexOf('from public.annual_conference_task_resources', forUpdate);
    const limit = migration.indexOf('>= 20', count);

    expect(lock).toBeGreaterThan(-1);
    expect(forUpdate).toBeGreaterThan(lock);
    expect(count).toBeGreaterThan(forUpdate);
    expect(limit).toBeGreaterThan(count);
    expect(migration).toContain('before insert on public.annual_conference_task_resources');
  });

  it('keeps resources task-scoped, cascade-cleaned, and service-role only', () => {
    expect(migration).toContain('references public.annual_conference_tasks(id) on delete cascade');
    expect(migration).toContain('alter table public.annual_conference_task_resources enable row level security');
    expect(migration).toContain('revoke all on public.annual_conference_task_resources from anon, authenticated');
    expect(migration).toContain('grant select, insert, update, delete on public.annual_conference_task_resources to service_role');
  });
});
