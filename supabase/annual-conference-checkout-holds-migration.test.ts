import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migration = await readFile(
  new URL('./migrations/20261006130000_annual_conference_checkout_holds.sql', import.meta.url),
  'utf8',
);

describe('annual conference checkout holds migration', () => {
  it('creates one retry-safe, expiring hold with server-owned pricing', () => {
    expect(migration).toContain('checkout_request_key uuid');
    expect(migration).toContain('annual_conference_ticket_orders_edition_checkout_request_key_idx');
    expect(migration).toContain('create or replace function public.create_annual_conference_checkout_hold');
    expect(migration).toContain("now() + interval '15 minutes'");
    expect(migration).toContain("when 'regular' then");
    expect(migration).toContain('checkout_request_key_required');
    expect(migration).toContain('checkout_request_conflict');
  });

  it('serializes capacity and includes active holds in every reservation path', () => {
    expect(migration).toContain('for update;');
    expect(migration).toContain("status = 'pending_payment'");
    expect(migration).toContain('and expires_at > now();');
    expect(migration).toContain('paid_seats + sponsor_seats + active_hold_seats + order_quantity > settings.public_capacity');
    expect(migration).toContain('paid_seats + sponsor_seats + active_hold_seats + p_quantity > settings.public_capacity');
    expect(migration).toContain('create or replace function public.set_annual_conference_ticketing_capacity');
    expect(migration).toContain('ticketing_capacity_below_reservations');
  });

  it('keeps privileged reservation commands unavailable to public database roles', () => {
    expect(migration).toContain('revoke all on function public.create_annual_conference_checkout_hold(uuid, text, text, text, uuid) from public, anon, authenticated;');
    expect(migration).toContain('grant execute on function public.create_annual_conference_checkout_hold(uuid, text, text, text, uuid) to service_role;');
    expect(migration).toContain('revoke all on function public.set_annual_conference_ticketing_capacity(uuid, integer, text) from public, anon, authenticated;');
  });
});
