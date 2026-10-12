import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationSource = readFileSync(
  new URL('./migrations/20261012160000_annual_conference_social_card_collections.sql', import.meta.url),
  'utf8',
);

describe('annual conference social-card collections migration', () => {
  it('provisions collection access only after a paid order transition', () => {
    expect(migrationSource).toContain("if new.status <> 'paid' or old.status = 'paid' then return new;");
    expect(migrationSource).toContain('after update of status on public.annual_conference_ticket_orders');
    expect(migrationSource).toContain("concat('annual-conference-social-card-collection:', new.id)");
    expect(migrationSource).not.toContain('devcon26_test_checkout_sessions');
    expect(migrationSource).not.toContain('update public.annual_conference_ticket_orders');
  });

  it('keeps collection and single-card email capabilities hash-only in storage', () => {
    expect(migrationSource).toContain("encode(digest(collection_capability, 'sha256'), 'hex')");
    expect(migrationSource).toContain('capability_hash text not null unique');
    expect(migrationSource).toContain('social_card_id is null and collection_order_id is not null');
  });

  it('returns only active seats for a paid order and provisions no QR changes', () => {
    expect(migrationSource).toContain("ticket_order.status = 'paid'");
    expect(migrationSource).toContain("ticket.status in ('issued', 'checked_in')");
    expect(migrationSource).toContain('order by ticket.order_seat_number');
    expect(migrationSource).not.toContain('qr_token');
    expect(migrationSource).not.toContain('check_in_annual_conference_bearer_ticket');
  });

  it('does not provision social cards for historical tickets later checked in', () => {
    expect(migrationSource).toContain('after insert on public.annual_conference_tickets');
    expect(migrationSource).not.toContain('after insert or update of status on public.annual_conference_tickets');
  });
});
