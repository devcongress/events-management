import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migration = await readFile(
  new URL('./migrations/20261007060000_ticket_email_capability_retention.sql', import.meta.url),
  'utf8',
);

describe('ticket-email capability retention correction', () => {
  it('uses a forward migration and removes raw QR capabilities only after provider acceptance', () => {
    expect(migration).toContain('create or replace function public.finalize_annual_conference_ticket_email_outbox');
    expect(migration).toContain("when p_status = 'accepted' and kind = 'ticket_delivery' then payload - 'qr_token'");
    expect(migration).toContain('else payload');
    expect(migration).toContain("status = 'sending' and claim_token = p_claim_token");
  });

  it('requires an actionable nonempty provider identifier for accepted sends', () => {
    expect(migration).toContain("p_status = 'accepted' and nullif(btrim(p_provider_email_id), '') is null");
    expect(migration).toContain("raise exception using message = 'ticket_email_provider_id_required'");
  });

  it('scrubs delivery updates and legacy accepted payloads while preserving pre-acceptance retry data', () => {
    expect(migration).toContain('create or replace function public.record_annual_conference_ticket_email_delivery');
    expect(migration).toContain("payload = case when kind = 'ticket_delivery' then payload - 'qr_token' else payload end");
    expect(migration).toContain("accepted_at is not null or status in ('accepted', 'delivered')");
    expect(migration).toContain("and payload ? 'qr_token'");
  });

  it('keeps corrected functions restricted to the service role', () => {
    expect(migration.match(/from public, anon, authenticated/g)).toHaveLength(2);
    expect(migration.match(/to service_role/g)).toHaveLength(2);
  });
});
