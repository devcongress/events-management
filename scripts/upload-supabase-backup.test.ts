import { describe, expect, it } from 'vitest';

import {
  buildObjectKey,
  buildRetentionPlan,
  normalizePrefix,
  parseArchiveTimestamp,
  parseUploadArguments,
} from './upload-supabase-backup';

function archiveKey(timestamp: string): string {
  const date = timestamp.slice(0, 8);

  return `events-management/supabase/${date.slice(0, 4)}/${date.slice(4, 6)}/events-management-supabase-${timestamp}.tar.gz.age`;
}

describe('Supabase R2 backup upload safeguards', () => {
  it('accepts one archive and an optional prune flag', () => {
    expect(parseUploadArguments(['/tmp/events-management-supabase-20260915T020000Z.tar.gz.age']))
      .toEqual({
        archivePath: '/tmp/events-management-supabase-20260915T020000Z.tar.gz.age',
        prune: false,
      });
    expect(parseUploadArguments(['--prune', '/tmp/events-management-supabase-20260915T020000Z.tar.gz.age']).prune)
      .toBe(true);
    expect(() => parseUploadArguments([])).toThrow('exactly one');
    expect(() => parseUploadArguments(['--delete-all', '/tmp/archive'])).toThrow('Unknown argument');
  });

  it('validates archive timestamps and produces deterministic keys', () => {
    const archive = 'events-management-supabase-20260915T020000Z.tar.gz.age';

    expect(parseArchiveTimestamp(archive)?.toISOString()).toBe('2026-09-15T02:00:00.000Z');
    expect(parseArchiveTimestamp('events-management-supabase-20260231T020000Z.tar.gz.age')).toBeNull();
    expect(parseArchiveTimestamp('database.zip')).toBeNull();
    expect(buildObjectKey('events-management/supabase', archive))
      .toBe(`events-management/supabase/2026/09/${archive}`);
  });

  it('rejects unsafe object prefixes', () => {
    expect(normalizePrefix(undefined)).toBe('events-management/supabase');
    expect(normalizePrefix('private/backups')).toBe('private/backups');
    expect(() => normalizePrefix('../backups')).toThrow('safe');
    expect(() => normalizePrefix('backups//daily')).toThrow('safe');
    expect(() => normalizePrefix('backups\\daily')).toThrow('safe');
  });

  it('keeps seven days, four weeks, and twelve months without touching unknown objects', () => {
    const keys = [
      'README.txt',
      archiveKey('20260915T020000Z'),
      archiveKey('20260915T010000Z'),
      archiveKey('20260914T020000Z'),
      archiveKey('20260913T020000Z'),
      archiveKey('20260912T020000Z'),
      archiveKey('20260911T020000Z'),
      archiveKey('20260910T020000Z'),
      archiveKey('20260909T020000Z'),
      archiveKey('20260901T020000Z'),
      archiveKey('20260820T020000Z'),
      archiveKey('20260715T020000Z'),
      archiveKey('20260615T020000Z'),
      archiveKey('20260515T020000Z'),
      archiveKey('20260415T020000Z'),
      archiveKey('20260315T020000Z'),
      archiveKey('20260215T020000Z'),
      archiveKey('20260115T020000Z'),
      archiveKey('20251215T020000Z'),
      archiveKey('20251115T020000Z'),
      archiveKey('20251015T020000Z'),
      archiveKey('20250915T020000Z'),
      archiveKey('20250815T020000Z'),
    ];
    const plan = buildRetentionPlan(keys);

    expect(plan.keepKeys).toContain(archiveKey('20260915T020000Z'));
    expect(plan.deleteKeys).toContain(archiveKey('20260915T010000Z'));
    expect(plan.keepKeys).toContain(archiveKey('20251015T020000Z'));
    expect(plan.deleteKeys).toContain(archiveKey('20250815T020000Z'));
    expect(plan.unrecognizedKeys).toEqual(['README.txt']);
    expect(plan.deleteKeys).not.toContain('README.txt');
  });
});
