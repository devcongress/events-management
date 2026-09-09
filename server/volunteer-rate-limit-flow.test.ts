import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assessEmail: vi.fn(),
  createVolunteerApplication: vi.fn(),
  enforceRateLimit: vi.fn(),
  getVolunteerApplicationByEmail: vi.fn(),
}));

vi.mock('@/server/http/public-intake-protection', async () => {
  const actual = await vi.importActual<typeof import('@/server/http/public-intake-protection')>(
    '@/server/http/public-intake-protection',
  );
  return {
    ...actual,
    assessPublicSubmissionEmail: mocks.assessEmail,
    enforcePublicRateLimit: mocks.enforceRateLimit,
    publicClientKey: vi.fn(() => 'shared-network'),
    requirePublicTurnstile: vi.fn(async () => null),
  };
});

vi.mock('@/lib/mock-db/volunteer-applications', () => ({
  DECEMBER_VOLUNTEER_CAMPAIGN_ID: 'december-mega-meetup',
  createVolunteerApplication: mocks.createVolunteerApplication,
  getVolunteerApplicationByEmail: mocks.getVolunteerApplicationByEmail,
  getVolunteerApplications: vi.fn(async () => []),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_DATA_SOURCE', 'local-json');
  mocks.enforceRateLimit.mockResolvedValue(null);
  mocks.getVolunteerApplicationByEmail.mockResolvedValue(null);
  mocks.createVolunteerApplication.mockResolvedValue({
    created: true,
    application: {
      id: 'volunteer-1',
      campaign_id: 'december-mega-meetup',
      name: 'Ama Mensah',
      email: 'ama@example.com',
      x_handle: '',
      slack_name: '',
      created_at: '2026-09-09T10:00:00.000Z',
    },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('volunteer intake rate-limit flow', () => {
  it('does not spend the validated-new-application allowances on a rejected email', async () => {
    mocks.assessEmail.mockResolvedValue({
      status: 'invalid',
      normalizedEmail: 'person@mailinator.com',
      domain: 'mailinator.com',
      reason: 'disposable_domain',
      message: 'Use a permanent email address so we can send your event updates.',
    });
    const { default: app } = await import('./app');

    const response = await app.request('http://localhost/api/volunteer-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ama Mensah', email: 'person@mailinator.com' }),
    });

    expect(response.status).toBe(422);
    expect(mocks.enforceRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.enforceRateLimit.mock.calls[0]?.[1]).toMatchObject({
      action: 'volunteer_application_burst',
      clientKey: 'shared-network',
    });
  });

  it('uses separate shared-network and normalized-email limits for a new application', async () => {
    mocks.assessEmail.mockResolvedValue({
      status: 'deliverable',
      normalizedEmail: 'ama@example.com',
      domain: 'example.com',
      reason: 'mail_domain_available',
    });
    const { default: app } = await import('./app');

    const response = await app.request('http://localhost/api/volunteer-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ama Mensah', email: ' AMA@Example.com ' }),
    });

    expect(response.status).toBe(202);
    expect(mocks.enforceRateLimit.mock.calls.map((call) => call[1])).toEqual([
      expect.objectContaining({ action: 'volunteer_application_burst', clientKey: 'shared-network' }),
      expect.objectContaining({ action: 'volunteer_application_network_daily', clientKey: 'shared-network' }),
      expect.objectContaining({ action: 'volunteer_application_email_daily', clientKey: 'ama@example.com' }),
    ]);
    expect(mocks.createVolunteerApplication).toHaveBeenCalledWith(expect.objectContaining({
      email: 'ama@example.com',
    }));
  });

  it('returns the same accepted response for an existing email before spending new-application limits', async () => {
    mocks.assessEmail.mockResolvedValue({
      status: 'deliverable',
      normalizedEmail: 'ama@example.com',
      domain: 'example.com',
      reason: 'mail_domain_available',
    });
    mocks.getVolunteerApplicationByEmail.mockResolvedValue({ email: 'ama@example.com' });
    const { default: app } = await import('./app');

    const response = await app.request('http://localhost/api/volunteer-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ama Mensah', email: 'ama@example.com' }),
    });

    expect(response.status).toBe(202);
    expect(mocks.enforceRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.createVolunteerApplication).not.toHaveBeenCalled();
  });
});
