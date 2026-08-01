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
    expect(content.html).toContain('Download .ics');
    expect(content.html).toContain('prefers-color-scheme:dark');
    expect(content.html).toContain('>When<');
    expect(content.html).toContain('>Where<');
    expect(content.text).toContain('Venue <update>');
    expect(content.text).toContain('Unsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}');
  });
});
