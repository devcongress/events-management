import { describe, expect, it } from 'vitest';

import {
  assertMatchingSupabaseProject,
  isPathInside,
  isMissingSchemaDumpError,
  parseBackupArguments,
  parseBucketNames,
  safeStorageDestination,
} from './backup-supabase';

describe('Supabase backup safeguards', () => {
  it('parses preflight and help without accepting unknown flags', () => {
    expect(parseBackupArguments(['--preflight'])).toEqual({ help: false, preflight: true });
    expect(parseBackupArguments(['--help'])).toEqual({ help: true, preflight: false });
    expect(() => parseBackupArguments(['--execute'])).toThrow('Unknown argument');
  });

  it('uses the meetup media bucket by default and rejects unsafe names', () => {
    expect(parseBucketNames(undefined)).toEqual(['meetup-media']);
    expect(parseBucketNames('meetup-media, speaker-slides,meetup-media')).toEqual([
      'meetup-media',
      'speaker-slides',
    ]);
    expect(() => parseBucketNames('../private')).toThrow('Invalid Supabase Storage bucket name');
  });

  it('recognizes repository descendants without confusing sibling paths', () => {
    expect(isPathInside('/workspace/events', '/workspace/events/backups')).toBe(true);
    expect(isPathInside('/workspace/events', '/workspace/events-archive')).toBe(false);
    expect(isPathInside('/workspace/events', '/private/backups')).toBe(false);
  });

  it('keeps downloaded objects inside their bucket directory', () => {
    expect(safeStorageDestination('/private/backup/meetup-media', 'covers/event.webp'))
      .toBe('/private/backup/meetup-media/covers/event.webp');
    expect(() => safeStorageDestination('/private/backup/meetup-media', '../secret'))
      .toThrow('Unsafe Storage object path');
    expect(() => safeStorageDestination('/private/backup/meetup-media', 'covers//event.webp'))
      .toThrow('Unsafe Storage object path');
  });

  it('refuses to combine database and Storage data from different projects', () => {
    expect(() => assertMatchingSupabaseProject(
      new URL('https://projectone.supabase.co'),
      new URL('postgresql://postgres.projectone:password@aws-0-region.pooler.supabase.com/postgres'),
    )).not.toThrow();
    expect(() => assertMatchingSupabaseProject(
      new URL('https://projectone.supabase.co'),
      new URL('postgresql://postgres.projecttwo:password@aws-0-region.pooler.supabase.com/postgres'),
    )).toThrow('different Supabase projects');
  });

  it('recognizes only the expected absent migration-schema dump error', () => {
    expect(isMissingSchemaDumpError(new Error(
      'supabase failed with exit code 1: pg_dump: error: no matching schemas were found',
    ))).toBe(true);
    expect(isMissingSchemaDumpError(new Error('connection refused'))).toBe(false);
  });
});
