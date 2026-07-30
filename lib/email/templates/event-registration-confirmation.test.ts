import { describe, expect, it } from 'vitest';
import {
  eventRegistrationCalendarFile,
  eventRegistrationConfirmationEmail,
} from './event-registration-confirmation';

const confirmedInput = {
  attendeeName: 'Ama Mensah',
  eventName: 'DevCongress May Meetup',
  eventDate: '2024-05-03T18:00:00.000Z',
  eventEndDate: '2024-05-03T21:00:00.000Z',
  locationName: 'buro, Accra',
  locationUrl: 'https://www.google.com/maps/place/buro/?q=accra',
  eventUrl: 'https://devcongress.org/meetups/may-2024',
  calendarDownloadUrl: 'https://events.devcongress.org/api/registration/events/may-2024/calendar.ics',
  status: 'confirmed' as const,
};

describe('event registration confirmation email', () => {
  it('renders a branded confirmation with date, time, map, and calendar actions', () => {
    const content = eventRegistrationConfirmationEmail(confirmedInput);

    expect(content.subject).toBe('You are registered for DevCongress May Meetup');
    expect(content.html).toContain('Registration confirmed');
    expect(content.html).toContain('src="https://devcongress.org/images/logo-nav%402x.png"');
    expect(content.html).toContain('alt="DevCongress"');
    expect(content.html).toContain('Friday, May 3, 2024');
    expect(content.html).toContain('6:00 PM – 9:00 PM GMT');
    expect(content.html).toContain('buro, Accra');
    expect(content.html).toContain('View map ↗');
    expect(content.html).toContain('Google Calendar');
    expect(content.html).toContain('Download .ics');
    expect(content.text).not.toMatch(/QR code|confirmation code/i);
    expect(content.html).not.toMatch(/QR code|confirmation code/i);

    const googleLine = content.text
      .split('\n')
      .find((line) => line.startsWith('Add to Google Calendar: '));
    expect(googleLine).toBeDefined();
    const googleUrl = new URL(googleLine!.replace('Add to Google Calendar: ', ''));
    expect(googleUrl.origin).toBe('https://calendar.google.com');
    expect(googleUrl.searchParams.get('action')).toBe('TEMPLATE');
    expect(googleUrl.searchParams.get('text')).toBe('DevCongress May Meetup');
    expect(googleUrl.searchParams.get('dates')).toBe('20240503T180000Z/20240503T210000Z');
    expect(googleUrl.searchParams.get('location')).toBe('buro, Accra');
    expect(googleUrl.searchParams.get('details')).toContain('https://devcongress.org/meetups/may-2024');
  });

  it('keeps waitlist language and does not imply a confirmed calendar booking', () => {
    const content = eventRegistrationConfirmationEmail({
      ...confirmedInput,
      status: 'waitlisted',
    });

    expect(content.subject).toBe('You are on the waitlist for DevCongress May Meetup');
    expect(content.html).toContain('You’re on the waitlist.');
    expect(content.text).toContain('We’ll email you if a place becomes available.');
    expect(content.html).not.toContain('Google Calendar');
    expect(content.html).not.toContain('Download .ics');
    expect(content.text).not.toContain('ADD TO CALENDAR');
  });

  it('renders a distinct promotion notice with confirmed-place calendar actions', () => {
    const content = eventRegistrationConfirmationEmail({
      ...confirmedInput,
      kind: 'promotion',
    });

    expect(content.subject).toBe('A place opened up for DevCongress May Meetup');
    expect(content.html).toContain('Place available');
    expect(content.html).toContain('You’re off the waitlist.');
    expect(content.text).toContain('A place became available and is now saved for you.');
    expect(content.html).toContain('Google Calendar');
    expect(content.html).toContain('Download .ics');
  });

  it('escapes display content and drops unsafe or non-map links', () => {
    const content = eventRegistrationConfirmationEmail({
      attendeeName: 'Ama\r\nBcc: attacker@example.com <script>',
      eventName: 'Meetup\r\nInjected <img src=x onerror=alert(1)>',
      eventDate: '2026-08-29',
      locationName: '<b>Secret venue</b>',
      locationUrl: 'https://evil.example/maps/accra',
      eventUrl: 'javascript:alert(1)',
      calendarDownloadUrl: 'data:text/calendar,unsafe',
      status: 'confirmed',
    });

    expect(content.subject).not.toMatch(/[\r\n]/);
    expect(content.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(content.html).toContain('&lt;b&gt;Secret venue&lt;/b&gt;');
    expect(content.html).not.toContain('<img src=x');
    expect(content.html).not.toContain('<b>Secret venue</b>');
    expect(content.html).not.toContain('evil.example');
    expect(content.html).not.toContain('javascript:');
    expect(content.html).not.toContain('data:text/calendar');
    expect(content.html).not.toContain('Download .ics');
    expect(content.html).toContain('Google Calendar');
    expect(content.text).toContain('Time to be announced');
  });
});

describe('event registration calendar file', () => {
  it('creates an escaped timed event and uses the documented three-hour fallback', () => {
    const file = eventRegistrationCalendarFile({
      eventId: 'event\r\nmalicious',
      eventName: 'DevCongress, APIs; and \\ Security',
      eventDate: '2026-08-29T18:00:00.000Z',
      locationName: 'Accra Digital Centre, Accra',
      eventUrl: 'https://devcongress.org/r/august-2026',
      updatedAt: '2026-07-28T10:00:00.000Z',
    });

    expect(file?.filename).toBe('devcongress-apis-and-security.ics');
    expect(file?.content).toContain('UID:event-malicious@devcongress.org\r\n');
    expect(file?.content).toContain('DTSTAMP:20260728T100000Z\r\n');
    expect(file?.content).toContain('DTSTART:20260829T180000Z\r\n');
    expect(file?.content).toContain('DTEND:20260829T210000Z\r\n');
    expect(file?.content).toContain('SUMMARY:DevCongress\\, APIs\\; and \\\\ Security\r\n');
    expect(file?.content).toContain('LOCATION:Accra Digital Centre\\, Accra\r\n');
    expect(file?.content).toContain('STATUS:CONFIRMED\r\n');
    expect(file?.content.endsWith('\r\n')).toBe(true);
  });

  it('uses an exclusive next-day end for all-day calendar entries', () => {
    const file = eventRegistrationCalendarFile({
      eventId: 'event-1',
      eventName: 'DevCongress August Meetup',
      eventDate: '2026-08-29',
      locationName: 'Accra',
    });

    expect(file?.content).toContain('DTSTART;VALUE=DATE:20260829\r\n');
    expect(file?.content).toContain('DTEND;VALUE=DATE:20260830\r\n');
  });

  it('rejects invalid event dates instead of publishing a broken calendar file', () => {
    expect(eventRegistrationCalendarFile({
      eventId: 'event-1',
      eventName: 'DevCongress Meetup',
      eventDate: 'not-a-date',
      locationName: 'Accra',
    })).toBeNull();
  });
});
