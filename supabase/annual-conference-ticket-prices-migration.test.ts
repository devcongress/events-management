import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migration = await readFile(
  new URL('./migrations/20261006160000_annual_conference_ticket_prices.sql', import.meta.url),
  'utf8',
);

describe('annual conference ticket prices migration', () => {
  it('keeps three edition-scoped integer prices and an atomic owner command', () => {
    expect(migration).toContain('add column regular_price_minor integer not null default 19999');
    expect(migration).toContain('add column team_3_price_minor integer not null default 54999');
    expect(migration).toContain('add column team_5_price_minor integer not null default 84999');
    expect(migration).toContain('create or replace function public.set_annual_conference_ticket_prices');
    expect(migration).toContain('for update;');
  });

  it('locks price changes once sales start or any historical order exists', () => {
    expect(migration).toContain("settings.sales_status <> 'draft'");
    expect(migration).toContain('from public.annual_conference_ticket_orders');
    expect(migration).toContain('ticket_prices_locked');
    expect(migration).toContain('grant execute on function public.set_annual_conference_ticket_prices(uuid, integer, integer, integer, text) to service_role;');
  });

  it('copies prices from the locked settings row into checkout orders', () => {
    expect(migration).toContain('order_amount_minor := settings.regular_price_minor');
    expect(migration).toContain('order_amount_minor := settings.team_3_price_minor');
    expect(migration).toContain('order_amount_minor := settings.team_5_price_minor');
  });
});
