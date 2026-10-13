import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('./migrations/20261013180000_devcon26_test_checkout_emails.sql', import.meta.url), 'utf8');

describe('sandbox checkout email migration safety', () => {
  it('queues atomically on first verification without backfilling or touching live admissions', () => {
    expect(sql).toContain("old.status is distinct from 'verified' and new.status = 'verified'");
    expect(sql).toContain('on conflict (session_id) do nothing');
    expect(sql).not.toContain('annual_conference_');
    expect(sql).toContain('session_id uuid not null unique');
    expect(sql).toContain('idempotency_key text not null unique');
  });

  it('locks claims, bounds retry ambiguity, freezes payloads and protects access', () => {
    expect(sql).toContain('for update skip locked limit 5');
    expect(sql).toContain("interval '1 hour'");
    expect(sql).toContain('attempt_count < 5');
    expect(sql).toContain("interval '10 minutes'");
    expect(sql).toContain('if v_row.provider_payload is not null then return v_row.provider_payload');
    expect(sql).toContain('p_payload->\'to\' is distinct from jsonb_build_array(v_row.recipient_email)');
    expect(sql).toContain("claim_token = p_claim_token and status = 'sending' and lease_until > now()");
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('from public, anon, authenticated');
    expect(sql).toContain('set search_path = public, pg_temp');
  });
});
