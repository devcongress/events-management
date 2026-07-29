import type { Event } from '@/types';

export const EVENT_SERIES_TYPES = ['monthly', 'quarterly', 'special'] as const;

export type EventSeriesType = (typeof EVENT_SERIES_TYPES)[number];

export const EVENT_SERIES_SELECTIONS = [...EVENT_SERIES_TYPES, 'none'] as const;

export type EventSeriesSelection = (typeof EVENT_SERIES_SELECTIONS)[number];

export const EVENT_SERIES_LABELS: Record<EventSeriesSelection, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  special: 'Special',
  none: 'None of these',
};

export const EVENT_SERIES_HELP_TEXT: Record<EventSeriesSelection, string> = {
  monthly: 'Use the standard monthly meetup flow, including monthly attendance tracking.',
  quarterly: 'Use the lighter quarterly flow for broader checkpoint events.',
  special: 'Use this for an official one-off DevCongress event that intentionally belongs to the special series.',
  none: 'Use this when the event does not belong to any recurring DevCongress series.',
};

export function isEventSeriesType(value: unknown): value is EventSeriesType {
  return typeof value === 'string' && EVENT_SERIES_TYPES.includes(value as EventSeriesType);
}

export function inferEventSeriesType(name: string | null | undefined): EventSeriesType {
  return /quarterly/i.test(name ?? '') ? 'quarterly' : 'monthly';
}

export function resolveEventSeriesType(event: Pick<Event, 'name' | 'series_type'>): EventSeriesType | null {
  if (event.series_type === null) return null;
  return isEventSeriesType(event.series_type) ? event.series_type : inferEventSeriesType(event.name);
}

export function eventSeriesValueToSelection(value: EventSeriesType | null): EventSeriesSelection {
  return value ?? 'none';
}

export function eventSeriesSelectionToValue(value: EventSeriesSelection): EventSeriesType | null {
  return value === 'none' ? null : value;
}
