import crypto from 'node:crypto';

const GRANT_TTL_SECONDS = 60 * 60 * 24;
const GRANT_PURPOSE = 'devcon26-social-card-buyer-grant-v1';

type BuyerGrantClaims = {
  order_id: string;
  verifier_hash: string;
  origin: string;
  expires_at: number;
  seat_numbers?: number[];
};

function signingKey(secretKey: string): Buffer {
  return crypto.createHmac('sha256', secretKey).update(GRANT_PURPOSE).digest();
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function equalSignature(provided: string, expected: Buffer): boolean {
  const value = Buffer.from(provided, 'base64url');

  return value.length === expected.length && crypto.timingSafeEqual(value, expected);
}

export function createAnnualConferenceSocialCardBuyerGrant(input: {
  orderId: string;
  verifier: string;
  origin: string;
  secretKey: string;
  now?: number;
  seatNumbers?: number[];
  lifetimeSeconds?: number;
}): string {
  const claims: BuyerGrantClaims = {
    ...(input.seatNumbers ? { seat_numbers: input.seatNumbers } : {}),
    order_id: input.orderId,
    verifier_hash: crypto.createHash('sha256').update(input.verifier).digest('hex'),
    origin: input.origin,
    expires_at: Math.floor((input.now ?? Date.now()) / 1000) + (input.seatNumbers?.length === 1 ? Math.min(30 * 24 * 60 * 60, Math.max(60, input.lifetimeSeconds ?? GRANT_TTL_SECONDS)) : GRANT_TTL_SECONDS),
  };
  const payload = encode(claims);
  const signature = crypto.createHmac('sha256', signingKey(input.secretKey)).update(payload).digest('base64url');

  return `${payload}.${signature}`;
}

export function verifyAnnualConferenceSocialCardBuyerGrant(input: {
  grant: string;
  verifier?: string;
  origin: string;
  secretKey: string;
  now?: number;
}): BuyerGrantClaims | null {
  if (input.grant.length > 2_000) return null;
  const [payload, signature, extra] = input.grant.split('.');

  if (!payload || !signature || extra !== undefined) return null;
  const expected = crypto.createHmac('sha256', signingKey(input.secretKey)).update(payload).digest();

  if (!equalSignature(signature, expected)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Partial<BuyerGrantClaims>;
    const now = Math.floor((input.now ?? Date.now()) / 1000);

    if (typeof claims.order_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(claims.order_id)
      || typeof claims.verifier_hash !== 'string' || !/^[0-9a-f]{64}$/.test(claims.verifier_hash)
      || typeof claims.origin !== 'string' || claims.origin !== input.origin
      || !Number.isSafeInteger(claims.expires_at) || (claims.expires_at ?? 0) <= now
      || (claims.expires_at ?? 0) > now + (claims.seat_numbers?.length === 1 ? 30 * 24 * 60 * 60 : GRANT_TTL_SECONDS) + 60) return null;

    if (claims.seat_numbers !== undefined && (!Array.isArray(claims.seat_numbers)
      || claims.seat_numbers.length !== 1
      || !claims.seat_numbers.every((seat) => Number.isSafeInteger(seat) && seat > 0))) return null;

    if (input.verifier) {
      const verifierHash = crypto.createHash('sha256').update(input.verifier).digest();
      const claimHash = Buffer.from(claims.verifier_hash, 'hex');

      if (claimHash.length !== verifierHash.length || !crypto.timingSafeEqual(claimHash, verifierHash)) return null;
    }

    return claims as BuyerGrantClaims;
  } catch {
    return null;
  }
}
