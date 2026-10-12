import { describe, expect, it } from 'vitest';
import {
  createAnnualConferenceSocialCardBuyerGrant,
  verifyAnnualConferenceSocialCardBuyerGrant,
} from './annual-conference-social-card-buyer-grant';

const orderId = 'f10ea146-0bdc-4440-8ca9-e76f5cf8a082';
const verifier = 'V'.repeat(43);
const secretKey = 'sk_live_test-secret';
const origin = 'https://devcongress.org';
const now = Date.parse('2026-10-12T12:00:00Z');

function grantFor(overrides: Partial<{ orderId: string; verifier: string; origin: string; secretKey: string }> = {}): string {
  return createAnnualConferenceSocialCardBuyerGrant({
    orderId: overrides.orderId ?? orderId,
    verifier: overrides.verifier ?? verifier,
    origin: overrides.origin ?? origin,
    secretKey: overrides.secretKey ?? secretKey,
    now,
  });
}

describe('DevCon26 buyer social-card grants', () => {
  it('binds a short-lived grant to the order, original browser verifier, and exact site origin', () => {
    const grant = grantFor();

    expect(verifyAnnualConferenceSocialCardBuyerGrant({ grant, verifier, origin, secretKey, now })).toMatchObject({ order_id: orderId, origin });
  });

  it('rejects a different verifier, origin, or signing key', () => {
    const grant = grantFor();

    expect(verifyAnnualConferenceSocialCardBuyerGrant({ grant, verifier: 'X'.repeat(43), origin, secretKey, now })).toBeNull();
    expect(verifyAnnualConferenceSocialCardBuyerGrant({ grant, verifier, origin: 'https://attacker.example', secretKey, now })).toBeNull();
    expect(verifyAnnualConferenceSocialCardBuyerGrant({ grant, verifier, origin, secretKey: 'sk_live_other', now })).toBeNull();
  });

  it('rejects tampered and expired grants', () => {
    const grant = grantFor();

    expect(verifyAnnualConferenceSocialCardBuyerGrant({ grant: `${grant}x`, verifier, origin, secretKey, now })).toBeNull();
    expect(verifyAnnualConferenceSocialCardBuyerGrant({ grant, verifier, origin, secretKey, now: now + (24 * 60 * 60 * 1000) })).toBeNull();
  });
});
