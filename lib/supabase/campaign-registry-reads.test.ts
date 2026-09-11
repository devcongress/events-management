import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  isSupabaseRuntimeEnabled: vi.fn(() => true),
}));

vi.mock('./server', () => ({
  getSupabaseAdminClient: () => ({ from: mocks.from }),
  isSupabaseRuntimeEnabled: mocks.isSupabaseRuntimeEnabled,
}));

import {
  getSupabaseRegistrationAttendanceSources,
  getSupabaseRegistrationCampaigns,
} from './event-registrations';
import { getSupabaseFeedbackCampaignsByEventIds } from './feedback-campaigns';

function bulkQuery(rows: unknown[]) {
  const query = {
    select: vi.fn(),
    in: vi.fn(),
  };

  query.select.mockReturnValue(query);
  query.in.mockResolvedValue({ data: rows, error: null });

  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isSupabaseRuntimeEnabled.mockReturnValue(true);
});

describe('short-link registry campaign reads', () => {
  it('loads every registration campaign in one event-id query', async () => {
    const eventIds = ['event-1', 'event-2'];
    const rows = [{ id: 'registration-1', event_id: 'event-1', status: 'open' }];
    const query = bulkQuery(rows);

    mocks.from.mockReturnValue(query);

    await expect(getSupabaseRegistrationCampaigns(eventIds)).resolves.toEqual(rows);

    expect(mocks.from).toHaveBeenCalledOnce();
    expect(mocks.from).toHaveBeenCalledWith('event_registration_campaigns');
    expect(query.in).toHaveBeenCalledOnce();
    expect(query.in).toHaveBeenCalledWith('event_id', eventIds);
  });

  it('loads feedback campaign status in one query without fetching questions', async () => {
    const eventIds = ['event-1', 'event-2'];
    const rows = [{
      id: 'feedback-1',
      event_id: 'event-2',
      title: 'Event feedback',
      intro: null,
      status: 'open',
      auto_open_on_event_completion: false,
      opens_at: null,
      closes_at: null,
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
    }];
    const query = bulkQuery(rows);

    mocks.from.mockReturnValue(query);

    await expect(getSupabaseFeedbackCampaignsByEventIds(eventIds)).resolves.toEqual([
      expect.objectContaining({ id: 'feedback-1', event_id: 'event-2', status: 'open', questions: [] }),
    ]);

    expect(mocks.from).toHaveBeenCalledOnce();
    expect(mocks.from).toHaveBeenCalledWith('feedback_campaigns');
    expect(query.in).toHaveBeenCalledOnce();
    expect(query.in).toHaveBeenCalledWith('event_id', eventIds);
  });

  it('does not query Supabase when there are no events', async () => {
    await expect(getSupabaseRegistrationCampaigns([])).resolves.toEqual([]);
    await expect(getSupabaseFeedbackCampaignsByEventIds([])).resolves.toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('loads native attendance for multiple events without per-event queries', async () => {
    const campaignQuery = bulkQuery([
      { id: 'campaign-1', event_id: 'event-1', updated_at: '2026-08-30T00:00:00.000Z' },
      { id: 'campaign-2', event_id: 'event-2', updated_at: '2026-09-27T00:00:00.000Z' },
    ]);
    const registrationQuery = {
      select: vi.fn(),
      in: vi.fn(),
      order: vi.fn(),
    };

    registrationQuery.select.mockReturnValue(registrationQuery);
    registrationQuery.in.mockReturnValue(registrationQuery);
    registrationQuery.order.mockResolvedValue({
      data: [{
        id: 'registration-1',
        campaign_id: 'campaign-1',
        name: 'Ada',
        email: 'ada@example.com',
        normalized_email: 'ada@example.com',
        status: 'confirmed',
        confirmed_at: '2026-08-29T09:00:00.000Z',
        cancelled_at: null,
        created_at: '2026-08-28T09:00:00.000Z',
        updated_at: '2026-08-29T10:00:00.000Z',
      }],
      error: null,
    });
    const checkinQuery = bulkQuery([
      { registration_id: 'registration-1', checked_in_at: '2026-08-29T10:05:00.000Z' },
    ]);

    mocks.from.mockImplementation((table: string) => {
      if (table === 'event_registration_campaigns') return campaignQuery;
      if (table === 'event_registrations') return registrationQuery;
      if (table === 'event_registration_checkins') return checkinQuery;

      throw new Error(`Unexpected table: ${table}`);
    });

    await expect(getSupabaseRegistrationAttendanceSources(['event-1', 'event-2'])).resolves.toEqual([
      expect.objectContaining({
        event_id: 'event-1',
        registrations: [expect.objectContaining({ id: 'registration-1', checked_in_at: '2026-08-29T10:05:00.000Z' })],
      }),
      expect.objectContaining({ event_id: 'event-2', registrations: [] }),
    ]);

    expect(mocks.from).toHaveBeenCalledTimes(3);
    expect(campaignQuery.in).toHaveBeenCalledWith('event_id', ['event-1', 'event-2']);
    expect(registrationQuery.in).toHaveBeenCalledWith('campaign_id', ['campaign-1', 'campaign-2']);
    expect(checkinQuery.in).toHaveBeenCalledWith('registration_id', ['registration-1']);
  });
});
