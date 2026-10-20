import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context } from 'hono';
import {
  sandboxEmailConfiguration, sandboxEmailContent, sandboxPreviewEmailConfiguration,
} from '@/lib/devcon26-test-checkout-email-delivery';
import { claimSandboxEmails, finishSandboxEmail, freezeSandboxEmail, type SandboxEmailDelivery } from '@/lib/supabase/devcon26-test-checkout-emails';
import { sendResendEmailBatch } from '@/lib/email/resend';
import { retrySandboxCheckoutEmails } from './devcon26-test-checkout-email-delivery';
import app, { isUnauthenticatedApiRequest } from './app';

vi.mock('@/lib/supabase/devcon26-test-checkout-emails', () => ({
  claimSandboxEmails: vi.fn(), finishSandboxEmail: vi.fn(), freezeSandboxEmail: vi.fn(),
}));
vi.mock('@/lib/email/resend', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/email/resend')>(), sendResendEmailBatch: vi.fn(),
}));

const env = {
  DEVCON26_TEST_CHECKOUT_ENABLED: 'true', DEVCON26_PAYMENT_PROVIDER: 'paystack',
  PAYSTACK_SECRET_KEY: 'sk_test_fixture_only', DEVCON26_TEST_BUYER_EMAIL: 'sink@example.test',
  PUBLIC_WEBSITE_ORIGIN: 'https://devcongress.org',
  DEVCON26_TEST_CHECKOUT_EMAILS_ENABLED: 'true',
  DEVCON26_TEST_CHECKOUT_EMAIL_FROM: 'test@example.test',
  DEVCON26_TEST_CHECKOUT_EMAIL_REPLY_TO: 'help@example.test',
  DEVCON26_TEST_CHECKOUT_EMAIL_RECIPIENTS: 'Ada@example.test', RESEND_API_KEY: 're_fixture',
};
const context = { env } as unknown as Context;
const delivery: SandboxEmailDelivery = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', session_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  recipient_email: 'ada@example.test', recipient_name: 'Ada <script>', preview_email_authorized_origin: null,
  preview_email_authorized_until: null,
  tier_key: 'team_3', quantity: 3,
  amount_minor: 54999, idempotency_key: 'devcon26-test-confirmation/fixture', status: 'sending',
  provider_payload: null, provider_email_id: null, attempt_count: 1,
  first_attempt_at: '2026-10-13T18:00:00Z', next_attempt_at: '2026-10-13T18:00:00Z',
  claim_token: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', lease_until: '2026-10-13T18:10:00Z',
  created_at: '2026-10-13T18:00:00Z', updated_at: '2026-10-13T18:00:00Z',
};
const route = '/api/internal/devcon26-test-checkout-emails/retry';
const schedulerSecret = 's'.repeat(40);
const previewOrigin = 'https://feature-checkout.example.test';
const previewEnv = {
  ...env,
  DEVCON26_TEST_CHECKOUT_ORIGINS: previewOrigin,
  DEVCON26_TEST_CHECKOUT_EMAIL_RECIPIENTS: '',
  DEVCON26_TEST_CHECKOUT_PREVIEW_EMAILS_ENABLED: 'true',
  DEVCON26_TEST_CHECKOUT_PREVIEW_EMAIL_ORIGINS: previewOrigin,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-13T18:01:00Z'));
  vi.mocked(claimSandboxEmails).mockResolvedValue([{ ...delivery }]);
  vi.mocked(freezeSandboxEmail).mockImplementation(async (_c, _id, _claim, payload) => payload);
  vi.mocked(finishSandboxEmail).mockResolvedValue();
  vi.mocked(sendResendEmailBatch).mockResolvedValue({ ids: ['provider-fixture'], quota: { dailyUsed: null, monthlyUsed: null } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('sandbox email configuration and content', () => {
  it('normalizes an exact allowlist and fails closed for missing or unsafe settings', () => {
    expect(sandboxEmailConfiguration(env)?.recipients.has('ada@example.test')).toBe(true);

    for (const override of [
      { DEVCON26_TEST_CHECKOUT_EMAILS_ENABLED: 'false' }, { DEVCON26_TEST_CHECKOUT_ENABLED: 'false' },
      { PAYSTACK_SECRET_KEY: 'sk_live_fixture' }, { RESEND_API_KEY: '' },
      { DEVCON26_TEST_CHECKOUT_EMAIL_RECIPIENTS: '' }, { DEVCON26_TEST_CHECKOUT_EMAIL_RECIPIENTS: '*@example.test' },
      { DEVCON26_TEST_CHECKOUT_EMAIL_RECIPIENTS: 'ada@example.test,invalid' },
      { DEVCON26_TEST_CHECKOUT_EMAIL_REPLY_TO: 'invalid' }, { DEVCON26_TEST_CHECKOUT_EMAIL_FROM: 'invalid' },
    ]) expect(sandboxEmailConfiguration({ ...env, ...override })).toBeNull();
  });

  it('authorizes only exact canonical HTTPS preview origins behind a separate default-off flag', () => {
    expect(sandboxPreviewEmailConfiguration(previewEnv, previewOrigin)).toBe(previewOrigin);

    for (const override of [
      { DEVCON26_TEST_CHECKOUT_PREVIEW_EMAILS_ENABLED: 'false' },
      { DEVCON26_TEST_CHECKOUT_PREVIEW_EMAIL_ORIGINS: '' },
      { DEVCON26_TEST_CHECKOUT_PREVIEW_EMAIL_ORIGINS: 'https://*.example.test' },
      { DEVCON26_TEST_CHECKOUT_PREVIEW_EMAIL_ORIGINS: 'http://feature-checkout.example.test' },
      { DEVCON26_TEST_CHECKOUT_PREVIEW_EMAIL_ORIGINS: `${previewOrigin}/checkout` },
    ]) {
      expect(sandboxPreviewEmailConfiguration({ ...previewEnv, ...override }, previewOrigin)).toBeNull();
    }

    expect(sandboxPreviewEmailConfiguration(previewEnv, 'https://other.example.test')).toBeNull();
    expect(sandboxPreviewEmailConfiguration({
      ...previewEnv,
      DEVCON26_TEST_CHECKOUT_PREVIEW_EMAIL_ORIGINS: env.PUBLIC_WEBSITE_ORIGIN,
    }, env.PUBLIC_WEBSITE_ORIGIN)).toBeNull();
  });

  it('keeps exact recipients usable when preview delivery configuration is absent or invalid', () => {
    expect(sandboxEmailConfiguration(env)?.recipients.has('ada@example.test')).toBe(true);
    expect(sandboxEmailConfiguration({
      ...env,
      DEVCON26_TEST_CHECKOUT_PREVIEW_EMAILS_ENABLED: 'true',
      DEVCON26_TEST_CHECKOUT_PREVIEW_EMAIL_ORIGINS: 'https://*.example.test',
    })?.recipients.has('ada@example.test')).toBe(true);
  });

  it('escapes names and includes only a TEST summary, without admission or resume links', () => {
    const message = sandboxEmailContent(delivery, env.DEVCON26_TEST_CHECKOUT_EMAIL_FROM, env.DEVCON26_TEST_CHECKOUT_EMAIL_REPLY_TO);

    expect(message.subject).toMatch(/^\[TEST\]/);
    expect(message.text).toContain('not an admission ticket');
    expect(message.text).toContain('GHS 549.99');
    expect(message.text).toContain('Team of 3');
    expect(message.html).toContain('&lt;script&gt;');
    expect(message.html).not.toContain('<script>');
    expect(message.html).not.toContain('href=');
    expect(message.to).toEqual(['ada@example.test']);
  });
});

describe('sandbox email delivery safety', () => {
  it('does not claim or send when disabled', async () => {
    await retrySandboxCheckoutEmails({ env: { ...env, DEVCON26_TEST_CHECKOUT_EMAILS_ENABLED: 'false' } } as unknown as Context);

    expect(claimSandboxEmails).not.toHaveBeenCalled();
    expect(sendResendEmailBatch).not.toHaveBeenCalled();
  });

  it('sends only the frozen payload and stable key, then records acceptance', async () => {
    const frozen = sandboxEmailContent(delivery, 'earlier@example.test', 'earlier-reply@example.test');

    vi.mocked(freezeSandboxEmail).mockResolvedValue(frozen);
    expect(await retrySandboxCheckoutEmails(context)).toMatchObject({ accepted: 1, failed: 0 });
    expect(sendResendEmailBatch).toHaveBeenCalledWith({ apiKey: env.RESEND_API_KEY,
      idempotencyKey: delivery.idempotency_key, emails: [frozen] });
    expect(finishSandboxEmail).toHaveBeenCalledWith(context, delivery.id, expect.any(String), 'accepted', 'provider-fixture');
  });

  it('suppresses unapproved purchasers without sending or freezing', async () => {
    vi.mocked(claimSandboxEmails).mockResolvedValue([{ ...delivery, recipient_email: 'outsider@example.test' }]);
    expect(await retrySandboxCheckoutEmails(context)).toMatchObject({ suppressed: 1 });
    expect(freezeSandboxEmail).not.toHaveBeenCalled();
    expect(sendResendEmailBatch).not.toHaveBeenCalled();
    expect(finishSandboxEmail).toHaveBeenCalledWith(context, delivery.id, expect.any(String), 'suppressed');
  });

  it('sends to an arbitrary purchaser only with persisted authorization for a currently allowed preview origin', async () => {
    const previewContext = { env: previewEnv } as unknown as Context;

    vi.mocked(claimSandboxEmails).mockResolvedValue([{
      ...delivery,
      recipient_email: 'unknown-tester@example.test',
      preview_email_authorized_origin: previewOrigin,
      preview_email_authorized_until: '2026-10-13T19:00:00Z',
    } as SandboxEmailDelivery]);

    expect(await retrySandboxCheckoutEmails(previewContext)).toMatchObject({ accepted: 1, suppressed: 0 });
    expect(sendResendEmailBatch).toHaveBeenCalledOnce();
  });

  it('suppresses arbitrary purchasers when durable preview proof or current configuration is missing', async () => {
    const unauthorizedDeliveries = [
      { ...delivery, recipient_email: 'unknown-tester@example.test', preview_email_authorized_origin: null },
      { ...delivery, recipient_email: 'unknown-tester@example.test', preview_email_authorized_origin: 'https://other.example.test' },
      {
        ...delivery,
        recipient_email: 'unknown-tester@example.test',
        preview_email_authorized_origin: previewOrigin,
        preview_email_authorized_until: '2026-10-13T18:00:59Z',
      },
    ];

    for (const candidate of unauthorizedDeliveries) {
      vi.mocked(claimSandboxEmails).mockResolvedValue([candidate as SandboxEmailDelivery]);
      await retrySandboxCheckoutEmails({ env: previewEnv } as unknown as Context);
    }

    vi.mocked(claimSandboxEmails).mockResolvedValue([{
      ...delivery,
      recipient_email: 'unknown-tester@example.test',
      preview_email_authorized_origin: previewOrigin,
      preview_email_authorized_until: '2026-10-13T19:00:00Z',
    } as SandboxEmailDelivery]);
    await retrySandboxCheckoutEmails({ env: {
      ...previewEnv,
      DEVCON26_TEST_CHECKOUT_PREVIEW_EMAILS_ENABLED: 'false',
      DEVCON26_TEST_CHECKOUT_EMAIL_RECIPIENTS: 'ada@example.test',
    } } as unknown as Context);
    await retrySandboxCheckoutEmails({ env: {
      ...previewEnv,
      DEVCON26_TEST_CHECKOUT_ORIGINS: 'https://other-general-origin.example.test',
      DEVCON26_TEST_CHECKOUT_EMAIL_RECIPIENTS: 'ada@example.test',
    } } as unknown as Context);

    expect(sendResendEmailBatch).not.toHaveBeenCalled();
    expect(finishSandboxEmail).toHaveBeenCalledTimes(5);
    expect(finishSandboxEmail).toHaveBeenCalledWith(expect.anything(), delivery.id, expect.any(String), 'suppressed');
  });

  it('rechecks the absolute preview authorization deadline immediately before sending', async () => {
    vi.mocked(claimSandboxEmails).mockResolvedValue([{
      ...delivery,
      recipient_email: 'unknown-tester@example.test',
      preview_email_authorized_origin: previewOrigin,
      preview_email_authorized_until: '2026-10-13T18:01:01Z',
    } as SandboxEmailDelivery]);
    vi.mocked(freezeSandboxEmail).mockImplementation(async (_c, _id, _claim, payload) => {
      vi.setSystemTime(new Date('2026-10-13T18:01:02Z'));

      return payload;
    });

    expect(await retrySandboxCheckoutEmails({ env: previewEnv } as unknown as Context))
      .toMatchObject({ accepted: 0, suppressed: 1 });
    expect(sendResendEmailBatch).not.toHaveBeenCalled();
    expect(finishSandboxEmail).toHaveBeenCalledWith(expect.anything(), delivery.id, expect.any(String), 'suppressed');
  });

  it('rejects a frozen payload addressed to someone other than the approved purchaser', async () => {
    vi.mocked(freezeSandboxEmail).mockResolvedValue(sandboxEmailContent({ ...delivery, recipient_email: 'outsider@example.test' }, 'test@example.test', 'reply@example.test'));
    await retrySandboxCheckoutEmails(context);

    expect(sendResendEmailBatch).not.toHaveBeenCalled();
    expect(finishSandboxEmail).toHaveBeenCalledWith(context, delivery.id, expect.any(String), 'needs_attention');
  });

  it('records provider failures for bounded retries', async () => {
    vi.mocked(sendResendEmailBatch).mockRejectedValue(new Error('provider unavailable'));
    expect(await retrySandboxCheckoutEmails(context)).toMatchObject({ failed: 1 });
    expect(finishSandboxEmail).toHaveBeenCalledWith(context, delivery.id, expect.any(String), 'failed');
  });

  it('does not mark an accepted send failed if database acknowledgement fails', async () => {
    vi.mocked(finishSandboxEmail).mockRejectedValue(new Error('database unavailable'));
    await expect(retrySandboxCheckoutEmails(context)).rejects.toThrow('database unavailable');

    expect(finishSandboxEmail).toHaveBeenCalledTimes(1);
    expect(finishSandboxEmail).toHaveBeenCalledWith(context, delivery.id, expect.any(String), 'accepted', 'provider-fixture');
  });

  it('does not send after the lease or hard retry window', async () => {
    for (const override of [
      { lease_until: '2026-10-13T18:00:59Z' }, { first_attempt_at: '2026-10-13T17:00:00Z' },
      { lease_until: 'invalid' }, { first_attempt_at: 'invalid' },
    ]) {
      vi.mocked(claimSandboxEmails).mockResolvedValue([{ ...delivery, ...override }]);
      await retrySandboxCheckoutEmails(context);
    }

    expect(sendResendEmailBatch).not.toHaveBeenCalled();
  });
});

describe('sandbox email scheduler route', () => {
  it('allows only POST through the session gate and requires a strong exact scheduler secret', async () => {
    expect(isUnauthenticatedApiRequest(route, 'POST')).toBe(true);
    expect(isUnauthenticatedApiRequest(route, 'GET')).toBe(false);
    vi.stubEnv('SLACK_EVENTS_RETRY_SECRET', schedulerSecret);

    for (const secret of ['', 'wrong', 'x'.repeat(40)]) {
      const response = await app.request(route, { method: 'POST', headers: { 'x-scheduled-job-secret': secret } });

      expect(response.status).toBe(404);
    }

    expect(claimSandboxEmails).not.toHaveBeenCalled();
  });

  it('returns a disabled result for an authorized request without enabling sends', async () => {
    vi.stubEnv('SLACK_EVENTS_RETRY_SECRET', schedulerSecret);
    vi.stubEnv('DEVCON26_TEST_CHECKOUT_EMAILS_ENABLED', 'false');
    const response = await app.request(route, { method: 'POST', headers: {
      'x-scheduled-job-secret': schedulerSecret,
    } });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ configured: false });
    expect(sendResendEmailBatch).not.toHaveBeenCalled();
  });
});
