import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createVolunteerApplication: vi.fn(),
}));

vi.mock('@/lib/mock-db/volunteer-applications', () => ({
  DECEMBER_VOLUNTEER_CAMPAIGN_ID: 'december-mega-meetup',
  createVolunteerApplication: mocks.createVolunteerApplication,
  getVolunteerApplications: vi.fn(async () => []),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_DATA_SOURCE', 'local-json');
  vi.stubEnv('TURNSTILE_SECRET_KEY', '');
  vi.resetModules();
  const { resetLocalPublicRateLimits } = await import('@/lib/public-rate-limit');
  resetLocalPublicRateLimits();
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
  });
});
