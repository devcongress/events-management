import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ role: 'owner', send: vi.fn(), rpc: vi.fn(), pdf: vi.fn(), audit: vi.fn() }));

vi.mock('@/lib/supabase/admin-auth', () => ({
  requireAdmin: async (c: { json: (body: unknown, status: number) => Response }) => mocks.role === 'owner' ? null : c.json({ error: 'Forbidden' }, 403),
  getAdminSession: async () => ({ authenticated: true, role: mocks.role, email: 'owner@example.test', user_id: 'owner-id' }),
  assertAdminOrigin: () => null,
}));
vi.mock('@/server/annual-conference-request', () => ({ requireAnnualConferenceCapability: async () => null }));
vi.mock('@/lib/supabase/server', () => ({ isSupabaseRuntimeEnabled: () => true, getSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/lib/supabase/annual-conference-ticketing', () => ({ getSupabaseAnnualConferenceTicketing: async () => ({ settings: { edition_id: '10000000-0000-4000-8000-000000000001' } }) }));
vi.mock('@/server/protected-mutation', () => ({ recordProtectedMutationAudit: mocks.audit }));
vi.mock('@/server/http/public-intake-protection', () => ({ enforcePublicRateLimit: async () => null }));
vi.mock('@/lib/email/resend', () => ({ sendResendAttachedEmail: mocks.send }));
vi.mock('@/server/conference-ticket-pdf', () => ({ conferenceTicketPdf: mocks.pdf }));
vi.mock('@/server/env', () => ({ envValue: (key: string) => ({ RESEND_API_KEY: 'fixture', DEVCON26_ADMISSION_EMAIL_FROM: 'events@example.test', DEVCON26_ADMISSION_EMAIL_REPLY_TO: 'help@example.test' })[key] }));

import { registerAnnualConferenceComplimentaryRoutes } from './routes/annual-conference-complimentary';
import type { AppBindings } from './http/app-bindings';

const app = new Hono<AppBindings>();

registerAnnualConferenceComplimentaryRoutes(app);
const base = '/api/annual-conference/2026/ticketing/complimentary';
const guest = { name: 'Ama Example', email: 'ama@example.test' };
const request = (path: string, body: unknown) => app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => {
  mocks.role = 'owner';
  mocks.send.mockReset().mockResolvedValue('provider-fixture');
  mocks.rpc.mockReset();
  mocks.pdf.mockReset().mockResolvedValue(new Uint8Array([1, 2, 3]));
  mocks.audit.mockReset().mockResolvedValue(undefined);
});

describe('complimentary preview and test email', () => {
  it('previews every validated guest without mutating ticketing records', async () => {
    const result = await request(`${base}/preview`, { allocation_id: null, reason: 'Private reason', guests: [guest], idempotency_key: '10000000-0000-4000-8000-000000000002' });
    const content = await result.json() as { text: string };

    expect(result.status).toBe(200);
    expect(content.text).toContain('Ama Example');
    expect(content.text).not.toContain('Private reason');
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('sends a marked synthetic PDF to the entered address without ticket or inventory writes', async () => {
    const body = { guest, recipient: 'reviewer@example.test', request_id: '10000000-0000-4000-8000-000000000003' };
    const response = await request(`${base}/send-test`, body);

    expect(response.status).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.pdf).toHaveBeenCalledWith(expect.objectContaining({ isTest: true, token: 'TEST-ONLY-NOT-AN-ADMISSION-CAPABILITY' }));
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ email: expect.objectContaining({
      to: ['reviewer@example.test'], subject: expect.stringMatching(/^\[TEST\]/),
      attachments: [expect.objectContaining({ filename: 'devcon26-TEST-NOT-VALID.pdf' })],
      html: expect.stringContaining('#preview-only'),
    }) }));
  });

  it('rejects non-owners before preview, issuance, cancellation, and test sending', async () => {
    mocks.role = 'organizer';
    for (const [path, body] of [[`${base}/preview`, {}], [base, {}], [`${base}/send-test`, {}], [`${base}/10000000-0000-4000-8000-000000000004/cancel`, {}]] as const) {
      expect((await request(path, body)).status).toBe(403);
    }
    expect((await app.request(base)).status).toBe(403);
    expect((await app.request(`${base}/supporters`)).status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe('community supporters', () => {
  it('loads the owner-only read-only supporter page', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ order_id: 'source', total_count: 1 }], error: null });
    const response = await app.request(`${base}/supporters?offset=25`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ supporters: [{ order_id: 'source', total_count: 1 }], has_more: false });
    expect(mocks.rpc).toHaveBeenCalledWith('list_annual_conference_complimentary_supporters', expect.objectContaining({ p_offset: 25 }));
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('returns an actionable conflict for stale supporter eligibility', async () => {
    mocks.rpc.mockResolvedValue({ error: { message: 'complimentary_supporter_existing_admission' } });
    const response = await request(base, { allocation_id: null, reason: 'Thank you', guests: [{ ...guest, supporter_order_id: '10000000-0000-4000-8000-000000000005' }], idempotency_key: '10000000-0000-4000-8000-000000000002' });

    expect(response.status).toBe(409);
    expect((await response.json() as { error: string }).error).toContain('already has an admission');
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
