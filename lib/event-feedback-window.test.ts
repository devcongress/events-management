import { describe, expect, it } from 'vitest';
import {
  feedbackCampaignWindow,
  isFeedbackCampaignOpen,
  MONTHLY_FEEDBACK_WINDOW_MS,
} from './event-feedback-window';
import type { Event, FeedbackCampaign } from '@/types';

const monthlyEvent: Event = {
  id: 'event-1',
  name: 'DevCongress July Meetup',
  description: null,
  event_date: '2026-07-25T14:00:00.000Z',
  end_date: '2026-07-25T17:00:00.000Z',
  series_type: 'monthly',
  status: 'completed',
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-25T17:00:00.000Z',
};

const draftCampaign: FeedbackCampaign = {
  id: 'campaign-1',
  event_id: monthlyEvent.id,
  title: 'How was the meetup?',
  intro: null,
  status: 'draft',
  auto_open_on_event_completion: true,
  opens_at: null,
  closes_at: null,
  questions: [],
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
};

describe('event feedback window', () => {
  it('opens a monthly draft at event end and closes it 24 hours later', () => {
    expect(feedbackCampaignWindow(monthlyEvent, draftCampaign)).toEqual({
      opens_at: monthlyEvent.end_date,
      closes_at: '2026-07-26T17:00:00.000Z',
    });
  });

  it('keeps the automatic monthly form closed before and after its window', () => {
    expect(isFeedbackCampaignOpen(
      monthlyEvent,
      draftCampaign,
      new Date('2026-07-25T16:59:59.000Z').getTime(),
    )).toBe(false);
    expect(isFeedbackCampaignOpen(
      monthlyEvent,
      draftCampaign,
      new Date('2026-07-25T18:00:00.000Z').getTime(),
    )).toBe(true);
    expect(isFeedbackCampaignOpen(
      monthlyEvent,
      draftCampaign,
      new Date('2026-07-26T17:00:01.000Z').getTime(),
    )).toBe(false);
  });

  it('applies the monthly close boundary to manually published forms', () => {
    const activeCampaign = { ...draftCampaign, status: 'active' as const };

    expect(feedbackCampaignWindow(monthlyEvent, activeCampaign)).toEqual({
      opens_at: null,
      closes_at: '2026-07-26T17:00:00.000Z',
    });
  });

  it('lets an explicit 24-hour reopen window override the event boundary', () => {
    const reopenedAt = new Date('2026-07-28T09:00:00.000Z');
    const closesAt = new Date(reopenedAt.getTime() + MONTHLY_FEEDBACK_WINDOW_MS);
    const reopenedCampaign = {
      ...draftCampaign,
      status: 'active' as const,
      opens_at: reopenedAt.toISOString(),
      closes_at: closesAt.toISOString(),
    };

    expect(feedbackCampaignWindow(monthlyEvent, reopenedCampaign)).toEqual({
      opens_at: reopenedAt.toISOString(),
      closes_at: closesAt.toISOString(),
    });
    expect(isFeedbackCampaignOpen(
      monthlyEvent,
      reopenedCampaign,
      new Date('2026-07-28T12:00:00.000Z').getTime(),
    )).toBe(true);
  });

  it('keeps a closed campaign closed even while its time window is current', () => {
    expect(isFeedbackCampaignOpen(
      monthlyEvent,
      { ...draftCampaign, status: 'closed' },
      new Date('2026-07-25T18:00:00.000Z').getTime(),
    )).toBe(false);
  });

  it('does not impose the monthly default on quarterly or special events', () => {
    const quarterlyEvent = {
      ...monthlyEvent,
      id: 'event-quarterly',
      name: 'Quarterly Meetup',
      series_type: 'quarterly' as const,
    };
    const activeCampaign = { ...draftCampaign, status: 'active' as const };

    expect(feedbackCampaignWindow(quarterlyEvent, activeCampaign)).toEqual({
      opens_at: null,
      closes_at: null,
    });
    expect(isFeedbackCampaignOpen(
      quarterlyEvent,
      activeCampaign,
      new Date('2027-01-01T00:00:00.000Z').getTime(),
    )).toBe(true);
  });
});
