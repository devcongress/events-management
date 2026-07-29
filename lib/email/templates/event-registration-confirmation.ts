import { safeGoogleMapsUrl } from '@/lib/location-links';
import type { EventRegistrationStatus } from '@/types';

const EVENT_TIME_ZONE = 'Africa/Accra';
const DEFAULT_EVENT_DURATION_MS = 3 * 60 * 60 * 1000;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type EventCalendarDetails = {
  eventName: string;
  eventDate: string;
  eventEndDate?: string | null;
  locationName: string;
  eventUrl?: string | null;
};

export type EventRegistrationEmailInput = EventCalendarDetails & {
  attendeeName: string;
  status: EventRegistrationStatus;
  locationUrl?: string | null;
  calendarDownloadUrl?: string | null;
};

export type EventRegistrationCalendarInput = EventCalendarDetails & {
  eventId: string;
  updatedAt?: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function textLine(value: string, fallback = ''): string {
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || fallback;
}

function safeHttpUrl(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate || candidate.length > 2048) return null;

  try {
    const url = new URL(candidate);
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:')
      || url.username
      || url.password
      || !url.hostname
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function validDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function eventDateRange(input: Pick<EventCalendarDetails, 'eventDate' | 'eventEndDate'>): {
  start: Date;
  end: Date;
  allDay: boolean;
} | null {
  const start = validDate(input.eventDate);
  if (!start) return null;

  const allDay = DATE_ONLY_PATTERN.test(input.eventDate);
  if (allDay) {
    const end = validDate(input.eventEndDate);
    const inclusiveEnd = end && end.getTime() >= start.getTime() ? end : start;
    return {
      start,
      end: new Date(inclusiveEnd.getTime() + 24 * 60 * 60 * 1000),
      allDay: true,
    };
  }

  const suppliedEnd = validDate(input.eventEndDate);
  return {
    start,
    end: suppliedEnd && suppliedEnd.getTime() > start.getTime()
      ? suppliedEnd
      : new Date(start.getTime() + DEFAULT_EVENT_DURATION_MS),
    allDay: false,
  };
}

function formatEventSchedule(input: Pick<EventCalendarDetails, 'eventDate' | 'eventEndDate'>): {
  dateLabel: string;
  monthLabel: string;
  dayLabel: string;
  timeLabel: string;
} {
  const range = eventDateRange(input);
  if (!range) {
    return {
      dateLabel: 'Date to be announced',
      monthLabel: 'TBA',
      dayLabel: '—',
      timeLabel: 'Time to be announced',
    };
  }

  const dateLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: EVENT_TIME_ZONE,
  }).format(range.start);
  const monthLabel = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    timeZone: EVENT_TIME_ZONE,
  }).format(range.start).toUpperCase();
  const dayLabel = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    timeZone: EVENT_TIME_ZONE,
  }).format(range.start);

  if (range.allDay) {
    return { dateLabel, monthLabel, dayLabel, timeLabel: 'Time to be announced' };
  }

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: EVENT_TIME_ZONE,
  });
  const startTime = timeFormatter.format(range.start);
  const endTime = timeFormatter.format(range.end);

  return {
    dateLabel,
    monthLabel,
    dayLabel,
    timeLabel: `${startTime} – ${endTime} GMT`,
  };
}

function toCalendarDate(date: Date, allDay: boolean): string {
  if (allDay) return date.toISOString().slice(0, 10).replaceAll('-', '');
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function googleCalendarUrl(input: EventCalendarDetails): string | null {
  const range = eventDateRange(input);
  if (!range) return null;

  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', textLine(input.eventName, 'DevCongress event'));
  url.searchParams.set(
    'dates',
    `${toCalendarDate(range.start, range.allDay)}/${toCalendarDate(range.end, range.allDay)}`,
  );
  url.searchParams.set(
    'details',
    [
      'Your place is confirmed for this DevCongress event.',
      safeHttpUrl(input.eventUrl) ? `Event details: ${safeHttpUrl(input.eventUrl)}` : null,
    ].filter(Boolean).join('\n\n'),
  );
  url.searchParams.set('location', textLine(input.locationName, 'Location to be announced'));
  return url.toString();
}

function escapeIcsText(value: string): string {
  return textLine(value)
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,');
}

function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const segments: string[] = [];
  let segment = '';
  let bytes = 0;

  for (const character of Array.from(line)) {
    const characterBytes = encoder.encode(character).byteLength;
    const limit = segments.length === 0 ? 75 : 74;
    if (segment && bytes + characterBytes > limit) {
      segments.push(segment);
      segment = character;
      bytes = characterBytes;
    } else {
      segment += character;
      bytes += characterBytes;
    }
  }
  if (segment) segments.push(segment);

  return segments.join('\r\n ');
}

