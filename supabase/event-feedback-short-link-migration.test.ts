import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migration = await readFile(
  new URL('./migrations/20260829151000_event_feedback_short_link.sql', import.meta.url),
  'utf8',
);
const supportMigration = await readFile(
  new URL('./migrations/20260829151500_event_feedback_short_link_support.sql', import.meta.url),
  'utf8',
);

describe('event feedback short-link migration', () => {
  it('adds an event-scoped feedback destination to the managed short-link contract', () => {
    expect(migration).toContain("add value if not exists 'event_feedback'");
    expect(supportMigration).toContain("destination in ('monthly_cfp', 'event_registration', 'event_feedback')");
    expect(supportMigration).toContain("if input_destination in ('monthly_cfp', 'event_registration', 'event_feedback') then");
  });
});
