import { describe, expect, it } from 'vitest';
import {
  DEVCON26_TICKET_TIERS,
  defaultAnnualConferenceTicketingSettings,
  summarizeAnnualConferenceTicketingInventory,
  ticketTierForKey,
  tierSavings,
  validateAnnualConferenceCapacity,
  parseGhsAmountToMinor,
  validateAnnualConferenceTicketPrices,
} from '@/lib/annual-conference-ticketing';

describe('annual conference ticketing policy', () => {
  it('starts with DevCon26 prices in pesewas and discounts group packs', () => {
    const [regular, team3, team5] = DEVCON26_TICKET_TIERS;

    expect(regular.price_minor).toBe(19_999);
    expect(team3.price_minor).toBe(54_999);
    expect(team5.price_minor).toBe(84_999);
    expect(tierSavings(team3, regular)).toBe(4_998);
    expect(tierSavings(team5, regular)).toBe(14_996);
  });

  it('parses editable GHS amounts exactly, without floating point input', () => {
    expect(parseGhsAmountToMinor('199.99')).toBe(19_999);
    expect(parseGhsAmountToMinor('549')).toBe(54_900);
    expect(parseGhsAmountToMinor('0.001')).toBeNull();
    expect(parseGhsAmountToMinor('199.999999999')).toBeNull();
    expect(parseGhsAmountToMinor('1e2')).toBeNull();
    expect(validateAnnualConferenceTicketPrices({ regular: 19_999, team_3: 54_999, team_5: 84_999 })).toBeNull();
    expect(validateAnnualConferenceTicketPrices({ regular: 10_000, team_3: 30_001, team_5: 50_000 })).toContain('Team passes');
  });

  it('starts safely at a 200-seat public capacity and never allows a lower reduction floor', () => {
    const settings = defaultAnnualConferenceTicketingSettings('edition-2026');
    const inventory = summarizeAnnualConferenceTicketingInventory({
      settings,
      paidSeats: 23,
      sponsorSeatsHeld: 15,
      checkoutSeatsHeld: 2,
    });

    expect(inventory).toMatchObject({
      public_capacity: 200,
      remaining_public_seats: 160,
      reduction_floor: 40,
    });
    expect(validateAnnualConferenceCapacity(39, inventory)).toContain('40');
    expect(validateAnnualConferenceCapacity(500, inventory)).toBeNull();
  });

  it('only resolves published tier keys and never trusts a client price or quantity', () => {
    expect(ticketTierForKey('regular')).toMatchObject({ quantity: 1, price_minor: 19_999 });
    expect(ticketTierForKey('team_3')).toMatchObject({ quantity: 3, price_minor: 54_999 });
    expect(ticketTierForKey('team_5')).toMatchObject({ quantity: 5, price_minor: 84_999 });
    expect(ticketTierForKey('free')).toBeNull();
  });
});
