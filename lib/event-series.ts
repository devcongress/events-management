import type { Event } from '@/types';

export const EVENT_SERIES_TYPES = ['monthly', 'quarterly', 'special'] as const;

export type EventSeriesType = (typeof EVENT_SERIES_TYPES)[number];

export const EVENT_SERIES_LABELS: Record<EventSeriesType, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  special: 'Special',
};

export const EVENT_SERIES_HELP_TEXT: Record<EventSeriesType, string> = {
  monthly: 'Use the standard monthly meetup flow, including monthly attendance tracking.',
  quarterly: 'Use the lighter quarterly flow for broader checkpoint events.',
  special: 'Use this for one-off events that should not be treated like the monthly series.',
};

export function isEventSeriesType(value: unknown): value is EventSeriesType {
  return typeof value === 'string' && EVENT_SERIES_TYPES.includes(value as EventSeriesType);
}

export function inferEventSeriesType(name: string | null | undefined): EventSeriesType {
  return /quarterly/i.test(name ?? '') ? 'quarterly' : 'monthly';
}

export function resolveEventSeriesType(event: Pick<Event, 'name' | 'series_type'>): EventSeriesType {
  return isEventSeriesType(event.series_type) ? event.series_type : inferEventSeriesType(event.name);
}
