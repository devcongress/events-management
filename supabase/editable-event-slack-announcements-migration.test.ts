import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve('supabase/migrations/20260909113000_editable_event_slack_announcements.sql'),
  'utf8',
);

describe('editable event Slack announcements migration', () => {
  it('stores a complete provider message reference and update outcome', () => {
    expect(migration).toContain('provider_channel_id text');
    expect(migration).toContain('provider_message_ts text');
    expect(migration).toContain('event_slack_announcements_provider_reference_pair');
    expect(migration).toContain('message_update_last_error text');
  });

  it('keeps the completion RPC compatible while accepting provider identifiers', () => {
    expect(migration).toContain('p_error text default null');
    expect(migration).toContain('p_provider_channel_id text default null');
    expect(migration).toContain('p_provider_message_ts text default null');
    expect(migration).toContain('grant execute on function public.complete_event_slack_announcement(uuid, uuid, boolean, text, text, text) to service_role');
  });
});
