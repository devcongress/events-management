import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context } from 'hono';

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  finalize: vi.fn(),
  send: vi.fn(),
  health: vi.fn(),
}));

vi.mock('@/lib/supabase/annual-conference-social-cards', () => ({
  claimSupabaseAnnualConferenceSocialCardEmailDeliveries: mocks.claim,
  finalizeSupabaseAnnualConferenceSocialCardEmailDelivery: mocks.finalize,
}));

vi.mock('@/lib/email/resend', () => ({
  ResendBatchError: class ResendBatchError extends Error {},
  sendResendEmailBatch: mocks.send,
}));

vi.mock('@/lib/email/delivery-health', () => ({ recordResendEmailHealth: mocks.health }));

vi.mock('@/server/env', () => ({
  envValue: (key: string) => ({
    RESEND_API_KEY: 're_test',
    DEVCON26_SOCIAL_CARD_EMAILS_ENABLED: 'true',
    DEVCON26_SOCIAL_CARD_EMAIL_FROM: 'DevCongress <social@example.test>',
    DEVCON26_SOCIAL_CARD_EMAIL_REPLY_TO: 'social@example.test',
  })[key],
}));

import { retryAnnualConferenceSocialCardEmails } from './annual-conference-social-card-email-delivery';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.claim.mockResolvedValue([{
    id: '10000000-0000-4000-8000-000000000001',
    recipient_name: 'Ama Mensah',
    recipient_email: 'ama@example.test',
    capability: 'raw-management-capability',
    idempotency_key: 'annual-conference-social-card:test',
  }]);
  mocks.send.mockResolvedValue({ ids: ['resend-message-id'], quota: { dailyUsed: 1, monthlyUsed: 1 } });
  mocks.finalize.mockResolvedValue(undefined);
});

describe('annual conference social-card sender', () => {
  it('sends the website fragment management link then records the provider identifier before scrubbing', async () => {
    await expect(retryAnnualConferenceSocialCardEmails({} as Context)).resolves.toEqual({ configured: true, accepted: 1, failed: 0 });

    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: 'annual-conference-social-card:test',
      emails: [expect.objectContaining({
        to: ['ama@example.test'],
        text: expect.stringContaining('https://devcongress.org/devcon26/social-card/#raw-management-capability'),
      })],
    }));
    expect(mocks.finalize).toHaveBeenCalledWith(expect.objectContaining({
      status: 'accepted', providerEmailId: 'resend-message-id',
    }), expect.anything());
  });

  it('sends ticket buyers a collection link with clear optional and per-ticket copy', async () => {
    mocks.claim.mockResolvedValue([{
      id: '10000000-0000-4000-8000-000000000002',
      recipient_name: 'Ama Mensah',
      recipient_email: 'ama@example.test',
      capability: 'buyer-collection-capability',
      idempotency_key: 'annual-conference-social-card-collection:test',
      collection_order_id: 'order-id',
    }]);

    await retryAnnualConferenceSocialCardEmails({} as Context);

    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      emails: [expect.objectContaining({
        subject: 'Create your DevCon26 ticket cards',
        text: expect.stringContaining('https://devcongress.org/devcon26/social-card/#collection=buyer-collection-capability'),
      })],
    }));
  });
});