function calendarFilename(eventName: string): string {
  const slug = textLine(eventName, 'devcongress-event')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'devcongress-event'}.ics`;
}

export function eventRegistrationCalendarFile(input: EventRegistrationCalendarInput): {
  filename: string;
  content: string;
} | null {
  const range = eventDateRange(input);
  if (!range) return null;

  const eventName = textLine(input.eventName, 'DevCongress event');
  const eventId = textLine(input.eventId, 'event').replace(/[^a-zA-Z0-9._-]+/g, '-');
  const eventUrl = safeHttpUrl(input.eventUrl);
  const updatedAt = validDate(input.updatedAt) ?? range.start;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DevCongress//Event Registration//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${eventId}@devcongress.org`,
    `DTSTAMP:${toCalendarDate(updatedAt, false)}`,
    range.allDay
      ? `DTSTART;VALUE=DATE:${toCalendarDate(range.start, true)}`
      : `DTSTART:${toCalendarDate(range.start, false)}`,
    range.allDay
      ? `DTEND;VALUE=DATE:${toCalendarDate(range.end, true)}`
      : `DTEND:${toCalendarDate(range.end, false)}`,
    `SUMMARY:${escapeIcsText(eventName)}`,
    `LOCATION:${escapeIcsText(input.locationName || 'Location to be announced')}`,
    'DESCRIPTION:Your place is confirmed for this DevCongress event.',
    ...(eventUrl ? [`URL:${escapeIcsText(eventUrl)}`] : []),
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return {
    filename: calendarFilename(eventName),
    content: `${lines.map(foldIcsLine).join('\r\n')}\r\n`,
  };
}

