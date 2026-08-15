import { emailSubjects } from '@/lib/email/scenarios';
import type {
  EventSubmissionEmailKind,
  EventSubmissionRejectionCategory,
} from '@/types';

const DEVCONGRESS_WORDMARK_URL = 'https://devcongress.org/images/logo-nav%402x.png';

const REJECTION_CATEGORY_LABELS: Record<EventSubmissionRejectionCategory, string> = {
  calendar_fit: 'The event does not fit the community calendar',
  insufficient_information: 'The information provided was insufficient or could not be verified',
  duplicate: 'This event was already submitted',
  event_passed: 'The event has already passed',
  other: 'Other',
};

export type CommunityEventSubmissionEmailInput = {
  kind: EventSubmissionEmailKind;
  organizerName: string;
  eventTitle: string;
  startsAt: string;
  timezone: string;
  communityCalendarUrl: string;
  submissionUrl: string;
  registrationUrl?: string | null;
  rejectionCategory?: EventSubmissionRejectionCategory | null;
  organizerMessage?: string | null;
  managementUrl?: string | null;
  amendmentStartsAt?: string | null;
  amendmentTimezone?: string | null;
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
    ) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function formatEventDate(value: string, timezone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date provided with submission';
  try {
    return new Intl.DateTimeFormat('en-GH', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-GH', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'Africa/Accra',
    }).format(date);
  }
}

export function communityEventSubmissionEmail(
  input: CommunityEventSubmissionEmailInput,
): { subject: string; html: string; text: string } {
  const organizerName = textLine(input.organizerName, 'there');
  const eventTitle = textLine(input.eventTitle, 'your event');
  const eventDate = formatEventDate(input.startsAt, input.timezone);
  const calendarUrl = safeHttpUrl(input.communityCalendarUrl) ?? 'https://devcongress.org/events/';
  const submissionUrl = safeHttpUrl(input.submissionUrl) ?? 'https://devcongress.org/events/submit/';
  const registrationUrl = safeHttpUrl(input.registrationUrl);
  const organizerMessage = input.organizerMessage?.trim() || null;
  const rejectionLabel = input.rejectionCategory
    ? REJECTION_CATEGORY_LABELS[input.rejectionCategory]
    : REJECTION_CATEGORY_LABELS.other;

  const content = emailCopy({
    ...input,
    organizerName,
    eventTitle,
    eventDate,
    calendarUrl,
    submissionUrl,
    registrationUrl,
    organizerMessage,
    rejectionLabel,
  });
  const messageHtml = organizerMessage
    ? `<div style="margin-top:18px;padding:16px 18px;border-left:4px solid #F50A8A;background:#FFF9D9;color:#1C1C1C;font-size:15px;line-height:1.6;white-space:pre-line;">${escapeHtml(organizerMessage)}</div>`
    : '';
  const reasonHtml = input.kind === 'rejected'
    ? `<div style="margin-top:20px;padding:16px 18px;border:1px solid #D9D4C8;background:#FAF8F2;"><div style="font-family:'Courier New',monospace;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#6A665D;">Reason</div><div style="margin-top:7px;font-size:15px;line-height:1.55;color:#1C1C1C;">${escapeHtml(rejectionLabel)}</div></div>`
    : '';
  const ctaHtml = content.ctaUrl
    ? `<a href="${escapeHtml(content.ctaUrl)}" style="display:inline-block;margin-top:24px;padding:13px 18px;border:2px solid #111111;background:#FBE834;color:#111111;font-family:'Courier New',monospace;font-size:12px;font-weight:700;letter-spacing:.08em;text-decoration:none;text-transform:uppercase;">${escapeHtml(content.ctaLabel)}</a>`
    : '';

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(content.subject)}</title></head>
<body style="margin:0;background:#F3F0E7;color:#1C1C1C;font-family:Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F3F0E7;"><tr><td align="center" style="padding:28px 14px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;border:1px solid #D9D4C8;background:#FFFFFF;">
<tr><td style="padding:20px 28px;background:#111111;"><img src="${DEVCONGRESS_WORDMARK_URL}" width="152" alt="DevCongress" style="display:block;width:152px;max-width:100%;height:auto;border:0;color:#FFFFFF;font-size:18px;font-weight:700;"></td></tr>
<tr><td style="padding:34px 30px 32px;">
<div style="font-family:'Courier New',monospace;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#F50A8A;">Community calendar</div>
<h1 style="margin:12px 0 0;font-size:28px;line-height:1.18;letter-spacing:-.02em;color:#111111;">${escapeHtml(content.heading)}</h1>
<p style="margin:20px 0 0;font-size:16px;line-height:1.65;color:#3D3A35;">Hi ${escapeHtml(organizerName)},</p>
<p style="margin:12px 0 0;font-size:16px;line-height:1.65;color:#3D3A35;">${escapeHtml(content.intro)}</p>
<div style="margin-top:22px;padding:18px;border:1px solid #D9D4C8;background:#FAF8F2;"><strong style="display:block;font-size:17px;color:#111111;">${escapeHtml(eventTitle)}</strong><span style="display:block;margin-top:6px;font-size:14px;line-height:1.5;color:#6A665D;">${escapeHtml(eventDate)}</span></div>
${reasonHtml}${messageHtml}
<p style="margin:20px 0 0;font-size:14px;line-height:1.65;color:#5C5850;">${escapeHtml(content.detail)}</p>
${ctaHtml}
</td></tr>
<tr><td style="padding:18px 30px;border-top:1px solid #D9D4C8;font-size:12px;line-height:1.5;color:#777168;">DevCongress · Community-powered technology events in Ghana</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    content.heading,
    '',
    `Hi ${organizerName},`,
    '',
    content.intro,
    '',
    eventTitle,
    eventDate,
    ...(input.kind === 'rejected' ? ['', `Reason: ${rejectionLabel}`] : []),
    ...(organizerMessage ? ['', 'Message from the DevCongress team:', organizerMessage] : []),
    '',
    content.detail,
    ...(content.ctaUrl ? ['', `${content.ctaLabel}: ${content.ctaUrl}`] : []),
  ].join('\n');

  return { subject: content.subject, html, text };
}

