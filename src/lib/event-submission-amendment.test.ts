import { describe, expect, it } from 'vitest';
import {
  amendmentReplacesCover,
  compareEventAmendment,
  dateTimeInputInTimeZoneToIso,
  isoToDateTimeInputInTimeZone,
} from './event-submission-amendment';

describe('event submission amendment presentation', () => {
  const baseline = {
    starts_at: '2026-09-21T17:00:00.000Z',
    ends_at: '2026-09-21T18:00:00.000Z',
    timezone: 'Africa/Accra',
    location_type: 'in_person',
    venue_name: 'Fido, Accra',
    venue_address: 'Osu, Accra',
    online_url: null,
    registration_url: 'https://example.com/register',
    cover_url: 'https://cdn.example.test/current.jpg',
  };

  it('does not report a cover change when no replacement was uploaded', () => {
    expect(amendmentReplacesCover('https://cdn.example.test/current.jpg', null)).toBe(false);
    expect(amendmentReplacesCover('https://cdn.example.test/current.jpg', '')).toBe(false);
  });

  it('reports only an actual replacement cover', () => {
    expect(amendmentReplacesCover(null, 'https://cdn.example.test/new.jpg')).toBe(true);
    expect(amendmentReplacesCover('https://cdn.example.test/current.jpg', 'https://cdn.example.test/new.jpg')).toBe(true);
    expect(amendmentReplacesCover('https://cdn.example.test/current.jpg', 'https://cdn.example.test/current.jpg')).toBe(false);
  });

  it('marks a venue-only amendment as a location change without a schedule change', () => {
    const changes = compareEventAmendment(baseline, { ...baseline, venue_name: 'Accra Digital Center' });

    expect(changes.location).toBe(true);
    expect(changes.schedule).toBe(false);
  });

  it('treats equivalent ISO instants as unchanged even when their strings differ', () => {
    const changes = compareEventAmendment(baseline, {
      ...baseline,
      starts_at: '2026-09-21T17:00:00+00:00',
      ends_at: '2026-09-21T19:00:00+01:00',
    });

    expect(changes.schedule).toBe(false);
  });

  it('detects a timezone-only change as a schedule change', () => {
    expect(compareEventAmendment(baseline, { ...baseline, timezone: 'Europe/London' }).schedule).toBe(true);
  });

  it('normalizes empty and null optional values before comparing', () => {
    const changes = compareEventAmendment({ ...baseline, venue_address: '  ', online_url: '' }, {
      ...baseline,
      venue_address: null,
      online_url: null,
      registration_url: '  ',
    });

    expect(changes.location).toBe(false);
    expect(changes.onlineUrl).toBe(false);
    expect(changes.registrationUrl).toBe(true);
  });

  it('treats a missing amendment cover as unchanged and compares replacements to the current cover', () => {
    expect(compareEventAmendment(baseline, { ...baseline, cover_url: null }).cover).toBe(false);
    expect(compareEventAmendment(baseline, { ...baseline, cover_url: 'https://cdn.example.test/new.jpg' }).cover).toBe(true);
  });

  it('round-trips a stored instant through the event time-zone picker without shifting it', () => {
    const storedInstant = '2026-09-21T17:00:00.000Z';

    expect(isoToDateTimeInputInTimeZone(storedInstant, 'Europe/Berlin')).toBe('2026-09-21T19:00');
    expect(dateTimeInputInTimeZoneToIso('2026-09-21T19:00', 'Europe/Berlin')).toBe(storedInstant);
  });

  it('shows the same instant in Ghana when an organizer changes the selected zone', () => {
    const storedInstant = '2026-09-21T17:30:00.000Z';

    expect(isoToDateTimeInputInTimeZone(storedInstant, 'Europe/Berlin')).toBe('2026-09-21T19:30');
    expect(isoToDateTimeInputInTimeZone(storedInstant, 'Africa/Accra')).toBe('2026-09-21T17:30');
  });

  it('does not render invalid stored timestamps as editable dates', () => {
    expect(isoToDateTimeInputInTimeZone('not-a-date', 'Europe/Berlin')).toBe('');
  });

  it('preserves an unchanged instant in a repeated daylight-saving time', () => {
    const originalInstant = '2026-10-25T00:30:00.000Z';

    expect(isoToDateTimeInputInTimeZone(originalInstant, 'Europe/Berlin')).toBe('2026-10-25T02:30');
    expect(dateTimeInputInTimeZoneToIso('2026-10-25T02:30', 'Europe/Berlin', originalInstant)).toBe(originalInstant);
  });

  it('asks for an unambiguous replacement when a new time occurs twice', () => {
    expect(() => dateTimeInputInTimeZoneToIso('2026-10-25T02:30', 'Europe/Berlin'))
      .toThrow('occurs twice in Europe/Berlin');
  });
});
