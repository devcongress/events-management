import { safeGoogleMapsUrl } from '@/lib/location-links';

const EVENT_TIME_ZONE = 'Africa/Accra';
const DEFAULT_EVENT_DURATION_MS = 3 * 60 * 60 * 1000;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEVCONGRESS_WORDMARK_URL = 'https://devcongress.org/images/logo-nav%402x.png';

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
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password || !url.hostname) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function eventDateRange(input: { eventDate: string; eventEndDate?: string | null }): { start: Date; end: Date; allDay: boolean } | null {
  const start = new Date(input.eventDate);
  if (Number.isNaN(start.getTime())) return null;

  const allDay = DATE_ONLY_PATTERN.test(input.eventDate);
  const suppliedEnd = input.eventEndDate ? new Date(input.eventEndDate) : null;
  const validEnd = suppliedEnd && !Number.isNaN(suppliedEnd.getTime()) ? suppliedEnd : null;
  if (allDay) {
    const inclusiveEnd = validEnd && validEnd.getTime() >= start.getTime() ? validEnd : start;
    return { start, end: new Date(inclusiveEnd.getTime() + 24 * 60 * 60 * 1000), allDay: true };
  }
  return {
    start,
    end: validEnd && validEnd.getTime() > start.getTime() ? validEnd : new Date(start.getTime() + DEFAULT_EVENT_DURATION_MS),
    allDay: false,
  };
}

function formatSchedule(input: { eventDate: string; eventEndDate?: string | null }): { date: string; month: string; day: string; time: string } {
  const range = eventDateRange(input);
  if (!range) return { date: 'Date to be announced', month: 'TBA', day: '—', time: 'Time to be announced' };

  const date = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: EVENT_TIME_ZONE }).format(range.start);
  const month = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: EVENT_TIME_ZONE }).format(range.start).toUpperCase();
  const day = new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: EVENT_TIME_ZONE }).format(range.start);
  if (range.allDay) return { date, month, day, time: 'Time to be announced' };

  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: EVENT_TIME_ZONE });
  return { date, month, day, time: `${time.format(range.start)} – ${time.format(range.end)} GMT` };
}

