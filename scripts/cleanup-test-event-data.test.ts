import { describe, expect, it } from 'vitest';

import {
  DELETE_CONFIRMATION,
  isTestEventLabel,
  mergeTestEvents,
  parseCleanupArguments,
} from './cleanup-test-event-data';

describe('cleanup test event data safeguards', () => {
  it('defaults to a dry run', () => {
    expect(parseCleanupArguments([])).toEqual({ execute: false, confirmation: null, help: false });
  });

  it('parses the explicit destructive confirmation', () => {
    expect(parseCleanupArguments(['--execute', '--confirm', DELETE_CONFIRMATION])).toEqual({
      execute: true,
      confirmation: DELETE_CONFIRMATION,
      help: false,
    });
  });

  it('rejects unknown arguments', () => {
    expect(() => parseCleanupArguments(['--all'])).toThrow('Unknown argument: --all');
  });

  it('recognizes only the fixed test prefix', () => {
    expect(isTestEventLabel('[TEST] Community workshop')).toBe(true);
    expect(isTestEventLabel('[test] Community workshop')).toBe(true);
    expect(isTestEventLabel('  [TEST] Community workshop')).toBe(false);
    expect(isTestEventLabel('Community workshop')).toBe(false);
  });

  it('deduplicates linked and prefix-matched events', () => {
    const event = {
      id: 'event-1',
      name: '[TEST] Community workshop',
      publication_status: 'published',
      publish_to_website: true,
      source_submission_id: 'submission-1',
      created_at: '2026-08-02T12:00:00.000Z',
    };

    expect(mergeTestEvents([event], [event])).toEqual([event]);
  });
});
