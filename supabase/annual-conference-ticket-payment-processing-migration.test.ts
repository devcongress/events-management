import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migration = await readFile(
  new URL('./migrations/20261006140000_annual_conference_ticket_payment_processing.sql', import.meta.url),
  'utf8',
);

describe('annual conference ticket payment processing migration', () => {
  it('keeps provider events and transactional email delivery durable and idempotent', () => {
    expect(migration).toContain('annual_conference_ticket_payment_events');
    expect(migration).toContain('annual_conference_ticket_payment_events_provider_event_unique unique (provider, provider_event_id)');
    expect(migration).toContain('annual_conference_ticket_payment_attempts');
    expect(migration).toContain('payload_sha256 text not null');
    expect(migration).toContain('annual_conference_ticket_email_outbox');
    expect(migration).toContain('idempotency_key text not null unique');
    expect(migration).toContain("kind in ('payment_receipt', 'ticket_delivery')");
  });

  it('makes verified payment confirmation atomically issue seats and queue one receipt', () => {
    expect(migration).toContain('create or replace function public.confirm_annual_conference_ticket_payment');
    expect(migration).toContain('for update;');
    expect(migration).toContain("status = 'paid'");
    expect(migration).toContain('for ticket_index in 1..ticket_order.quantity loop');
    expect(migration).toContain('order_seat_number');
    expect(migration).toContain("'ticket_delivery'");
    expect(migration).toContain("encode(digest(qr_token, 'sha256'), 'hex')");
    expect(migration).toContain('annual_conference_ticket_refunds');
    expect(migration).toContain("status text not null default 'required'");
    expect(migration).toContain("set status = 'expired', provider = trim(p_provider)");
    expect(migration).toContain("set status = 'rejected', rejection_reason = 'ticket_payment_amount_mismatch'");
    expect(migration).toContain("set status = 'rejected', rejection_reason = 'ticket_payment_replay_mismatch'");
    expect(migration).toContain("'payment_receipt'");
    expect(migration).toContain("concat('annual-conference-ticket-receipt:', ticket_order.id)");
    expect(migration).toContain('ticket_payment_amount_mismatch');
  });

  it('keeps state-changing payment commands service-role only', () => {
    expect(migration).toContain('revoke all on function public.confirm_annual_conference_ticket_payment(uuid, text, text, text, text, integer, text, text, jsonb) from public, anon, authenticated;');
    expect(migration).toContain('grant execute on function public.confirm_annual_conference_ticket_payment(uuid, text, text, text, text, integer, text, text, jsonb) to service_role;');
  });
});
