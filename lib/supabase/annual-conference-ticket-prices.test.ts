import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(() => true),
  settings: {
    currency: 'GHS',
    regular_price_minor: 15_000,
    team_3_price_minor: 45_000,
    team_5_price_minor: 75_000,
    public_mode: 'free',
    sales_status: 'closed',
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  isSupabaseRuntimeEnabled: mocks.enabled,
  getSupabaseAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === 'annual_conference_editions' ? { id: 'edition-2026' } : mocks.settings,
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

import { getSupabaseAnnualConferencePublicTicketPrices } from './annual-conference-ticketing';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled.mockReturnValue(true);
  Object.assign(mocks.settings, {
    currency: 'GHS', regular_price_minor: 15_000, team_3_price_minor: 45_000,
    team_5_price_minor: 75_000, public_mode: 'free', sales_status: 'closed',
  });
});

describe('DevCon26 ticket price visibility', () => {
  it('keeps the public price catalog closed while allowing the GH₵150 sandbox rehearsal', async () => {
    await expect(getSupabaseAnnualConferencePublicTicketPrices(2026)).resolves.toBeUndefined();
    await expect(getSupabaseAnnualConferencePublicTicketPrices(2026, undefined, 'sandbox')).resolves.toEqual({
      currency: 'GHS', tiers: [
        { tier_key: 'regular', quantity: 1, amount_minor: 15_000 },
        { tier_key: 'team_3', quantity: 3, amount_minor: 45_000 },
        { tier_key: 'team_5', quantity: 5, amount_minor: 75_000 },
      ],
    });
  });

  it('fails the sandbox catalog closed until the agreed GH₵150 price is configured', async () => {
    mocks.settings.regular_price_minor = 19_999;

    await expect(getSupabaseAnnualConferencePublicTicketPrices(2026, undefined, 'sandbox'))
      .resolves.toBeUndefined();
  });

  it('fails closed when a legacy sandbox team price differs from the per-seat amount', async () => {
    mocks.settings.team_3_price_minor = 44_999;

    await expect(getSupabaseAnnualConferencePublicTicketPrices(2026, undefined, 'sandbox'))
      .resolves.toBeUndefined();
  });

  it('opens the public price catalog only after the Owner opens paid sales', async () => {
    mocks.settings.public_mode = 'paid';
    mocks.settings.sales_status = 'open';

    await expect(getSupabaseAnnualConferencePublicTicketPrices(2026)).resolves.toEqual({
      currency: 'GHS', tiers: [{ tier_key: 'regular', quantity: 1, amount_minor: 15_000 }],
    });
  });
});