function calendarDate(value: Date, allDay: boolean): string {
  return allDay ? value.toISOString().slice(0, 10).replaceAll('-', '') : value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function googleCalendarUrl(input: { eventName: string; eventDate: string; eventEndDate?: string | null; locationName: string; eventUrl?: string | null }): string | null {
  const range = eventDateRange(input);
  if (!range) return null;
  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', textLine(input.eventName, 'DevCongress event'));
  url.searchParams.set('dates', `${calendarDate(range.start, range.allDay)}/${calendarDate(range.end, range.allDay)}`);
  url.searchParams.set('details', ['Your place is confirmed for this DevCongress event.', safeHttpUrl(input.eventUrl) ? `Event details: ${safeHttpUrl(input.eventUrl)}` : null].filter(Boolean).join('\n\n'));
  url.searchParams.set('location', textLine(input.locationName, 'Location to be announced'));
  return url.toString();
}

export function eventBlastEmail(input: {
  subject: string;
  body: string;
  unsubscribeUrl: string;
  eventName: string;
  eventDate: string;
  eventEndDate?: string | null;
  locationName: string;
  locationUrl?: string | null;
  eventUrl?: string | null;
  calendarDownloadUrl?: string | null;
}): { html: string; text: string } {
  const eventName = textLine(input.eventName, 'DevCongress event');
  const schedule = formatSchedule(input);
  const mapUrl = safeGoogleMapsUrl(input.locationUrl);
  const eventUrl = safeHttpUrl(input.eventUrl);
  const calendarUrl = googleCalendarUrl(input);
  const calendarDownloadUrl = safeHttpUrl(input.calendarDownloadUrl);
  const safe = {
    subject: escapeHtml(textLine(input.subject, 'Event update')),
    body: escapeHtml(input.body.trim()).replace(/\r?\n/g, '<br>'),
    eventName: escapeHtml(eventName),
    date: escapeHtml(schedule.date), month: escapeHtml(schedule.month), day: escapeHtml(schedule.day), time: escapeHtml(schedule.time),
    locationName: escapeHtml(textLine(input.locationName, 'Location to be announced')),
    mapUrl: mapUrl ? escapeHtml(mapUrl) : null,
    eventUrl: eventUrl ? escapeHtml(eventUrl) : null,
    calendarUrl: calendarUrl ? escapeHtml(calendarUrl) : null,
    calendarDownloadUrl: calendarDownloadUrl ? escapeHtml(calendarDownloadUrl) : null,
    unsubscribeUrl: escapeHtml(input.unsubscribeUrl),
  };

  return {
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${safe.subject}</title><style>:root{color-scheme:light dark;supported-color-schemes:light dark}@media (prefers-color-scheme:dark){.email-body,.email-canvas{background:#111111!important}.email-shell,.email-content{background:#1C1C1C!important;border-color:#3A3A3A!important}.email-heading,.email-title,.email-detail-title,.email-header-context{color:#E5E5E5!important}.email-copy,.email-footer,.email-detail-copy{color:#A1A1A1!important}.email-detail{background:#262626!important;border-color:#3A3A3A!important}.email-detail-divider{background:#3A3A3A!important}.email-secondary-action{color:#E5E5E5!important;border-color:#666666!important}}</style></head>
<body class="email-body" style="margin:0;background:#F5F2E8;color:#111111;font-family:Inter,'Helvetica Neue',Arial,sans-serif;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="email-canvas" style="width:100%;background:#F5F2E8;"><tr><td align="center" style="padding:32px 16px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="email-shell" style="width:100%;max-width:620px;background:#FFFFFF;border:2px solid #111111;border-radius:8px;border-collapse:separate;overflow:hidden;">
<tr><td bgcolor="#111111" style="padding:21px 30px;background:#111111;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td valign="middle"><img src="${DEVCONGRESS_WORDMARK_URL}" width="152" alt="DevCongress" style="display:block;width:152px;max-width:100%;height:auto;border:0;color:#FFFFFF;font-size:18px;font-weight:700;"></td><td align="right" class="email-header-context" style="color:#FFFFFF;font-family:'Courier New',monospace;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">Community update</td></tr></table></td></tr>
<tr><td style="font-size:0;line-height:0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="52%" height="6" bgcolor="#E8117F" style="height:6px;background:#E8117F;">&nbsp;</td><td width="18%" height="6" bgcolor="#6A38F0" style="height:6px;background:#6A38F0;">&nbsp;</td><td width="30%" height="6" bgcolor="#F5E642" style="height:6px;background:#F5E642;">&nbsp;</td></tr></table></td></tr>
<tr><td class="email-content" style="padding:38px 38px 34px;background:#FFFFFF;"><p style="margin:0 0 10px;color:#C80D68;font-family:'Courier New',monospace;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">Event update</p><h1 class="email-heading" style="margin:0 0 12px;color:#111111;font-size:38px;font-weight:800;line-height:1.08;letter-spacing:-.025em;">${safe.subject}</h1><p class="email-copy" style="margin:0 0 28px;color:#4B4B4B;font-size:17px;line-height:1.6;">${safe.body}</p><p class="email-title" style="margin:0 0 16px;color:#111111;font-size:22px;font-weight:800;line-height:1.3;">${safe.eventName}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="email-detail" style="width:100%;margin:0 0 22px;background:#F7F4EA;border:1px solid #D8D2C4;border-radius:8px;border-collapse:separate;overflow:hidden;"><tr><td width="72" valign="middle" style="width:72px;padding:14px 0 14px 16px;"><table role="presentation" width="56" cellspacing="0" cellpadding="0" style="width:56px;background:#F5E642;border:1px solid #111111;border-radius:8px;border-collapse:separate;overflow:hidden;"><tr><td align="center" style="padding:5px 4px 3px;color:#111111;font-family:'Courier New',monospace;font-size:9px;font-weight:700;letter-spacing:.1em;">${safe.month}</td></tr><tr><td align="center" style="padding:2px 4px 7px;color:#111111;font-size:24px;font-weight:800;line-height:1;">${safe.day}</td></tr></table></td><td valign="middle" style="padding:14px 18px 14px 14px;"><p style="margin:0 0 4px;color:#C80D68;font-family:'Courier New',monospace;font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">When</p><p class="email-detail-title" style="margin:0 0 5px;color:#111111;font-size:16px;font-weight:800;line-height:1.35;">${safe.date}</p><p class="email-detail-copy" style="margin:0;color:#666666;font-size:15px;line-height:1.4;">${safe.time}</p></td></tr><tr><td colspan="2" class="email-detail-divider" style="height:1px;background:#D8D2C4;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td width="72" align="center" valign="middle" style="width:72px;padding:14px 0 14px 16px;"><div aria-label="Location" style="width:54px;height:54px;border:1px solid #111111;border-radius:8px;color:#E8117F;font-size:27px;font-weight:800;line-height:54px;text-align:center;">⌖</div></td><td valign="middle" style="padding:14px 18px 14px 14px;"><p style="margin:0 0 5px;color:#C80D68;font-family:'Courier New',monospace;font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">Where</p><p class="email-detail-title" style="margin:0;color:#111111;font-size:17px;font-weight:800;line-height:1.35;">${safe.locationName}</p>${safe.mapUrl ? `<p style="margin:7px 0 0;"><a href="${safe.mapUrl}" target="_blank" rel="noopener noreferrer" style="color:#C80D68;font-size:13px;font-weight:700;text-decoration:none;">View map →</a></p>` : ''}</td></tr></table>
${safe.calendarUrl || safe.calendarDownloadUrl ? `<p style="margin:0 0 11px;color:#777777;font-family:'Courier New',monospace;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">Add to calendar</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;margin:0 0 24px;"><tr>${safe.calendarUrl ? `<td width="58%" style="padding:0 5px 0 0;"><a href="${safe.calendarUrl}" target="_blank" rel="noopener noreferrer" style="display:block;padding:13px 8px;background:#E8117F;border:1px solid #E8117F;border-radius:6px;color:#FFFFFF;font-size:14px;font-weight:800;text-decoration:none;text-align:center;white-space:nowrap;">Google Calendar</a></td>` : ''}${safe.calendarDownloadUrl ? `<td width="42%" style="padding:0 0 0 5px;"><a href="${safe.calendarDownloadUrl}" target="_blank" rel="noopener noreferrer" class="email-secondary-action" style="display:block;padding:13px 8px;background:transparent;border:1px solid #111111;border-radius:6px;color:#111111;font-size:13px;font-weight:700;text-decoration:none;text-align:center;white-space:nowrap;">Download .ics</a></td>` : ''}</tr></table>` : ''}
${safe.eventUrl ? `<p style="margin:0 0 26px;"><a href="${safe.eventUrl}" target="_blank" rel="noopener noreferrer" style="color:#C80D68;font-size:14px;font-weight:700;text-decoration:none;">View event details →</a></p>` : ''}<p class="email-footer" style="margin:0;padding-top:22px;border-top:1px solid #DDD6C8;color:#777777;font-size:13px;line-height:1.6;">You are receiving this because you registered for this DevCongress event.<br><a href="${safe.unsubscribeUrl}" style="color:#C80D68;font-weight:700;text-decoration:underline;">Unsubscribe</a></p></td></tr></table></td></tr></table></body></html>`,
    text: `${input.subject.trim()}\n\n${input.body.trim()}\n\n${eventName}\n${schedule.date}\n${schedule.time}\n${textLine(input.locationName, 'Location to be announced')}\n${calendarUrl ? `\nAdd to Google Calendar: ${calendarUrl}` : ''}${calendarDownloadUrl ? `\nDownload calendar file: ${calendarDownloadUrl}` : ''}${eventUrl ? `\nEvent details: ${eventUrl}` : ''}\n\nYou are receiving this because you registered for this DevCongress event.\nUnsubscribe: ${input.unsubscribeUrl}`,
  };
}
