import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAllMockRegistrationCampaigns: vi.fn(),
  getMockRegistrationAttendanceSources: vi.fn(),
  getSupabaseRegistrationCampaigns: vi.fn(),
  getSupabaseRegistrationAttendanceSources: vi.fn(),
}));

vi.mock('@/lib/mock-db/event-registrations', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/mock-db/event-registrations')>(),
  getAllMockRegistrationCampaigns: mocks.getAllMockRegistrationCampaigns,
  getMockRegistrationAttendanceSources: mocks.getMockRegistrationAttendanceSources,
}));

vi.mock('@/lib/supabase/event-registrations', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/supabase/event-registrations')>(),
  getSupabaseRegistrationCampaigns: mocks.getSupabaseRegistrationCampaigns,
  getSupabaseRegistrationAttendanceSources: mocks.getSupabaseRegistrationAttendanceSources,
}));

import { getRegistrationAttendanceSources, getRegistrationCampaigns } from './event-registration-store';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('registration campaign collection store', () => {
  it('reads the mock campaign file once and filters the collection in memory', async () => {
    const campaigns = [
      { id: 'campaign-1', event_id: 'event-1' },
      { id: 'campaign-2', event_id: 'event-2' },
      { id: 'campaign-3', event_id: 'event-3' },
    ];
    mocks.getSupabaseRegistrationCampaigns.mockResolvedValue(null);
    mocks.getAllMockRegistrationCampaigns.mockResolvedValue(campaigns);

    await expect(getRegistrationCampaigns(['event-1', 'event-3'])).resolves.toEqual([
      campaigns[0],
      campaigns[2],
    ]);

    expect(mocks.getAllMockRegistrationCampaigns).toHaveBeenCalledOnce();
  });

  it('keeps batch attendance reads behind the existing registration store boundary', async () => {
    const sources = [{ event_id: 'event-1', campaign_updated_at: '2026-08-30T00:00:00.000Z', registrations: [] }];
    mocks.getSupabaseRegistrationAttendanceSources.mockResolvedValue(sources);

    await expect(getRegistrationAttendanceSources(['event-1'])).resolves.toEqual(sources);
    expect(mocks.getSupabaseRegistrationAttendanceSources).toHaveBeenCalledWith(['event-1'], undefined);
    expect(mocks.getMockRegistrationAttendanceSources).not.toHaveBeenCalled();
  });
});
