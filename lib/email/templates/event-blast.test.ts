import { describe, expect, it } from 'vitest';
import { eventBlastEmail } from './event-blast';

describe('event blast email template', () => {
  it('uses the same escaped message in HTML and text output', () => {
    const content = eventBlastEmail({
      subject: 'Venue <update>',
      body: 'Hi,\n\nBring <nothing>.',
      unsubscribeUrl: '{{{RESEND_UNSUBSCRIBE_URL}}}',
      eventName: 'DevCongress July Meetup',
      eventDate: '2026-07-30T08:30:00.000Z',
      eventEndDate: '2026-07-30T16:00:00.000Z',
      locationName: 'Fido, Accra',
      locationUrl: 'https://www.google.com/maps/place/Accra',
      eventUrl: 'https://em.devcongress.org/r/july-meetup?view=details',
      calendarDownloadUrl: 'https://em.devcongress.org/api/registration/events/july-meetup/calendar.ics',
    });

    expect(content.html).toContain('Venue &lt;update&gt;');
    expect(content.html).toContain('Bring &lt;nothing&gt;.');
    expect(content.html).toContain('Hi,<br><br>Bring');
    expect(content.html.match(/Hi,/g)).toHaveLength(1);
    expect(content.html).toContain('RESEND_UNSUBSCRIBE_URL');
    expect(content.html).toContain('logo-nav%402x.png');
    expect(content.html).toContain('Community update');
    expect(content.html).toContain('Google Calendar');
    expect(content.html).toContain('Apple Calendar (.ics)');
    expect(content.html).toContain('Outlook / other apps (.ics)');
    expect(content.html).toContain('src="https://em.devcongress.org/brand/calendar/google-calendar.png"');
    expect(content.html).toContain('src="https://em.devcongress.org/brand/calendar/apple.png"');
    expect(content.html).toContain('src="https://em.devcongress.org/brand/calendar/outlook.png"');
    expect(content.html.match(/width="20" height="20" alt="" aria-hidden="true"/g)).toHaveLength(3);
    expect(content.html).toContain('Calendar downloads are one-time imports and do not update automatically.');
    expect(content.html).toContain('prefers-color-scheme:dark');
    expect(content.html).toContain('>When<');
    expect(content.html).toContain('>Where<');
    expect(content.text).toContain('Venue <update>');
    expect(content.text).toContain('Apple Calendar (.ics): https://em.devcongress.org/api/registration/events/july-meetup/calendar.ics');
    expect(content.text).toContain('Outlook / other apps (.ics): https://em.devcongress.org/api/registration/events/july-meetup/calendar.ics');
    expect(content.text).toContain('Unsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}');

    const googleTextUrl = content.text.split('\n').find((line) => line.startsWith('Add to Google Calendar: '))!.replace('Add to Google Calendar: ', '');
    const googleHtmlUrl = content.html.match(/href="(https:\/\/calendar\.google\.com\/calendar\/render\?[^\"]+)"/)?.[1].replaceAll('&amp;', '&');

    expect(googleHtmlUrl).toBe(googleTextUrl);
  });

  it('uses the safe event calendar URL for Apple and Outlook imports', () => {
    const calendarDownloadUrl = 'https://em.devcongress.org/api/registration/events/july-meetup/calendar.ics?source=blast&variant=calendar';
    const content = eventBlastEmail({
      subject: 'July update',
      body: 'See you there.',
      unsubscribeUrl: 'https://em.devcongress.org/unsubscribe/recipient',
      eventName: 'DevCongress July Meetup',
      eventDate: '2026-07-30T08:30:00.000Z',
      eventEndDate: '2026-07-30T16:00:00.000Z',
      locationName: 'Fido, Accra',
      calendarDownloadUrl,
    });

    expect(content.html.match(/href="https:\/\/em\.devcongress\.org\/api\/registration\/events\/july-meetup\/calendar\.ics\?source=blast&amp;variant=calendar"/g)).toHaveLength(2);
    expect(content.text).toContain(`Apple Calendar (.ics): ${calendarDownloadUrl}`);
    expect(content.text).toContain(`Outlook / other apps (.ics): ${calendarDownloadUrl}`);
  });

  it('omits calendar imports for missing or unsafe calendar URLs', () => {
    for (const calendarDownloadUrl of [undefined, null, '', 'javascript:alert(1)', 'data:text/calendar,unsafe', 'https://user:password@em.devcongress.org/calendar.ics']) {
      const content = eventBlastEmail({
        subject: 'July update',
        body: 'See you there.',
        unsubscribeUrl: 'https://em.devcongress.org/unsubscribe/recipient',
        eventName: 'DevCongress July Meetup',
        eventDate: '2026-07-30T08:30:00.000Z',
        locationName: 'Fido, Accra',
        calendarDownloadUrl,
      });

      expect(content.html).not.toContain('Apple Calendar (.ics)');
      expect(content.html).not.toContain('Outlook / other apps (.ics)');
      expect(content.html).not.toContain('Calendar downloads are one-time imports');
      expect(content.html).not.toContain('/brand/calendar/apple.png');
      expect(content.html).not.toContain('/brand/calendar/outlook.png');
      expect(content.text).not.toContain('Apple Calendar (.ics)');
      expect(content.text).not.toContain('Outlook / other apps (.ics)');
    }
  });

  it('omits Google Calendar for invalid dates while retaining safe calendar imports', () => {
    const calendarDownloadUrl = 'https://em.devcongress.org/api/registration/events/july-meetup/calendar.ics';
    const content = eventBlastEmail({
      subject: 'July update',
      body: 'See you there.',
      unsubscribeUrl: 'https://em.devcongress.org/unsubscribe/recipient',
      eventName: 'DevCongress July Meetup',
      eventDate: 'not-a-date',
      locationName: 'Fido, Accra',
      calendarDownloadUrl,
    });

    expect(content.html).not.toContain('Google Calendar');
    expect(content.text).not.toContain('Add to Google Calendar:');
    expect(content.html).toContain('Apple Calendar (.ics)');
    expect(content.html).toContain('Outlook / other apps (.ics)');
  });

  it('uses all-day and fallback end ranges for Google Calendar', () => {
    const allDayContent = eventBlastEmail({
      subject: 'All-day event',
      body: 'See you there.',
      unsubscribeUrl: 'https://em.devcongress.org/unsubscribe/recipient',
      eventName: 'DevCongress July Meetup',
      eventDate: '2026-07-30',
      eventEndDate: 'not-a-date',
      locationName: 'Fido, Accra',
    });
    const fallbackEndContent = eventBlastEmail({
      subject: 'Timed event',
      body: 'See you there.',
      unsubscribeUrl: 'https://em.devcongress.org/unsubscribe/recipient',
      eventName: 'DevCongress July Meetup',
      eventDate: '2026-07-30T08:30:00.000Z',
      eventEndDate: '2026-07-30T08:30:00.000Z',
      locationName: 'Fido, Accra',
    });

    const allDayUrl = new URL(allDayContent.text.split('\n').find((line) => line.startsWith('Add to Google Calendar: '))!.replace('Add to Google Calendar: ', ''));
    const fallbackEndUrl = new URL(fallbackEndContent.text.split('\n').find((line) => line.startsWith('Add to Google Calendar: '))!.replace('Add to Google Calendar: ', ''));

    expect(allDayUrl.searchParams.get('dates')).toBe('20260730/20260731');
    expect(fallbackEndUrl.searchParams.get('dates')).toBe('20260730T083000Z/20260730T113000Z');
  });

  it('sanitizes calendar-facing event text in the Google Calendar destination', () => {
    const content = eventBlastEmail({
      subject: 'July update',
      body: 'See you there.',
      unsubscribeUrl: 'https://em.devcongress.org/unsubscribe/recipient',
      eventName: 'DevCongress <July>\r\nMeetup',
      eventDate: '2026-07-30T08:30:00.000Z',
      locationName: 'Fido <Accra>',
    });
    const googleUrl = new URL(content.text.split('\n').find((line) => line.startsWith('Add to Google Calendar: '))!.replace('Add to Google Calendar: ', ''));

    expect(googleUrl.searchParams.get('text')).toBe('DevCongress <July> Meetup');
    expect(googleUrl.searchParams.get('location')).toBe('Fido <Accra>');
  });
});
