import { describe, expect, it } from 'vitest';
import {
  amendmentReplacesCover,
  dateTimeInputInTimeZoneToIso,
  isoToDateTimeInputInTimeZone,
} from './event-submission-amendment';

describe('event submission amendment presentation', () => {
  it('does not report a cover change when no replacement was uploaded', () => {
    expect(amendmentReplacesCover('https://cdn.example.test/current.jpg', null)).toBe(false);
    expect(amendmentReplacesCover('https://cdn.example.test/current.jpg', '')).toBe(false);
  });

  it('reports only an actual replacement cover', () => {
    expect(amendmentReplacesCover(null, 'https://cdn.example.test/new.jpg')).toBe(true);
    expect(amendmentReplacesCover('https://cdn.example.test/current.jpg', 'https://cdn.example.test/new.jpg')).toBe(true);
    expect(amendmentReplacesCover('https://cdn.example.test/current.jpg', 'https://cdn.example.test/current.jpg')).toBe(false);
  });

  it('round-trips a stored instant through the event time-zone picker without shifting it', () => {
    const storedInstant = '2026-09-21T17:00:00.000Z';

    expect(isoToDateTimeInputInTimeZone(storedInstant, 'Europe/Berlin')).toBe('2026-09-21T19:00');
    expect(dateTimeInputInTimeZoneToIso('2026-09-21T19:00', 'Europe/Berlin')).toBe(storedInstant);
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
