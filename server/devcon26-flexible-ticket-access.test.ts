import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as access from '@/lib/supabase/annual-conference-flexible-ticket-access';
import { consumePublicRateLimit } from '@/lib/public-rate-limit';
import app, { isUnauthenticatedApiRequest } from '@/server/app';
import { managedCheckoutSettings } from '@/server/managed-conference-checkout';
import {
  DEVCON26_FLEXIBLE_TICKET_ACCESS_PATH,
  isDevcon26FlexibleTicketAccessRequest,
} from '@/server/routes/devcon26-flexible-ticket-access';

vi.mock('@/lib/supabase/annual-conference-flexible-ticket-access', () => ({
  getFlexibleTicketOrder: vi.fn(),
  claimFlexibleTicket: vi.fn(),
  claimFlexibleTicketBadge: vi.fn(),
  rotateFlexibleTicketClaim: vi.fn(),
  reissueFlexibleGiftClaim: vi.fn(),
}));
vi.mock('@/lib/public-rate-limit', () => ({ consumePublicRateLimit: vi.fn() }));
vi.mock('@/server/managed-conference-checkout', async (original) => ({
  ...await original<Record<string, unknown>>(), managedCheckoutSettings: vi.fn(),
}));

const origin = 'https://preview.example.test';
const claimCapability = 'a'.repeat(64);
const orderCapability = 'b'.repeat(64);
const rotatedCapability = 'c'.repeat(64);
const allocationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const orderId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ticketId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const socialCardId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const deliveryId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function post(operation: string, body: unknown, requestOrigin = origin, contentType = 'application/json') {
  return app.request(`https://ems.example${DEVCON26_FLEXIBLE_TICKET_ACCESS_PATH}/${operation}`, {
    method: 'POST',
    headers: { Origin: requestOrigin, 'Content-Type': contentType, 'cf-connecting-ip': '203.0.113.10' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  for (const [key, value] of Object.entries({
    NODE_ENV: 'production',
    APP_DATA_SOURCE: 'local-json',
    DEVCON26_PUBLIC_CHECKOUT_ENABLED: 'true',
    DEVCON26_FLEXIBLE_CHECKOUT_ENABLED: 'true',
    DEVCON26_FLEXIBLE_TICKET_ACCESS_ENABLED: 'true',
    DEVCON26_PAYMENT_PROVIDER: 'paystack',
    DEVCON26_PAYMENTS_ENABLED: 'true',
    PAYSTACK_SECRET_KEY: 'sk_live_fixture',
    PUBLIC_WEBSITE_ORIGIN: 'https://devcongress.org',
    DEVCON26_PUBLIC_CHECKOUT_ORIGINS: origin,
  })) vi.stubEnv(key, value);

  vi.mocked(consumePublicRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(managedCheckoutSettings).mockResolvedValue(null);
  vi.mocked(access.getFlexibleTicketOrder).mockResolvedValue([{
    order_id: orderId,
    order_status: 'paid',
    allocation_id: allocationId,
    seat_index: 1,
    allocation_kind: 'gift',
    fulfillment_status: 'issued',
    ticket_id: ticketId,
    ticket_status: 'issued',
    claim_status: 'available',
    can_rotate_claim: false,
    can_request_refund: true,
  }]);
  vi.mocked(access.claimFlexibleTicket).mockResolvedValue({
    outcome: 'claimed', ticket_id: ticketId, order_seat_number: 1, delivery_queued: true,
  });
  vi.mocked(access.claimFlexibleTicketBadge).mockResolvedValue({
    outcome: 'claimed', ticket_id: ticketId, order_seat_number: 1,
    social_card_id: socialCardId, delivery_queued: true,
  });
  vi.mocked(access.rotateFlexibleTicketClaim).mockResolvedValue({
    outcome: 'rotated', claim_capability: rotatedCapability,
  });
  vi.mocked(access.reissueFlexibleGiftClaim).mockResolvedValue({
    outcome: 'queued', delivery_id: deliveryId,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('DevCon26 flexible ticket public access', () => {
  function managedInstallation(mode: 'test' | 'live' = 'test') {
    vi.stubEnv('DEVCON26_FLEXIBLE_TICKET_ACCESS_ENABLED', undefined);
    vi.stubEnv('DEVCON26_COMPLETE_TEST_ENABLED', undefined);
    vi.stubEnv('DEVCON26_PUBLIC_CHECKOUT_ENABLED', 'false');
    vi.stubEnv('DEVCON26_FLEXIBLE_CHECKOUT_ENABLED', 'false');
    vi.stubEnv('DEVCON26_PAYMENTS_ENABLED', 'false');
    vi.mocked(managedCheckoutSettings).mockResolvedValue({
      edition_id: orderId, payment_mode: mode, settings_version: 4,
      public_mode: 'paid', sales_status: 'closed', flexible_checkout_state: 'internal', regular_price_minor: 15000,
      flexible_checkout_max_amount_minor: 10000000, processing_fee_rate_basis_points: 195,
    });
  }

  it.each(['test', 'live'] as const)('allows canonical paid order and claim access while %s sales are paused and old flags are absent', async (mode) => {
    managedInstallation(mode);
    const canonical = 'https://devcongress.org';
    const order = await post('order', { capability: orderCapability }, canonical);
    const claim = await post('claim', { capability: claimCapability, name: 'Ada', email: 'ada@example.com' }, canonical);

    expect(order.status).toBe(200);
    expect(claim.status).toBe(200);
    expect(order.headers.get('access-control-allow-origin')).toBe(canonical);
    const preflight = await app.request(`https://ems.example${DEVCON26_FLEXIBLE_TICKET_ACCESS_PATH}/claim`, {
      method: 'OPTIONS', headers: { Origin: canonical, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Content-Type' },
    });

    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(canonical);
    expect(managedCheckoutSettings).toHaveBeenCalledWith(expect.anything(), 2026);
  });

  it('fails closed without managed schema while preserving the previous explicit legacy gate', async () => {
    managedInstallation();
    vi.mocked(managedCheckoutSettings).mockRejectedValue(new Error('function get_managed_conference_checkout_settings does not exist'));
    expect((await post('order', { capability: orderCapability })).status).toBe(503);
    vi.stubEnv('DEVCON26_FLEXIBLE_TICKET_ACCESS_ENABLED', 'true');
    expect((await post('order', { capability: orderCapability })).status).toBe(200);
  });

  it('does not bypass exact origins, invalid capabilities or database tester restrictions', async () => {
    managedInstallation();
    expect((await post('order', { capability: orderCapability }, 'https://attacker.example')).status).toBe(503);
    expect(managedCheckoutSettings).not.toHaveBeenCalled();
    vi.mocked(access.getFlexibleTicketOrder).mockResolvedValueOnce([]);
    expect((await post('order', { capability: orderCapability })).status).toBe(404);
    vi.mocked(access.claimFlexibleTicket).mockRejectedValueOnce(new Error('complete_test_recipient_not_allowed'));
    expect((await post('claim', { capability: claimCapability, name: 'Unapproved', email: 'unapproved@example.test' })).status).toBe(503);
  });

  it('keeps existing paid-ticket claims available after sales are paused', async () => {
    vi.stubEnv('DEVCON26_PUBLIC_CHECKOUT_ENABLED', 'false');
    vi.stubEnv('DEVCON26_FLEXIBLE_CHECKOUT_ENABLED', 'false');
    vi.stubEnv('DEVCON26_PAYMENTS_ENABLED', 'false');

    const response = await post('claim', { capability: claimCapability, name: 'Ada', email: 'ada@example.com' });

    expect(response.status).toBe(200);
    expect(access.claimFlexibleTicket).toHaveBeenCalled();
  });

  it('registers only the exact POST endpoints as unauthenticated and exposes no refund route', async () => {
    for (const operation of ['order', 'claim', 'badge', 'claims/rotate', 'gifts/reissue']) {
      const path = `${DEVCON26_FLEXIBLE_TICKET_ACCESS_PATH}/${operation}`;

      expect(isDevcon26FlexibleTicketAccessRequest(path, 'POST')).toBe(true);
      expect(isUnauthenticatedApiRequest(path, 'POST')).toBe(true);
      expect(isDevcon26FlexibleTicketAccessRequest(path, 'GET')).toBe(false);
    }

    expect(isDevcon26FlexibleTicketAccessRequest(`${DEVCON26_FLEXIBLE_TICKET_ACCESS_PATH}/refund`, 'POST')).toBe(false);
    expect(isDevcon26FlexibleTicketAccessRequest(`${DEVCON26_FLEXIBLE_TICKET_ACCESS_PATH}/order?capability=${orderCapability}`, 'POST')).toBe(false);
    expect((await post('refund', { order_capability: orderCapability })).status).toBe(401);
  });

  it('returns a sanitized order view without internal IDs or refund state', async () => {
    const response = await post('order', { capability: orderCapability });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      status: 'paid',
      allocations: [{
        allocation_id: allocationId,
        seat_number: 1,
        kind: 'gift',
        fulfillment_status: 'issued',
        ticket_status: 'issued',
        claim_status: 'available',
        can_rotate_claim: false,
      }],
    });
    expect(JSON.stringify(payload)).not.toMatch(new RegExp(`${orderId}|${ticketId}|can_request_refund|${orderCapability}`));
  });

  it('normalizes gift and shareable claim identity and omits ticket capabilities', async () => {
    const response = await post('claim', {
      capability: claimCapability,
      name: '  Ama Mensah  ',
      email: '  AMA@EXAMPLE.TEST  ',
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(access.claimFlexibleTicket).toHaveBeenCalledWith({
      capability: claimCapability, name: 'Ama Mensah', email: 'ama@example.test',
    }, expect.anything());
    expect(payload).toEqual({ status: 'claimed', seat_number: 1, delivery_queued: true });
    expect(JSON.stringify(payload)).not.toMatch(new RegExp(`${ticketId}|${claimCapability}`));
  });

  it('claims a buyer-managed badge while returning only the public social-card result', async () => {
    const response = await post('badge', {
      capability: claimCapability,
      name: 'Ama Mensah',
      email: 'ama@example.test',
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      status: 'claimed', seat_number: 1, social_card_id: socialCardId, delivery_queued: true,
    });
    expect(JSON.stringify(payload)).not.toMatch(new RegExp(`${ticketId}|${claimCapability}`));
  });

  it('rotates only the selected claim purpose and returns the replacement capability', async () => {
    const response = await post('claims/rotate', {
      order_capability: orderCapability,
      allocation_id: allocationId,
      purpose: 'badge',
    });

    expect(response.status).toBe(200);
    expect(access.rotateFlexibleTicketClaim).toHaveBeenCalledWith({
      orderCapability, allocationId, purpose: 'badge',
    }, expect.anything());
    expect(await response.json()).toEqual({ status: 'rotated', claim_capability: rotatedCapability });
  });

  it('reissues a pending gift without exposing its delivery record', async () => {
    const response = await post('gifts/reissue', {
      order_capability: orderCapability,
      allocation_id: allocationId,
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ status: 'queued' });
    expect(JSON.stringify(payload)).not.toContain(deliveryId);
    expect(consumePublicRateLimit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'devcon26-flexible-gift-reissue-capability', maxAttempts: 5, windowSeconds: 3_600,
    }));
  });

  it('applies client and capability limits without placing the capability in either rate key', async () => {
    vi.mocked(consumePublicRateLimit)
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 60 });

    const response = await post('order', { capability: orderCapability });
    const [clientInput, capabilityInput] = vi.mocked(consumePublicRateLimit).mock.calls.map((call) => call[1]);

    expect(response.status).toBe(429);
    expect(clientInput).toMatchObject({
      action: 'devcon26-flexible-ticket-access-client',
      clientKey: '203.0.113.10',
      maxAttempts: 60,
      windowSeconds: 300,
    });
    expect(capabilityInput).toMatchObject({
      action: 'devcon26-flexible-ticket-order-capability',
      clientKey: crypto.createHash('sha256').update(orderCapability).digest('hex'),
      maxAttempts: 30,
      windowSeconds: 300,
    });
    expect(JSON.stringify([clientInput, capabilityInput])).not.toContain(orderCapability);
    expect(access.getFlexibleTicketOrder).not.toHaveBeenCalled();
  });

  it('rejects unapproved origins, non-JSON requests, and extra fields before storage', async () => {
    expect((await post('order', { capability: orderCapability }, 'https://attacker.example')).status).toBe(503);
    expect((await post('order', JSON.stringify({ capability: orderCapability }), origin, 'text/plain')).status).toBe(415);
    expect((await post(`order?capability=${orderCapability}`, { capability: orderCapability })).status).toBe(404);
    expect((await post('order', { capability: orderCapability, debug: true })).status).toBe(404);
    expect(access.getFlexibleTicketOrder).not.toHaveBeenCalled();
  });

  it('keeps malformed, used, and wrong-state capabilities indistinguishable', async () => {
    const malformed = await post('claim', { capability: 'not-a-capability', name: 'Ama' });

    vi.mocked(access.claimFlexibleTicket).mockResolvedValueOnce({
      outcome: 'already_claimed', ticket_id: null, order_seat_number: null, delivery_queued: false,
    });
    const used = await post('claim', { capability: claimCapability, name: 'Ama' });

    vi.mocked(access.claimFlexibleTicket).mockResolvedValueOnce({
      outcome: 'wrong_allocation_kind', ticket_id: null, order_seat_number: null, delivery_queued: false,
    });
    const wrongState = await post('claim', { capability: claimCapability, name: 'Ama' });
    const malformedPayload = await malformed.json();
    const usedPayload = await used.json();
    const wrongStatePayload = await wrongState.json();

    expect([malformed.status, used.status, wrongState.status]).toEqual([404, 404, 404]);
    expect(malformedPayload).toEqual(usedPayload);
    expect(usedPayload).toEqual(wrongStatePayload);
  });

  it('turns storage failures into a neutral unavailable response', async () => {
    vi.mocked(access.getFlexibleTicketOrder).mockRejectedValue(new Error(`private ${orderCapability}`));

    const response = await post('order', { capability: orderCapability });
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(JSON.stringify(payload)).not.toContain(orderCapability);
    expect(payload).toEqual({ error: 'Ticket access is temporarily unavailable.' });
  });
});
