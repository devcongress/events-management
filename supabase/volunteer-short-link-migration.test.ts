import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const destinationMigration = await readFile(
  new URL('./migrations/20260820200000_volunteer_short_link_destination.sql', import.meta.url),
  'utf8',
);
const supportMigration = await readFile(
  new URL('./migrations/20260820200500_volunteer_short_link_support.sql', import.meta.url),
  'utf8',
);

describe('volunteer short-link migration', () => {
  it('adds one global volunteer destination with no event or edition target', () => {
    expect(destinationMigration).toContain("add value if not exists 'volunteer_intake'");
    expect(supportMigration).toContain("destination = 'volunteer_intake' and event_id is null and conference_edition_id is null");
    expect(supportMigration).toContain('short_links_one_active_global_destination_idx');
    expect(supportMigration).toContain("where status = 'active' and destination = 'volunteer_intake'");
  });

  it('serializes creation and regeneration for the global destination', () => {
    expect(supportMigration).toContain('perform pg_advisory_xact_lock(hashtext(input_destination::text));');
    expect(supportMigration).toContain('perform pg_advisory_xact_lock(hashtext(current_link.destination::text));');
  });
});
