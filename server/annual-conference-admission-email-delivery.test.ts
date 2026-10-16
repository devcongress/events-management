import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context } from 'hono';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), send: vi.fn(), enabled: true }));

vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/lib/email/resend', () => ({ sendResendAttachedEmail: mocks.send }));
vi.mock('@/server/env', () => ({ envValue: (key: string) => ({
  DEVCON26_ADMISSION_EMAILS_ENABLED: String(mocks.enabled), RESEND_API_KEY: 'fixture',
  DEVCON26_ADMISSION_EMAIL_FROM: 'events@example.test', DEVCON26_ADMISSION_EMAIL_REPLY_TO: 'help@example.test',
})[key] }));

import { admissionEmailContent, retryAnnualConferenceAdmissionEmails } from './annual-conference-admission-email-delivery';

const delivery = {
  id: '10000000-0000-4000-8000-000000000001', recipient_name: '<Fixture>', recipient_email: 'fixture@example.test',
  kind: 'ticket_delivery' as const, payload: { qr_token: 'a'.repeat(64) }, idempotency_key: 'fixture-admission',
  first_attempt_at: new Date().toISOString(), claimed_until: new Date(Date.now() + 600000).toISOString(),
};

beforeEach(() => {
  mocks.enabled = true;
  mocks.rpc.mockReset();
  mocks.send.mockReset().mockResolvedValue('provider-fixture');
  mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => ({
    error: null,
    data: name === 'claim_annual_conference_ticket_email_outbox' ? [delivery]
      : name === 'freeze_annual_conference_admission_email' ? args.p_payload
        : name === 'annual_conference_email_allowed' ? true : {},
  }));
});

describe('conference admission delivery', () => {
  it('creates a private PNG attachment without exposing a raw token or unescaped name in HTML', async () => {
    const email = await admissionEmailContent(delivery, 'events@example.test', 'help@example.test');

    expect(email.attachments).toHaveLength(1);
    expect(Buffer.from(email.attachments![0].content, 'base64').subarray(1, 4).toString()).toBe('PNG');
    expect(email.html).toContain('&lt;Fixture&gt;');
    expect(email.html).not.toContain(delivery.payload.qr_token);
    const waitlist = await admissionEmailContent({ ...delivery, kind: 'waitlist_notice', payload: {} }, 'events@example.test', 'help@example.test');

    expect(waitlist.attachments).toBeUndefined();
    expect(waitlist.text).toContain('not a confirmed place');
  });

  it('does not claim or send when disabled', async () => {
    mocks.enabled = false;
    expect(await retryAnnualConferenceAdmissionEmails({} as Context)).toMatchObject({ configured: false });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('freezes the provider payload and acknowledges acceptance with the same idempotency key', async () => {
    expect(await retryAnnualConferenceAdmissionEmails({} as Context)).toMatchObject({ accepted: 1, failed: 0 });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'fixture-admission' }));
    expect(mocks.rpc).toHaveBeenLastCalledWith('finalize_annual_conference_ticket_email_outbox', expect.objectContaining({ p_status: 'accepted', p_provider_email_id: 'provider-fixture' }));
  });

  it('does not turn an ambiguous accepted acknowledgement into a new failed delivery', async () => {
    mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => ({
      error: name === 'finalize_annual_conference_ticket_email_outbox' ? { message: 'unavailable' } : null,
      data: name === 'claim_annual_conference_ticket_email_outbox' ? [delivery] : name === 'annual_conference_email_allowed' ? true : args.p_payload,
    }));
    await expect(retryAnnualConferenceAdmissionEmails({} as Context)).rejects.toThrow('acknowledgement');
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'finalize_annual_conference_ticket_email_outbox')).toHaveLength(1);
  });
});
