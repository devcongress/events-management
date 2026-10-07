import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migration = await readFile(
  new URL('./migrations/20261006150000_annual_conference_ticket_assignment_delivery.sql', import.meta.url),
  'utf8',
);

describe('annual conference ticket assignment and delivery migration', () => {
  it('assigns each paid-order ticket only once and hashes its QR capability', () => {
    expect(migration).toContain('create or replace function public.assign_annual_conference_ticket_attendee');
    expect(migration).toContain("raise exception using message = 'ticket_non_transferable'");
    expect(migration).toContain("qr_token := encode(gen_random_bytes(32), 'hex')");
    expect(migration).toContain("encode(digest(qr_token, 'sha256'), 'hex')");
    expect(migration).toContain("'ticket_delivery'");
  });

  it('claims and finalizes transactional delivery under a bounded lease', () => {
    expect(migration).toContain('for update skip locked');
    expect(migration).toContain("now() + interval '10 minutes'");
    expect(migration).toContain('finalize_annual_conference_ticket_email_outbox');
    expect(migration).toContain("p_status not in ('accepted', 'failed')");
    expect(migration).toContain('record_annual_conference_ticket_email_delivery');
  });
});
