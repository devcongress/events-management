import { describe, expect, it, vi } from 'vitest';
import { getSupabaseAnnualConferenceTicketing } from './annual-conference-ticketing';

const database = vi.hoisted(() => ({ client: {} }));

vi.mock('@/lib/supabase/server', () => ({
  isSupabaseRuntimeEnabled: () => true,
  getSupabaseAdminClient: () => database.client,
}));

type Row = Record<string, string | number>;

function installFixture(liveOrders: Row[] = [], sponsorSeats = 0, confirmed = 0) {
  const orders: Row[] = [
    ...Array.from({ length: 5 }, () => ({ payment_mode: 'test', status: 'paid', quantity: 1 })),
    { payment_mode: 'test', status: 'pending_payment', quantity: 20, expires_at: '2099-01-01' },
    ...liveOrders,
  ];

  database.client = {
    from(table: string) {
      let rows = table === 'annual_conference_ticket_orders' ? [...orders] : [{ quantity: sponsorSeats }];
      const query = {
        select: () => query,
        eq(key: string, value: string) {
          if (key !== 'edition_id' && key !== 'year') rows = rows.filter((row) => row[key] === value);

          return query;
        },
        gt(key: string, value: string) {
          rows = rows.filter((row) => String(row[key]) > value);

          return query;
        },
        range: async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }),
        maybeSingle: async () => ({
          data: table === 'annual_conference_editions'
            ? { id: 'edition' }
            : { edition_id: 'edition', public_capacity: 900, sales_status: 'open', public_mode: 'paid', currency: 'GHS', regular_price_minor: 15000, team_3_price_minor: 45000, team_5_price_minor: 75000 },
          error: null,
        }),
      };

      return query;
    },
    rpc: async () => ({ data: { confirmed }, error: null }),
  };
}

describe('venue inventory excludes test orders', () => {
  it('keeps 900 available with five paid test tickets and a test hold', async () => {
    installFixture();
    const result = await getSupabaseAnnualConferenceTicketing(2026);

    expect(result?.inventory).toMatchObject({ public_capacity: 900, remaining_public_seats: 900, reduction_floor: 0 });
  });

  it('still reserves live paid/active holds, sponsors and confirmed registrations', async () => {
    installFixture([
      { payment_mode: 'live', status: 'paid', quantity: 3 },
      { payment_mode: 'live', status: 'pending_payment', quantity: 2, expires_at: '2099-01-01' },
      { payment_mode: 'live', status: 'pending_payment', quantity: 50, expires_at: '2000-01-01' },
    ], 4, 1);
    const result = await getSupabaseAnnualConferenceTicketing(2026);

    expect(result?.inventory).toMatchObject({ remaining_public_seats: 890, reduction_floor: 10 });
  });
});