function emailCopy(input: CommunityEventSubmissionEmailInput & {
  organizerName: string;
  eventTitle: string;
  eventDate: string;
  calendarUrl: string;
  submissionUrl: string;
  registrationUrl: string | null;
  organizerMessage: string | null;
  rejectionLabel: string;
}): {
  subject: string;
  heading: string;
  intro: string;
  detail: string;
  ctaLabel: string;
  ctaUrl: string | null;
} {
  if (input.kind === 'approved') {
    return {
      subject: emailSubjects.communitySubmissionApproved(input.eventTitle),
      heading: 'Your event was approved and published.',
      intro: 'We reviewed your submission and added it to the DevCongress community calendar.',
      detail: 'The listing keeps your organization as the event organizer. Use your private event link when the time, venue, online link, or registration link changes; those changes will be reviewed before they appear publicly.',
      ctaLabel: 'Manage event details',
      ctaUrl: safeHttpUrl(input.managementUrl),
    };
  }

  if (input.kind === 'rejected') {
    return {
      subject: emailSubjects.communitySubmissionRejected(input.eventTitle),
      heading: 'An update on your event submission.',
      intro: 'We reviewed your submission and will not publish it to the DevCongress community calendar.',
      detail: 'This decision applies only to the community calendar listing. If you want to propose a different event, submit it as a new event for review.',
      ctaLabel: 'Submit another event',
      ctaUrl: input.submissionUrl,
    };
  }

  if (input.kind === 'amendment_approved') {
    return {
      subject: emailSubjects.communitySubmissionApproved(input.eventTitle),
      heading: 'Your event update was approved.',
      intro: 'We reviewed the changes you requested and updated the community calendar listing.',
      detail: 'Use your private event link again if the schedule, venue, online link, or registration link changes later.',
      ctaLabel: 'Manage event details',
      ctaUrl: safeHttpUrl(input.managementUrl),
    };
  }

  if (input.kind === 'amendment_rejected') {
    return {
      subject: emailSubjects.communitySubmissionRejected(input.eventTitle),
      heading: 'An update on your event changes.',
      intro: 'We reviewed the changes you requested and did not apply them to the community calendar listing.',
      detail: 'Your existing listing has not changed. You can use your private event link to prepare another change request.',
      ctaLabel: 'Manage event details',
      ctaUrl: safeHttpUrl(input.managementUrl),
    };
  }

  if (input.kind === 'withdrawn') {
    return {
      subject: emailSubjects.communitySubmissionWithdrawn(input.eventTitle),
      heading: 'Your event listing was removed.',
      intro: 'The DevCongress team removed this event from the community calendar.',
      detail: 'This affects only the DevCongress community calendar listing and does not change your own event or registration page.',
      ctaLabel: 'Browse community events',
      ctaUrl: input.calendarUrl,
    };
  }

  return {
    subject: emailSubjects.communitySubmissionReceipt(input.eventTitle),
    heading: 'We received your event submission.',
    intro: 'Thanks for sharing your event. It is now in the organizer review queue.',
    detail: 'A submission is only a proposal at this stage. We will send another email after the DevCongress team approves or rejects it.',
    ctaLabel: 'Browse community events',
    ctaUrl: input.calendarUrl,
  };
}
