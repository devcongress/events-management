import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const destinationMigration = await readFile(
  new URL('./migrations/20260925140000_volunteer_follow_up_test_short_link.sql', import.meta.url),
  'utf8',
);
const supportMigration = await readFile(
  new URL('./migrations/20260925140500_volunteer_follow_up_test_short_link_support.sql', import.meta.url),
  'utf8',
);

describe('volunteer follow-up test short-link migration', () => {
  it('adds one global test destination with no event or edition target', () => {
    expect(destinationMigration).toContain("add value if not exists 'volunteer_follow_up_test'");
    expect(supportMigration).toContain("destination in ('volunteer_intake', 'volunteer_follow_up_test')");
    expect(supportMigration).toContain('short_links_one_active_global_test_destination_idx');
  });

  it('serializes global test-link creation', () => {
    expect(supportMigration).toContain('perform pg_advisory_xact_lock(hashtext(input_destination::text));');
  });
});
