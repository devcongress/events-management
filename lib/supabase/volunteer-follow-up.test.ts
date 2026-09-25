import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VolunteerApplication } from '@/types';
import type { VolunteerFollowUpCampaignRow } from '@/types/supabase';

const mocks = vi.hoisted(() => ({
  getSupabaseAdminClient: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('./server', () => ({
  getSupabaseAdminClient: mocks.getSupabaseAdminClient,
  isSupabaseServerConfigured: vi.fn(() => true),
}));

import {
  enrollVolunteerFollowUpApplicant,
  hasDueVolunteerOutcomeDelivery,
} from './volunteer-follow-up';

const campaign = {
  id: 'campaign-2026',
  application_deadline_at: '2026-09-30T23:59:59.999Z',
} as VolunteerFollowUpCampaignRow;

const application: VolunteerApplication = {
  id: 'application-1',
  campaign_id: 'december-mega-meetup',
  name: 'Volunteer Applicant',
  email: 'Applicant@Example.com ',
  x_handle: '',
  slack_name: '',
  created_at: '2026-09-20T12:00:00.000Z',
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.getSupabaseAdminClient.mockReturnValue({
    from: vi.fn(() => ({ upsert: mocks.upsert })),
  });
});

describe('enrollVolunteerFollowUpApplicant', () => {
  it('stores an eligible applicant with normalized email and an idempotent conflict policy', async () => {
    await expect(enrollVolunteerFollowUpApplicant(application, campaign)).resolves.toBe(true);

    expect(mocks.upsert).toHaveBeenCalledWith({
      campaign_id: 'campaign-2026',
      application_id: 'application-1',
      application_created_at: application.created_at,
      applicant_name: 'Volunteer Applicant',
      applicant_email: 'applicant@example.com',
      idempotency_key: 'volunteer-follow-up/campaign-2026/application-1',
    }, { onConflict: 'campaign_id,application_id', ignoreDuplicates: true });
  });

  it('does not enroll applicants created after the current deadline', async () => {
    const lateApplication = {
      ...application,
      created_at: '2026-10-01T00:00:00.000Z',
    };

    await expect(enrollVolunteerFollowUpApplicant(lateApplication, campaign)).resolves.toBe(false);
    expect(mocks.getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('surfaces storage failures so launch and scheduled recovery can retry safely', async () => {
    mocks.upsert.mockResolvedValue({ error: { message: 'database unavailable' } });

    await expect(enrollVolunteerFollowUpApplicant(application, campaign)).rejects.toThrow('database unavailable');
  });
});

describe('hasDueVolunteerOutcomeDelivery', () => {
  it('checks expired sending claims as well as queued and backoff-due work', async () => {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const makeQuery = (result: { data: Array<{ id: string }>; error: null }) => {
      const query: Record<string, unknown> = {};

      for (const method of ['select', 'eq', 'in', 'or', 'limit']) {
        query[method] = (...args: unknown[]) => {
          calls.push({ method, args });

          return query;
        };
      }

      Object.defineProperty(query, 'then', {
        value: (
          resolve: (value: typeof result) => unknown,
          reject: (reason: unknown) => unknown,
        ) => Promise.resolve(result).then(resolve, reject),
      });

      return query;
    };
    const queries = [
      makeQuery({ data: [], error: null }),
      makeQuery({ data: [{ id: 'expired-sending' }], error: null }),
    ];

    mocks.getSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => queries.shift()),
    });

    await expect(hasDueVolunteerOutcomeDelivery('campaign-2026')).resolves.toBe(true);

    expect(calls).toContainEqual({ method: 'eq', args: ['status', 'sending'] });
    expect(calls.some((call) => call.method === 'or' &&
      String(call.args[0]).startsWith('claimed_until.is.null,claimed_until.lte.'))).toBe(true);
  });

  it('fails if either the retryable queue or expired-claim lookup errors', async () => {
    const error = { message: 'expired claim lookup failed' };
    const makeQuery = (result: { data: Array<{ id: string }> | null; error: unknown }) => {
      const query: Record<string, unknown> = {};

      for (const method of ['select', 'eq', 'in', 'or', 'limit'])
        query[method] = () => query;

      Object.defineProperty(query, 'then', {
        value: (
          resolve: (value: typeof result) => unknown,
          reject: (reason: unknown) => unknown,
        ) => Promise.resolve(result).then(resolve, reject),
      });

      return query;
    };
    const queries = [
      makeQuery({ data: [], error: null }),
      makeQuery({ data: null, error }),
    ];

    mocks.getSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => queries.shift()),
    });

    await expect(hasDueVolunteerOutcomeDelivery('campaign-2026')).rejects.toThrow(error.message);
  });
});
