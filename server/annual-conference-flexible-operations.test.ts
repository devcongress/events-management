import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '@/server/app';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/supabase/admin-auth';
import { getSupabaseAnnualConferenceTicketing } from '@/lib/supabase/annual-conference-ticketing';

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
vi.mock('@/server/protected-mutation', () => ({ recordProtectedMutationAudit: vi.fn(async () => undefined) }));

const base = '/api/annual-conference/2026/ticketing/flexible/community-pool';
const editionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const allocationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const orderId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ticketId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const idempotencyKey = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const rpc = vi.fn();
const range = vi.fn();
const orderQuery = { select: vi.fn(), eq: vi.fn(), filter: vi.fn(), order: vi.fn(), range };
const from = vi.fn(() => orderQuery);

beforeEach(() => {
  vi.clearAllMocks();
  orderQuery.select.mockReturnValue(orderQuery);
  orderQuery.eq.mockReturnValue(orderQuery);
  orderQuery.filter.mockReturnValue(orderQuery);
  orderQuery.order.mockReturnValue(orderQuery);
  vi.mocked(requireAdmin).mockResolvedValue(null);
  vi.mocked(getSupabaseAdminClient).mockReturnValue({ rpc, from } as never);
  vi.mocked(getSupabaseAnnualConferenceTicketing).mockResolvedValue({
    settings: { edition_id: editionId },
  } as never);
});

describe('Owner community ticket assignment', () => {
  it('shows only pending pool identifiers to an Owner', async () => {
    rpc.mockResolvedValue({ error: null, data: [{
      allocation_id: allocationId, order_id: orderId, seat_index: 1,
      ticket_id: ticketId, ticket_status: 'pending',
    }] });

    const response = await app.request(`https://ems.example${base}?offset=0`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tickets: [{
      allocation_id: allocationId, order_id: orderId, seat_index: 1,
      ticket_id: ticketId, ticket_status: 'pending',
    }], next_offset: null });
    expect(rpc).toHaveBeenCalledWith('list_annual_conference_community_managed_ticket_pool', {
      p_edition_id: editionId, p_offset: 0,
    });
  });

  it('uses the authenticated Owner identity for one idempotent assignment', async () => {
    rpc.mockResolvedValue({ error: null, data: [{
      outcome: 'assigned', ticket_id: ticketId, order_seat_number: 1, delivery_queued: true,
    }] });

    const response = await app.request(`https://ems.example${base}/assign`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        allocation_id: allocationId, attendee_name: 'Ada Lovelace',
        attendee_email: 'Ada@Example.com', idempotency_key: idempotencyKey,
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ assigned: true, delivery_queued: true });
    expect(rpc).toHaveBeenCalledWith('assign_annual_conference_community_managed_ticket', expect.objectContaining({
      p_edition_id: editionId, p_allocation_id: allocationId, p_email: 'ada@example.com',
      p_actor_email: 'owner@example.com', p_idempotency_key: idempotencyKey,
    }));
  });

  it('blocks unauthorized users before reading ticket data or assigning seats', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(new Response('Forbidden', { status: 403 }));

    const response = await app.request(`https://ems.example${base}`);

    expect(response.status).toBe(403);
    expect(getSupabaseAnnualConferenceTicketing).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('Grouped community purchases', () => {
  const purchase = {
    id: orderId, purchaser_name: 'Supporter', purchaser_email: 'supporter@example.test',
    payment_mode: 'test', created_at: '2026-10-25T12:00:00Z',
    allocations: [{ id: allocationId, seat_index: 1 }],
    tickets: [{ id: ticketId, order_seat_number: 1, status: 'issued', attendee_name: 'Recipient', attendee_email: 'recipient@example.test' }],
  };

  it('returns completed purchases and supporter details with parent-order pagination', async () => {
    range.mockResolvedValue({ data: Array.from({ length: 26 }, () => purchase), error: null });
    const response = await app.request(`https://ems.example${base}/purchases?mode=test&offset=25`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(body.purchases).toHaveLength(25);
    expect(body.next_offset).toBe(50);
    expect(body.purchases[0]).toMatchObject({ supporter_name: 'Supporter', assigned: 1, available: 0, total: 1 });
    expect(orderQuery.eq).toHaveBeenCalledWith('edition_id', editionId);
    expect(orderQuery.eq).toHaveBeenCalledWith('status', 'paid');
    expect(orderQuery.eq).toHaveBeenCalledWith('allocations.allocation_kind', 'community_managed');
    expect(range).toHaveBeenCalledWith(25, 50);
    expect(orderQuery.filter).toHaveBeenCalledWith('payment_mode', 'eq', 'test');
    expect(orderQuery.filter).toHaveBeenCalledWith('checkout_flow', 'eq', 'flexible');
    expect(orderQuery.select.mock.calls[0][0]).not.toMatch(/qr_token|payload|capability/);
    // PostgreSQL truncates the declared 64-character FK name; infer the sole order relationship.
    expect(orderQuery.select.mock.calls[0][0]).toContain('allocations:annual_conference_flexible_ticket_allocations!inner(');
    expect(orderQuery.select.mock.calls[0][0]).not.toContain('allocations_order_edition_fkey');
  });

  it('does not read supporter or recipient details for unauthorized users', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(new Response('Forbidden', { status: 403 }));
    const response = await app.request(`https://ems.example${base}/purchases`);

    expect(response.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects invalid pagination before reading storage', async () => {
    const response = await app.request(`https://ems.example${base}/purchases?offset=-1`);

    expect(response.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it('reports incomplete storage data as unavailable instead of showing incorrect progress', async () => {
    range.mockResolvedValue({ data: [{ ...purchase, payment_mode: 'live', tickets: [] }], error: null });
    const response = await app.request(`https://ems.example${base}/purchases`);

    expect(response.status).toBe(503);
  });
});
