import { resolveEventSeriesType } from './event-series';
import type { Event, FeedbackCampaign } from '@/types';

export const MONTHLY_FEEDBACK_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface EventFeedbackWindow {
  opens_at: string | null;
  closes_at: string | null;
}

function validDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function monthlyFeedbackAnchor(event: Pick<Event, 'event_date' | 'end_date'>): Date | null {
  return validDate(event.end_date) ?? validDate(event.event_date);
}

export function feedbackCampaignWindow(
  event: Pick<Event, 'name' | 'series_type' | 'event_date' | 'end_date'>,
  campaign: Pick<FeedbackCampaign, 'status' | 'auto_open_on_event_completion' | 'opens_at' | 'closes_at'>,
): EventFeedbackWindow {
  const explicitOpen = validDate(campaign.opens_at);
  const explicitClose = validDate(campaign.closes_at);

  if (resolveEventSeriesType(event) !== 'monthly') {
    return {
      opens_at: explicitOpen?.toISOString() ?? null,
      closes_at: explicitClose?.toISOString() ?? null,
    };
  }

  const eventEnd = monthlyFeedbackAnchor(event);
  const automaticOpen = campaign.status === 'draft' && campaign.auto_open_on_event_completion
    ? eventEnd
    : null;
  const automaticClose = eventEnd
    ? new Date(eventEnd.getTime() + MONTHLY_FEEDBACK_WINDOW_MS)
    : null;

  return {
    opens_at: (explicitOpen ?? automaticOpen)?.toISOString() ?? null,
    closes_at: (explicitClose ?? automaticClose)?.toISOString() ?? null,
  };
}

export function isFeedbackCampaignOpen(
  event: Pick<Event, 'name' | 'series_type' | 'event_date' | 'end_date' | 'status'>,
  campaign: Pick<FeedbackCampaign, 'status' | 'auto_open_on_event_completion' | 'opens_at' | 'closes_at'>,
  nowMs = Date.now(),
): boolean {
  const window = feedbackCampaignWindow(event, campaign);
  const opensAtMs = window.opens_at ? new Date(window.opens_at).getTime() : null;
  const closesAtMs = window.closes_at ? new Date(window.closes_at).getTime() : null;
  const afterOpen = opensAtMs === null || opensAtMs <= nowMs;
  const beforeClose = closesAtMs === null || closesAtMs >= nowMs;
  const statusOpen = campaign.status === 'active'
    || (
      campaign.status === 'draft'
      && campaign.auto_open_on_event_completion
      && event.status === 'completed'
    );

  return statusOpen && afterOpen && beforeClose;
}
