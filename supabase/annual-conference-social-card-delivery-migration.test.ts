import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migration = await readFile(
  new URL('./migrations/20261011110000_annual_conference_social_card_delivery.sql', import.meta.url),
  'utf8',
);

describe('annual conference social-card delivery migration', () => {
  it('removes ticket-outbox coupling and creates a dedicated delivery outbox', () => {
    expect(migration).toContain("set payload = payload - 'social_card_capability'");
    expect(migration).toContain("where payload ? 'social_card_capability';");
    expect(migration.indexOf("set payload = payload - 'social_card_capability'")).toBeLessThan(migration.indexOf('drop trigger if exists attach_annual_conference_ticket_social_card_capability'));
    expect(migration).toContain('drop trigger if exists attach_annual_conference_ticket_social_card_capability');
    expect(migration).toContain('create table public.annual_conference_social_card_email_outbox');
    expect(migration).toContain('capability text not null');
    expect(migration).not.toContain("jsonb_build_object('social_card_capability'");
  });

  it('serializes repeated and concurrent issuance, then supersedes queued retry capabilities before rotation', () => {
    expect(migration).toContain("status in ('issued', 'checked_in')");
    expect(migration).toContain("session.status = 'confirmed'");
    expect(migration).toContain("submission.status = 'selected'");
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain("p_subject_type::text || ':' || p_subject_id::text");
    expect(migration).toContain('for update;');
    expect(migration).toContain("where social_card_id = card.id and status in ('queued', 'failed', 'sending')");
    expect(migration).toContain('terminalizing the leased');
    expect(migration).toContain("last_error = 'Superseded by a newer social-card delivery.'");
    expect(migration).toContain('select btrim(attendee_name), lower(btrim(attendee_email)) into normalized_name, normalized_email');
    expect(migration).toContain('select btrim(session.speaker_name), lower(btrim(session.speaker_email)) into normalized_name, normalized_email');
    expect(migration).toContain('issue_annual_conference_social_card_delivery(uuid, public.annual_conference_social_card_subject, uuid)');
    expect(migration).toContain("encode(digest(capability, 'sha256'), 'hex')");
  });

  it('uses leased bounded retries and permanently removes raw capabilities after acceptance or exhaustion', () => {
    expect(migration).toContain('for update skip locked');
    expect(migration).toContain("claimed_until = now() + interval '10 minutes'");
    expect(migration).toContain("capability = case when p_status = 'accepted' then '' else capability end");
    expect(migration).toContain("p_status = 'accepted' and nullif(btrim(p_provider_email_id), '') is null");
    expect(migration).toContain("social_card_email_provider_id_required");
    expect(migration).toContain("where id = p_outbox_id and status = 'sending' and claim_token = p_claim_token");
    expect(migration).toContain("where attempt_count >= 5 and (");
    expect(migration).toContain("last_error = 'Social-card email retry limit reached.'");
    expect(migration).toContain("where attempt_count < 5 and (");
    expect(migration).toContain("and attempt_count < 5;");
  });

  it('keeps commands service-role-only', () => {
    expect(migration.match(/from public, anon, authenticated/g)).toHaveLength(4);
    expect(migration.match(/to service_role/g)).toHaveLength(5);
  });
});
