import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  send: vi.fn(),
  limit: vi.fn(),
}));

vi.mock('@/lib/supabase/admin-auth', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/supabase/admin-auth')>(),
  requireAdmin: vi.fn(async () => null),
  getAdminSession: mocks.session,
  assertAdminOrigin: vi.fn(() => null),
}));
vi.mock('@/lib/public-rate-limit', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/public-rate-limit')>(),
  consumePublicRateLimit: mocks.limit,
}));
vi.mock('@/lib/email/resend', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/email/resend')>(),
  sendResendEmailBatch: mocks.send,
}));

import app from './app';

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 'fixture');
  mocks.session.mockReset().mockResolvedValue({ authenticated: true, role: 'owner', email: 'owner@example.test', user_id: 'owner-id' });
  mocks.limit.mockReset().mockResolvedValue({ allowed: true });
  mocks.send.mockReset().mockResolvedValue({ ids: ['fixture'], quota: {} });
});

describe('email preview test sending', () => {
  it('uses the authenticated owner address and server-rendered template', async () => {
    const response = await app.request('/api/admin/email-previews/registration_confirmed/send-test', { method: 'POST' });

    expect(response.status).toBe(200);
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.send.mock.calls[0][0].emails[0]).toMatchObject({ to: ['owner@example.test'], subject: expect.stringMatching(/^\[Test\]/), html: expect.any(String), text: expect.any(String) });
  });

  it('rejects non-owners, missing emails, unknown templates and rate-limited requests', async () => {
    mocks.session.mockResolvedValueOnce({ authenticated: true, role: 'organizer', email: 'organizer@example.test' });
    expect((await app.request('/api/admin/email-previews/registration_confirmed/send-test', { method: 'POST' })).status).toBe(403);
    mocks.session.mockResolvedValueOnce({ authenticated: true, role: 'owner', email: null });
    expect((await app.request('/api/admin/email-previews/registration_confirmed/send-test', { method: 'POST' })).status).toBe(403);
    expect((await app.request('/api/admin/email-previews/missing/send-test', { method: 'POST' })).status).toBe(404);
    mocks.limit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 30 });
    expect((await app.request('/api/admin/email-previews/registration_confirmed/send-test', { method: 'POST' })).status).toBe(429);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
