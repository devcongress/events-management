import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createVolunteerApplication: vi.fn(),
  getVolunteerApplicationByEmail: vi.fn(),
  getVolunteerFollowUpCampaign: vi.fn(),
  enrollVolunteerFollowUpApplicant: vi.fn(),
}));

vi.mock('@/lib/mock-db/volunteer-applications', () => ({
  DECEMBER_VOLUNTEER_CAMPAIGN_ID: 'december-mega-meetup',
  createVolunteerApplication: mocks.createVolunteerApplication,
  getVolunteerApplicationByEmail: mocks.getVolunteerApplicationByEmail,
  getVolunteerApplications: vi.fn(async () => []),
}));

vi.mock('@/lib/supabase/volunteer-follow-up', () => ({
  getVolunteerFollowUpCampaign: mocks.getVolunteerFollowUpCampaign,
  enrollVolunteerFollowUpApplicant: mocks.enrollVolunteerFollowUpApplicant,
}));

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_DATA_SOURCE', 'local-json');
  vi.stubEnv('TURNSTILE_SECRET_KEY', '');
  vi.resetModules();
  const { resetLocalPublicRateLimits } = await import('@/lib/public-rate-limit');

  resetLocalPublicRateLimits();
  mocks.getVolunteerApplicationByEmail.mockResolvedValue(null);
  mocks.getVolunteerFollowUpCampaign.mockResolvedValue({
    id: 'campaign-2026',
    status: 'draft',
    application_deadline_at: '2026-09-30T23:59:59.999Z',
  });
  mocks.enrollVolunteerFollowUpApplicant.mockResolvedValue(true);
  mocks.createVolunteerApplication.mockResolvedValue({
    created: true,
    application: {
      id: 'volunteer-1',
      campaign_id: 'december-mega-meetup',
      name: 'Ama Mensah',
      email: 'ama@example.com',
      x_handle: '',
      slack_name: '',
      created_at: '2026-08-20T10:00:00.000Z',
    },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('public volunteer applications', () => {
  it('accepts a simple name-and-email submission without social accounts', async () => {
    const { default: app } = await import('./app');
    const response = await app.request('http://localhost/api/volunteer-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '  Ama Mensah  ',
        email: '  AMA@Example.com  ',
      }),
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true });
    expect(mocks.createVolunteerApplication).toHaveBeenCalledWith({
      name: 'Ama Mensah',
      email: 'ama@example.com',
      x_handle: '',
      slack_name: '',
    });
    await vi.waitFor(() => expect(mocks.enrollVolunteerFollowUpApplicant).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'volunteer-1' }),
      expect.objectContaining({ id: 'campaign-2026' }),
      expect.anything(),
    ));
  });

  it('treats a repeated normalized email as an accepted idempotent retry', async () => {
    const existingApplication = {
      id: 'volunteer-existing',
      campaign_id: 'december-mega-meetup',
      name: 'Ama Mensah',
      email: 'ama@example.com',
      x_handle: '',
      slack_name: '',
      created_at: '2026-08-20T10:00:00.000Z',
    };

    mocks.getVolunteerApplicationByEmail.mockResolvedValue(existingApplication);
    const { default: app } = await import('./app');

    const response = await app.request('http://localhost/api/volunteer-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ama Mensah', email: 'AMA@Example.com' }),
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true });
    expect(mocks.getVolunteerApplicationByEmail).toHaveBeenCalledWith('ama@example.com');
    expect(mocks.createVolunteerApplication).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(mocks.enrollVolunteerFollowUpApplicant).toHaveBeenCalledWith(
      existingApplication,
      expect.objectContaining({ id: 'campaign-2026' }),
      expect.anything(),
    ));
  });

  it('enrolls an application returned by the store-level duplicate race path', async () => {
    const racedApplication = {
      id: 'volunteer-race',
      campaign_id: 'december-mega-meetup',
      name: 'Ama Mensah',
      email: 'ama@example.com',
      x_handle: '',
      slack_name: '',
      created_at: '2026-08-20T10:00:00.000Z',
    };

    mocks.createVolunteerApplication.mockResolvedValueOnce({
      created: false,
      application: racedApplication,
    });
    const { default: app } = await import('./app');

    const response = await app.request('http://localhost/api/volunteer-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ama Mensah', email: 'ama@example.com' }),
    });

    expect(response.status).toBe(202);
    await vi.waitFor(() => expect(mocks.enrollVolunteerFollowUpApplicant).toHaveBeenCalledWith(
      racedApplication,
      expect.objectContaining({ id: 'campaign-2026' }),
      expect.anything(),
    ));
  });

  it('keeps accepting an application when best-effort recipient enrollment fails', async () => {
    mocks.enrollVolunteerFollowUpApplicant.mockRejectedValueOnce(new Error('database unavailable'));
    const { default: app } = await import('./app');

    const response = await app.request('http://localhost/api/volunteer-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ama Mensah', email: 'ama@example.com' }),
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true });
    await vi.waitFor(() => expect(mocks.enrollVolunteerFollowUpApplicant).toHaveBeenCalledOnce());
  });
});
