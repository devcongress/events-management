import crypto from 'node:crypto';

const GRANT_PURPOSE = 'devcon26-flexible-checkout-verification-v1';
const GRANT_TTL_SECONDS = 60 * 60 * 24;

type FlexibleCheckoutClaims = {
  order_id: string;
  verifier_hash: string;
  origin: string;
  expires_at: number;
};

function signingKey(secretKey: string): Buffer {
  return crypto.createHmac('sha256', secretKey).update(GRANT_PURPOSE).digest();
}

function signaturesMatch(provided: string, expected: Buffer): boolean {
  const decoded = Buffer.from(provided, 'base64url');

  return decoded.length === expected.length && crypto.timingSafeEqual(decoded, expected);
}

export function createDevcon26FlexibleCheckoutGrant(input: {
  orderId: string;
  verifier: string;
  origin: string;
  secretKey: string;
  now?: number;
}): string {
  const claims: FlexibleCheckoutClaims = {
    order_id: input.orderId,
    verifier_hash: crypto.createHash('sha256').update(input.verifier).digest('hex'),
    origin: input.origin,
    expires_at: Math.floor((input.now ?? Date.now()) / 1000) + GRANT_TTL_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = crypto.createHmac('sha256', signingKey(input.secretKey)).update(payload).digest('base64url');

  return `${payload}.${signature}`;
}

export function verifyDevcon26FlexibleCheckoutGrant(input: {
  grant: string;
  verifier: string;
  origin: string;
  secretKey: string;
  now?: number;
}): FlexibleCheckoutClaims | null {
  if (input.grant.length > 2_000) return null;
  const [payload, signature, extra] = input.grant.split('.');

  if (!payload || !signature || extra !== undefined) return null;
  const expected = crypto.createHmac('sha256', signingKey(input.secretKey)).update(payload).digest();

  if (!signaturesMatch(signature, expected)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Partial<FlexibleCheckoutClaims>;
    const now = Math.floor((input.now ?? Date.now()) / 1000);

    if (typeof claims.order_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(claims.order_id)
      || typeof claims.verifier_hash !== 'string' || !/^[0-9a-f]{64}$/.test(claims.verifier_hash)
      || claims.origin !== input.origin
      || !Number.isSafeInteger(claims.expires_at) || (claims.expires_at ?? 0) <= now
      || (claims.expires_at ?? 0) > now + GRANT_TTL_SECONDS + 60) return null;

    const verifierHash = crypto.createHash('sha256').update(input.verifier).digest();
    const claimHash = Buffer.from(claims.verifier_hash, 'hex');

    return claimHash.length === verifierHash.length && crypto.timingSafeEqual(claimHash, verifierHash)
      ? claims as FlexibleCheckoutClaims
      : null;
  } catch {
    return null;
  }
}