export function eventRegistrationConfirmationEmail(
  input: EventRegistrationEmailInput,
): { subject: string; html: string; text: string } {
  const waitlisted = input.status === 'waitlisted';
  const attendeeName = textLine(input.attendeeName, 'there');
  const eventName = textLine(input.eventName, 'DevCongress event');
  const locationName = textLine(input.locationName, 'Location to be announced');
  const subject = waitlisted
    ? `You are on the waitlist for ${eventName}`
    : `You are registered for ${eventName}`;
  const heading = waitlisted ? 'You’re on the waitlist.' : 'You’re in. See you there!';
  const statusLine = waitlisted
    ? 'We’ll email you if a place becomes available.'
    : 'Your place is saved. Here’s everything you need for the day.';
  const schedule = formatEventSchedule(input);
  const mapUrl = safeGoogleMapsUrl(input.locationUrl);
  const eventUrl = safeHttpUrl(input.eventUrl);
  const calendarUrl = waitlisted ? null : googleCalendarUrl(input);
  const calendarDownloadUrl = waitlisted ? null : safeHttpUrl(input.calendarDownloadUrl);

  const plainTextCalendar = [
    calendarUrl ? `Add to Google Calendar: ${calendarUrl}` : null,
    calendarDownloadUrl ? `Download calendar file: ${calendarDownloadUrl}` : null,
  ].filter(Boolean);

  const text = [
    `Hi ${attendeeName},`,
    '',
    heading,
    statusLine,
    '',
    eventName,
    '',
    'DATE & TIME',
    schedule.dateLabel,
    schedule.timeLabel,
    '',
    'LOCATION',
    locationName,
    ...(mapUrl ? [`View map: ${mapUrl}`] : []),
    ...(eventUrl ? ['', `Event details: ${eventUrl}`] : []),
    ...(plainTextCalendar.length ? ['', 'ADD TO CALENDAR', ...plainTextCalendar] : []),
    '',
    'See you in the community,',
    'DevCongress',
  ].join('\n');

  const safe = {
    attendeeName: escapeHtml(attendeeName),
    eventName: escapeHtml(eventName),
    locationName: escapeHtml(locationName),
    dateLabel: escapeHtml(schedule.dateLabel),
    monthLabel: escapeHtml(schedule.monthLabel),
    dayLabel: escapeHtml(schedule.dayLabel),
    timeLabel: escapeHtml(schedule.timeLabel),
    mapUrl: mapUrl ? escapeHtml(mapUrl) : null,
    eventUrl: eventUrl ? escapeHtml(eventUrl) : null,
    calendarUrl: calendarUrl ? escapeHtml(calendarUrl) : null,
    calendarDownloadUrl: calendarDownloadUrl ? escapeHtml(calendarDownloadUrl) : null,
  };

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${escapeHtml(subject)}</title>
    <style>
      :root { color-scheme: light dark; supported-color-schemes: light dark; }
      @media only screen and (max-width: 620px) {
        .email-wrap { padding: 16px 10px !important; }
        .email-pad { padding: 28px 22px !important; }
        .email-heading { font-size: 31px !important; }
        .calendar-action { display: block !important; width: 100% !important; padding: 0 0 10px !important; }
        .calendar-action a { display: block !important; text-align: center !important; }
      }
      @media (prefers-color-scheme: dark) {
        .email-body, .email-canvas { background: #111111 !important; }
        .email-shell, .email-content { background: #1C1C1C !important; border-color: #3A3A3A !important; }
        .email-heading, .email-title, .email-detail-title { color: #E5E5E5 !important; }
        .email-copy, .email-detail-copy, .email-footer { color: #A1A1A1 !important; }
        .email-detail { background: #262626 !important; border-color: #3A3A3A !important; }
        .email-date-tile { background: #F5E642 !important; }
        .email-secondary-action { color: #E5E5E5 !important; border-color: #666666 !important; }
      }
    </style>
  </head>
  <body class="email-body" style="margin:0;background:#F5F2E8;color:#111111;font-family:Inter,'Helvetica Neue',Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${escapeHtml(waitlisted ? `Waitlist details for ${eventName}.` : `Your date, time, location, and calendar links for ${eventName}.`)}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#F5F2E8" class="email-canvas" style="width:100%;background:#F5F2E8;">
      <tr>
        <td align="center" class="email-wrap" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#FFFFFF" class="email-shell" style="width:100%;max-width:620px;background:#FFFFFF;border:2px solid #111111;border-radius:8px;border-collapse:separate;overflow:hidden;">
            <tr>
              <td bgcolor="#111111" style="padding:21px 30px;background:#111111;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="color:#FFFFFF;font-size:22px;font-weight:800;letter-spacing:-.02em;">DevCongress<span style="color:#E8117F;">.</span></td>
                    <td align="right" style="color:#FFFFFF;font-family:'Courier New',monospace;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">Community RSVP</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="font-size:0;line-height:0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="52%" height="6" bgcolor="#E8117F" style="height:6px;background:#E8117F;">&nbsp;</td>
                    <td width="18%" height="6" bgcolor="#6A38F0" style="height:6px;background:#6A38F0;">&nbsp;</td>
                    <td width="30%" height="6" bgcolor="#F5E642" style="height:6px;background:#F5E642;">&nbsp;</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td bgcolor="#FFFFFF" class="email-content email-pad" style="padding:38px 38px 34px;background:#FFFFFF;">
                <p style="margin:0 0 10px;color:#C80D68;font-family:'Courier New',monospace;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">${waitlisted ? 'Waitlist update' : 'Registration confirmed'}</p>
                <h1 class="email-heading" style="margin:0 0 12px;color:#111111;font-size:38px;font-weight:800;line-height:1.08;letter-spacing:-.025em;">${escapeHtml(heading)}</h1>
                <p class="email-copy" style="margin:0 0 28px;color:#4B4B4B;font-size:17px;line-height:1.6;">Hi ${safe.attendeeName}, ${escapeHtml(statusLine)}</p>
                <p class="email-title" style="margin:0 0 16px;color:#111111;font-size:22px;font-weight:800;line-height:1.3;">${safe.eventName}</p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#F7F4EA" class="email-detail" style="width:100%;margin:0 0 12px;background:#F7F4EA;border:1px solid #D8D2C4;border-radius:8px;border-collapse:separate;">
                  <tr>
                    <td width="72" valign="middle" style="width:72px;padding:16px 0 16px 16px;">
                      <table role="presentation" width="56" cellspacing="0" cellpadding="0" bgcolor="#F5E642" class="email-date-tile" style="width:56px;background:#F5E642;border:1px solid #111111;border-radius:8px;border-collapse:separate;overflow:hidden;">
                        <tr><td align="center" style="padding:5px 4px 3px;color:#111111;font-family:'Courier New',monospace;font-size:9px;font-weight:700;letter-spacing:.1em;">${safe.monthLabel}</td></tr>
                        <tr><td align="center" style="padding:2px 4px 7px;color:#111111;font-size:24px;font-weight:800;line-height:1;">${safe.dayLabel}</td></tr>
                      </table>
                    </td>
                    <td valign="middle" style="padding:16px 18px 16px 14px;">
                      <p class="email-detail-title" style="margin:0 0 5px;color:#111111;font-size:16px;font-weight:800;line-height:1.35;">${safe.dateLabel}</p>
                      <p class="email-detail-copy" style="margin:0;color:#666666;font-size:15px;line-height:1.4;">${safe.timeLabel}</p>
                    </td>
                  </tr>
                </table>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#F7F4EA" class="email-detail" style="width:100%;margin:0 0 24px;background:#F7F4EA;border:1px solid #D8D2C4;border-radius:8px;border-collapse:separate;">
                  <tr>
                    <td width="72" align="center" valign="middle" style="width:72px;padding:18px 0 18px 16px;">
                      <div style="width:54px;height:54px;border:1px solid #111111;border-radius:8px;color:#E8117F;font-size:27px;font-weight:800;line-height:54px;text-align:center;">⌖</div>
                    </td>
                    <td valign="middle" style="padding:17px 18px 17px 14px;">
                      <p style="margin:0 0 5px;color:#C80D68;font-family:'Courier New',monospace;font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">Location</p>
                      <p class="email-detail-title" style="margin:0;color:#111111;font-size:17px;font-weight:800;line-height:1.35;">${safe.locationName}</p>
                      ${safe.mapUrl ? `<p style="margin:7px 0 0;"><a href="${safe.mapUrl}" target="_blank" rel="noopener noreferrer" style="color:#C80D68;font-size:13px;font-weight:700;text-decoration:underline;">View map ↗</a></p>` : ''}
                    </td>
                  </tr>
                </table>

                ${safe.calendarUrl || safe.calendarDownloadUrl ? `
                <p style="margin:0 0 11px;color:#777777;font-family:'Courier New',monospace;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">Add to calendar</p>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                  <tr>
                    ${safe.calendarUrl ? `<td class="calendar-action" style="padding:0 10px 0 0;"><a href="${safe.calendarUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 18px;background:#E8117F;border:1px solid #E8117F;border-radius:6px;color:#FFFFFF;font-size:14px;font-weight:800;text-decoration:none;">Google Calendar</a></td>` : ''}
                    ${safe.calendarDownloadUrl ? `<td class="calendar-action"><a href="${safe.calendarDownloadUrl}" target="_blank" rel="noopener noreferrer" class="email-secondary-action" style="display:inline-block;padding:13px 18px;background:transparent;border:1px solid #111111;border-radius:6px;color:#111111;font-size:14px;font-weight:800;text-decoration:none;">Download .ics</a></td>` : ''}
                  </tr>
                </table>` : ''}

                ${safe.eventUrl ? `<p style="margin:0 0 26px;"><a href="${safe.eventUrl}" target="_blank" rel="noopener noreferrer" style="color:#C80D68;font-size:14px;font-weight:700;text-decoration:underline;">View event details ↗</a></p>` : ''}
                <p class="email-footer" style="margin:0;padding-top:22px;border-top:1px solid #DDD6C8;color:#777777;font-size:13px;line-height:1.6;">See you in the community,<br><strong style="color:#111111;">DevCongress</strong></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}
