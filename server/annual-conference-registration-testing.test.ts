import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { allowConferenceEmail, localRegistrationRequest, registrationTestingSchema } from './annual-conference-registration-testing';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));

beforeEach(() => mocks.rpc.mockReset());

describe('registration testing security boundaries', () => {
  it('normalizes addresses and rejects wildcards and invalid settings', () => {
    expect(registrationTestingSchema.parse({ enabled: true, tester_emails: [' A@example.test ', 'a@example.test'] }).tester_emails).toEqual(['a@example.test']);
    expect(registrationTestingSchema.safeParse({ enabled: true, tester_emails: ['*@example.test'] }).success).toBe(false);
    expect(registrationTestingSchema.safeParse({ enabled: 'true', tester_emails: [] }).success).toBe(false);
  });

  it.each([
    ['development', 'http://localhost:5173/', 'http://localhost:4321', true],
    ['production', 'http://localhost:5173/', 'http://localhost:4321', false],
    ['development', 'https://em.devcongress.org/', 'http://localhost:4321', false],
    ['development', 'http://localhost:5173/', 'https://preview.example.test', false],
    ['development', 'http://localhost:5173/', 'http://localhost.evil.test', false],
    ['development', 'http://localhost:5173/', '', false],
  ])('local verification requires runtime, host, and origin: %s %s %s', async (runtime, url, origin, expected) => {
    const app = new Hono();

    app.get('/', (c) => c.json({ local: localRegistrationRequest(c) }));
    const response = await app.request(url, { headers: { Origin: origin } }, { NODE_ENV: runtime });

    expect(await response.json()).toEqual({ local: expected });
  });

  it.each(['admission', 'social', 'update'] as const)('holds revoked %s recipients without dispatch permission', async (kind) => {
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null }).mockResolvedValueOnce({ data: null, error: null });
    expect(await allowConferenceEmail({} as Context, kind, 'delivery', 'person@example.test', 'claim')).toBe(false);
    expect(mocks.rpc).toHaveBeenLastCalledWith('hold_annual_conference_testing_email', { p_kind: kind, p_id: 'delivery', p_claim: 'claim' });
  });

  it('fails closed on policy errors or malformed responses', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'missing migration' } });
    await expect(allowConferenceEmail({} as Context, 'admission', 'id', 'person@example.test', 'claim')).rejects.toThrow('policy unavailable');
  });
});
