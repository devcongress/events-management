export const ANNUAL_CONFERENCE_TICKET_CURRENCY = 'GHS' as const;

export type AnnualConferenceTicketTierKey = 'regular' | 'team_3' | 'team_5';

export const ANNUAL_CONFERENCE_CHECKOUT_HOLD_MINUTES = 15;

export interface AnnualConferenceTicketTier {
  key: AnnualConferenceTicketTierKey;
  label: string;
  quantity: number;
  price_minor: number;
  public: boolean;
}

export const DEVCON26_TICKET_TIERS: readonly AnnualConferenceTicketTier[] = [
  { key: 'regular', label: 'Regular pass', quantity: 1, price_minor: 19_999, public: true },
  { key: 'team_3', label: 'Team of 3', quantity: 3, price_minor: 54_999, public: true },
  { key: 'team_5', label: 'Team of 5', quantity: 5, price_minor: 84_999, public: true },
] as const;

export function ticketTierForKey(key: string): AnnualConferenceTicketTier | null {
  return DEVCON26_TICKET_TIERS.find((tier) => tier.key === key) ?? null;
}

export interface AnnualConferenceTicketingSettings {
  edition_id: string;
  public_capacity: number;
  ticket_sales_status: 'draft' | 'open' | 'closed';
  currency: typeof ANNUAL_CONFERENCE_TICKET_CURRENCY;
  ticket_tiers: AnnualConferenceTicketTier[];
  updated_at: string;
}

export interface AnnualConferenceTicketPrices {
  regular: number;
  team_3: number;
  team_5: number;
}

export interface AnnualConferenceTicketingInventory {
  public_capacity: number;
  paid_seats: number;
  sponsor_seats_held: number;
  checkout_seats_held: number;
  remaining_public_seats: number;
  reduction_floor: number;
}

export function defaultAnnualConferenceTicketingSettings(editionId: string, now = new Date().toISOString()): AnnualConferenceTicketingSettings {
  return {
    edition_id: editionId,
    public_capacity: 200,
    ticket_sales_status: 'draft',
    currency: ANNUAL_CONFERENCE_TICKET_CURRENCY,
    ticket_tiers: DEVCON26_TICKET_TIERS.map((tier) => ({ ...tier })),
    updated_at: now,
  };
}

export function ticketTiersForPrices(prices: AnnualConferenceTicketPrices): AnnualConferenceTicketTier[] {
  return DEVCON26_TICKET_TIERS.map((tier) => ({ ...tier, price_minor: prices[tier.key] }));
}

/**
 * Converts an organizer-entered GHS amount into pesewas without ever accepting
 * JavaScript floating point input. Currency values must have at most two decimals.
 */
export function parseGhsAmountToMinor(value: string): number | null {
  const normalized = value.trim();
  const match = /^(0|[1-9]\d{0,6})(?:\.(\d{1,2}))?$/.exec(normalized);

  if (!match) return null;

  const whole = Number(match[1]);
  const fractional = Number((match[2] ?? '').padEnd(2, '0'));
  const minor = whole * 100 + fractional;

  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

export function validateAnnualConferenceTicketPrices(prices: AnnualConferenceTicketPrices): string | null {
  if (!Object.values(prices).every((price) => Number.isSafeInteger(price) && price > 0 && price <= 100_000_000)) {
    return 'Enter a whole GHS amount or up to two decimal places for every pass.';
  }

  if (prices.team_3 > prices.regular * 3 || prices.team_5 > prices.regular * 5) {
    return 'Team passes cannot cost more than the equivalent regular passes.';
  }

  return null;
}

export function tierSavings(tier: AnnualConferenceTicketTier, regularTier: AnnualConferenceTicketTier): number {
  return Math.max(0, regularTier.price_minor * tier.quantity - tier.price_minor);
}

export function formatTicketMoney(amountMinor: number, currency = ANNUAL_CONFERENCE_TICKET_CURRENCY): string {
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export function summarizeAnnualConferenceTicketingInventory(input: {
  settings: Pick<AnnualConferenceTicketingSettings, 'public_capacity'>;
  paidSeats: number;
  sponsorSeatsHeld: number;
  checkoutSeatsHeld?: number;
}): AnnualConferenceTicketingInventory {
  const paidSeats = Math.max(0, input.paidSeats);
  const sponsorSeatsHeld = Math.max(0, input.sponsorSeatsHeld);
  const checkoutSeatsHeld = Math.max(0, input.checkoutSeatsHeld ?? 0);
  const reductionFloor = paidSeats + sponsorSeatsHeld + checkoutSeatsHeld;

  return {
    public_capacity: input.settings.public_capacity,
    paid_seats: paidSeats,
    sponsor_seats_held: sponsorSeatsHeld,
    checkout_seats_held: checkoutSeatsHeld,
    remaining_public_seats: Math.max(0, input.settings.public_capacity - reductionFloor),
    reduction_floor: reductionFloor,
  };
}

export function validateAnnualConferenceCapacity(nextCapacity: number, inventory: Pick<AnnualConferenceTicketingInventory, 'reduction_floor'>): string | null {
  if (!Number.isInteger(nextCapacity) || nextCapacity < 1) return 'Capacity must be a whole number of at least 1.';
  if (nextCapacity < inventory.reduction_floor) {
    return `Capacity cannot be lower than the ${inventory.reduction_floor} issued, held, or sponsor-reserved seats.`;
  }

  return null;
}
