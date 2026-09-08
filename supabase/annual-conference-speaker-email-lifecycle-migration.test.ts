import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve('supabase/migrations/20260907190000_annual_conference_speaker_email_lifecycle.sql'),
  'utf8',
);

describe('Annual Conference speaker email lifecycle migration', () => {
  it('keeps conference decisions proposal-scoped and retryable', () => {
    expect(migration).toContain('decision_email_idempotency_key');
    expect(migration).toContain('annual_conference_speaker_submissions_decision_email_retry_idx');
    expect(migration).toContain("decision_email_kind = 'rejection'");
    expect(migration).toContain("decision_email_kind = 'acceptance'");
    expect(migration).toContain("proposal.status <> 'submitted'");
  });

  it('revokes only the selected proposal link during explicit replacement', () => {
    expect(migration).toContain('create or replace function public.rotate_annual_conference_speaker_workspace');
    expect(migration).toContain('p_expected_link_id uuid');
    expect(migration).toContain('proposal.selected_intake_link_id is distinct from p_expected_link_id');
    expect(migration).toContain('where id = proposal.selected_intake_link_id and revoked_at is null');
  });

  it('stores signed provider events separately from proposal submissions', () => {
    expect(migration).toContain('create table if not exists public.annual_conference_email_webhook_events');
    expect(migration).toContain('webhook_event_id text primary key');
    for (const eventType of ['email.bounced', 'email.failed', 'email.suppressed', 'email.complained']) {
      expect(migration).toContain(`'${eventType}'`);
    }
    expect(migration).toContain('revoke all on table public.annual_conference_email_webhook_events from public, anon, authenticated');
    expect(migration).toContain('create or replace function public.apply_annual_conference_speaker_email_event');
    expect(migration).toContain('for update;');
  });

  it('claims retries and recipient corrections with compare-and-set guards', () => {
    expect(migration).toContain('create or replace function public.claim_annual_conference_speaker_email_attempt');
    expect(migration).toContain('proposal.decision_email_idempotency_key is distinct from p_expected_idempotency_key');
    expect(migration).toContain('proposal.decision_email_attempt_count <> p_expected_attempt_count');
    expect(migration).toContain('create or replace function public.replace_annual_conference_speaker_email_recipient');
    expect(migration).toContain("proposal.decision_email_last_attempt_at > now() - interval '5 minutes'");
  });
});
