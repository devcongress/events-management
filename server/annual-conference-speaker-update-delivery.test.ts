import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context } from 'hono';

const mocks = vi.hoisted(() => ({
  env: vi.fn(), enabled: vi.fn(), rpc: vi.fn(), quota: vi.fn(), outbox: vi.fn(), send: vi.fn(), linkMatches: vi.fn(), configured: vi.fn(),
}));

vi.mock('@/server/env', () => ({ envValue: mocks.env }));
vi.mock('@/lib/supabase/server', () => ({
  isSupabaseRuntimeEnabled: mocks.enabled,
  getSupabaseAdminClient: () => ({
    rpc: mocks.rpc,
    from: (table: string) => table === 'annual_conference_speaker_intake_links'
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: delivery.link_id, token_hash: 'hash' }, error: null }) }) }) }
      : { select: () => ({ in: () => ({ neq: async () => ({ count: 0, error: null }) }) }) },
  }),
}));
vi.mock('@/server/routes/annual-conference-speakers/delivery', () => ({ annualConferenceEmailConfigured: mocks.configured }));
vi.mock('@/lib/annual-conference-speakers', () => ({
  annualConferenceSpeakerWorkspaceToken: () => 'signed-token',
  annualConferenceSpeakerWorkspaceTokenMatches: mocks.linkMatches,
}));
vi.mock('@/lib/email/resend', () => ({ readResendEmailQuota: mocks.quota, sendResendEmailBatch: mocks.send }));
vi.mock('@/lib/email/delivery-health', () => ({ getEmailOutboxSummary: mocks.outbox }));

import { retryAnnualConferenceSpeakerUpdates } from './annual-conference-speaker-update-delivery';

const context = {} as Context;
const delivery = {
  id: 'a77ed992-732a-483a-aa75-99eb41d0a190', link_id: 'b77ed992-732a-483a-aa75-99eb41d0a190', recipient: 'speaker@example.test', idempotency_key: 'frozen-key',
  provider_payload: { from: 'events@example.test', reply_to: 'events@example.test', to: ['speaker@example.test'], subject: 'Update', html: '<a href="https://example.test/conference-speakers/2026/signed-token">Open</a>', text: 'https://example.test/conference-speakers/2026/signed-token' },
};

describe('speaker update dispatch', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.enabled.mockReturnValue(true);
    mocks.env.mockImplementation((key: string) => ({ DEVCON26_SPEAKER_UPDATES_ENABLED: 'true', RESEND_API_KEY: 'test-key', SPEAKER_INTAKE_LINK_TOKEN_SECRET: 'x'.repeat(32) })[key]);
    mocks.linkMatches.mockReturnValue(true);
    mocks.configured.mockReturnValue(true);
    mocks.quota.mockResolvedValue({ dailyUsed: 1, monthlyUsed: 1 });
    mocks.outbox.mockResolvedValue({ pending: 0 });
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'claim_annual_conference_speaker_updates') return { data: [delivery], error: null };

      return { data: true, error: null };
    });
    mocks.send.mockResolvedValue({ ids: ['provider-1'] });
  });

  it('does not claim or send while disabled', async () => {
    mocks.enabled.mockReturnValue(false);
    expect(await retryAnnualConferenceSpeakerUpdates(context)).toEqual({ configured: false, accepted: 0 });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does not claim when speaker email configuration is unavailable', async () => {
    mocks.configured.mockReturnValue(false);
    expect(await retryAnnualConferenceSpeakerUpdates(context)).toEqual({ configured: false, accepted: 0 });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('sends the frozen payload with its idempotency key and records acceptance', async () => {
    expect(await retryAnnualConferenceSpeakerUpdates(context)).toEqual({ configured: true, accepted: 1 });
    expect(mocks.send).toHaveBeenCalledWith({ apiKey: 'test-key', idempotencyKey: 'frozen-key', emails: [delivery.provider_payload] });
    expect(mocks.rpc).toHaveBeenCalledWith('finish_annual_conference_speaker_update', expect.objectContaining({ p_provider_id: 'provider-1' }));
  });

  it('keeps the lease after an ambiguous network failure for same-key replay', async () => {
    mocks.send.mockRejectedValue(new Error('connection lost'));
    expect(await retryAnnualConferenceSpeakerUpdates(context)).toEqual({ configured: true, accepted: 0 });
    expect(mocks.rpc).not.toHaveBeenCalledWith('finish_annual_conference_speaker_update', expect.anything());
  });

  it.each([{ ids: [] }, { ids: ['first', 'second'] }, { ids: ['   '] }])('keeps the lease for malformed provider IDs $ids', async ({ ids }) => {
    mocks.send.mockResolvedValue({ ids });
    expect(await retryAnnualConferenceSpeakerUpdates(context)).toEqual({ configured: true, accepted: 0 });
    expect(mocks.rpc).not.toHaveBeenCalledWith('finish_annual_conference_speaker_update', expect.anything());
  });

  it('does not send when the current link hash no longer matches', async () => {
    mocks.linkMatches.mockReturnValue(false);
    await retryAnnualConferenceSpeakerUpdates(context);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each(['Visit %s.', '(%s)'])('accepts a workspace URL surrounded by punctuation', async (format) => {
    const url = 'https://example.test/conference-speakers/2026/signed-token';

    mocks.rpc.mockImplementation(async (name: string) => name === 'claim_annual_conference_speaker_updates'
      ? { data: [{ ...delivery, provider_payload: { ...delivery.provider_payload, text: format.replace('%s', url) } }], error: null }
      : { data: true, error: null });
    expect(await retryAnnualConferenceSpeakerUpdates(context)).toEqual({ configured: true, accepted: 1 });
  });

  it('does not send a frozen payload containing a different workspace token', async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === 'claim_annual_conference_speaker_updates'
      ? { data: [{ ...delivery, provider_payload: { ...delivery.provider_payload, text: 'https://example.test/conference-speakers/2026/old-token' } }], error: null }
      : { data: true, error: null });
    await retryAnnualConferenceSpeakerUpdates(context);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does not accept a longer token with the expected token as a prefix', async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === 'claim_annual_conference_speaker_updates'
      ? { data: [{ ...delivery, provider_payload: { ...delivery.provider_payload, text: 'https://example.test/conference-speakers/2026/signed-token-extra' } }], error: null }
      : { data: true, error: null });
    await retryAnnualConferenceSpeakerUpdates(context);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does not claim when the signing secret is unavailable', async () => {
    mocks.env.mockImplementation((key: string) => ({ DEVCON26_SPEAKER_UPDATES_ENABLED: 'true', RESEND_API_KEY: 'test-key' })[key]);
    expect(await retryAnnualConferenceSpeakerUpdates(context)).toEqual({ configured: false, accepted: 0 });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('does not send after workspace or recipient eligibility changes', async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === 'claim_annual_conference_speaker_updates'
      ? { data: [delivery], error: null } : { data: name !== 'valid_annual_conference_speaker_update', error: null });
    await retryAnnualConferenceSpeakerUpdates(context);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('finish_annual_conference_speaker_update', expect.objectContaining({ p_error: 'Recipient or workspace changed' }));
  });
});
