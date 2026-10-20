import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '@/server/app';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/supabase/admin-auth';
import { getSupabaseAnnualConferenceTicketing } from '@/lib/supabase/annual-conference-ticketing';
import { inspectPaystackLiveRefund } from '@/lib/annual-conference-paystack-refunds';

vi.mock('@/lib/supabase/admin-auth', () => ({
  requireAdmin: vi.fn(),
  getAdminSession: vi.fn(async () => ({ authenticated: true, role: 'owner', email: 'owner@example.com' })),
}));
vi.mock('@/server/annual-conference-request', () => ({
  requireAnnualConferenceCapability: vi.fn(async () => null),
}));
vi.mock('@/lib/supabase/server', () => ({
  isSupabaseRuntimeEnabled: vi.fn(() => true),
  getSupabaseAdminClient: vi.fn(),
}));
vi.mock('@/lib/supabase/annual-conference-ticketing', () => ({
  getSupabaseAnnualConferenceTicketing: vi.fn(),
}));
vi.mock('@/server/env', () => ({
  envValue: vi.fn((key: string) => ({
    DEVCON26_PAYMENT_PROVIDER: 'paystack',
    PAYSTACK_SECRET_KEY: 'sk_live_test-only',
  })[key as 'DEVCON26_PAYMENT_PROVIDER' | 'PAYSTACK_SECRET_KEY']),
}));
vi.mock('@/lib/annual-conference-paystack-refunds', () => ({ inspectPaystackLiveRefund: vi.fn() }));
vi.mock('@/server/protected-mutation', () => ({ recordProtectedMutationAudit: vi.fn(async () => undefined) }));

const base = '/api/annual-conference/2026/ticketing/flexible/refunds';
const editionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const allocationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const orderId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const refundId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ticketId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const rpc = vi.fn();
const payment = {
  refund_id: refundId,
  refund_status: 'requested',
  order_id: orderId,
  allocation_id: allocationId,
  amount_minor: 15_000,
  currency: 'GHS',
  provider: 'paystack',
  payment_reference: 'devcon26_order1',
  provider_transaction_id: '7381',
};

function post(path: string, body: unknown) {
  return app.request(`https://ems.example${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue(null);
  vi.mocked(getSupabaseAdminClient).mockReturnValue({ rpc } as never);
  vi.mocked(getSupabaseAnnualConferenceTicketing).mockResolvedValue({
    settings: { edition_id: editionId },
  } as never);
});

describe('Owner flexible refund reconciliation', () => {
  it('suspends one allocation through the edition-scoped service RPC', async () => {
    rpc.mockResolvedValue({ error: null, data: [{ outcome: 'requested', refund_id: refundId, amount_minor: 15_000 }] });

    const response = await post('/request', { allocation_id: allocationId });

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('request_annual_conference_flexible_ticket_refund', {
      p_edition_id: editionId,
      p_allocation_id: allocationId,
    });
  });

  it('blocks non-Owners before loading refund data', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(new Response('Forbidden', { status: 403 }));

    const response = await post('/request', { allocation_id: allocationId });

    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('finalizes only a provider-verified processed refund', async () => {
    rpc.mockResolvedValueOnce({ error: null, data: [payment] })
      .mockResolvedValueOnce({ error: null, data: [{ outcome: 'bound' }] })
      .mockResolvedValueOnce({
      error: null, data: [{ outcome: 'refunded', ticket_id: ticketId, order_status: 'paid' }],
      });
    vi.mocked(inspectPaystackLiveRefund).mockResolvedValue({
      status: 'processed', refundId: '8342', payloadSha256: 'a'.repeat(64),
    });

    const response = await post(`/${refundId}/reconcile`, { provider_refund_id: '8342' });

    expect(response.status).toBe(200);
    expect(inspectPaystackLiveRefund).toHaveBeenCalledWith(expect.objectContaining({
      refundId: '8342', paymentReference: payment.payment_reference, providerTransactionId: '7381',
    }));
    expect(rpc).toHaveBeenCalledWith('finalize_annual_conference_flexible_ticket_refund', expect.objectContaining({
      p_edition_id: editionId, p_refund_id: refundId, p_provider_refund_reference: '8342',
      p_provider_refund_id: '8342', p_refunded_amount_minor: 15_000,
    }));
    expect(rpc).toHaveBeenCalledWith('bind_annual_conference_flexible_ticket_refund_provider_id', {
      p_edition_id: editionId, p_refund_id: refundId, p_provider_refund_id: '8342',
    });
  });

  it('restores admission after a verified provider failure', async () => {
    rpc.mockResolvedValueOnce({ error: null, data: [payment] })
      .mockResolvedValueOnce({ error: null, data: [{ outcome: 'bound' }] })
      .mockResolvedValueOnce({
      error: null, data: [{ outcome: 'rejected', ticket_id: ticketId, delivery_queued: true }],
      });
    vi.mocked(inspectPaystackLiveRefund).mockResolvedValue({
      status: 'failed', refundId: '8342', payloadSha256: 'b'.repeat(64),
    });

    const response = await post(`/${refundId}/reconcile`, { provider_refund_id: '8342' });

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('reject_annual_conference_flexible_ticket_refund', expect.objectContaining({
      p_edition_id: editionId, p_refund_id: refundId,
      p_provider_refund_id: '8342', p_provider_payload_sha256: 'b'.repeat(64),
    }));
  });

  it('keeps admission suspended for an in-progress refund', async () => {
    rpc.mockResolvedValueOnce({ error: null, data: [payment] })
      .mockResolvedValueOnce({ error: null, data: [{ outcome: 'bound' }] });
    vi.mocked(inspectPaystackLiveRefund).mockResolvedValue({ status: 'pending' });

    const response = await post(`/${refundId}/reconcile`, { provider_refund_id: '8342' });

    expect(response.status).toBe(409);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('rejects a refund ID already bound to another seat', async () => {
    rpc.mockResolvedValueOnce({ error: null, data: [payment] })
      .mockResolvedValueOnce({ error: null, data: [{ outcome: 'invalid' }] });
    vi.mocked(inspectPaystackLiveRefund).mockResolvedValue({
      status: 'processed', refundId: '8342', payloadSha256: 'a'.repeat(64),
    });

    const response = await post(`/${refundId}/reconcile`, { provider_refund_id: '8342' });

    expect(response.status).toBe(409);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
