import { renderVolunteerOutcomeLayout } from './volunteer-outcome-layout';

import { EMAIL_SENDERS, emailSubjects } from '@/lib/email/scenarios';

export const VOLUNTEER_BROADCAST_TEMPLATE_VERSION = 'volunteer-broadcast-v1';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function messageHtml(message: string): string {
  return message
    .replaceAll('\r\n', '\n')
    .split(/\n\s*\n/u)
    .filter((paragraph) => paragraph.trim())
    .map((paragraph) => `<p class="email-copy" style="margin:0 0 18px;color:#444444;font-size:16px;line-height:1.65;overflow-wrap:anywhere;">${escapeHtml(paragraph.trim()).replaceAll('\n', '<br>')}</p>`)
    .join('');
}

export function volunteerBroadcastEmail(input: {
  subject: string;
  body: string;
  unsubscribeUrl: string;
}): { from: string; subject: string; html: string; text: string } {
  const subject = emailSubjects.customEventBlast(input.subject);
  const unsubscribeUrl = escapeHtml(input.unsubscribeUrl);
  const html = renderVolunteerOutcomeLayout({
    subject,
    preheader: input.body.trim().slice(0, 140),
    contentHtml: `
      <p style="margin:0 0 10px;color:#C80D68;font-family:'IBM Plex Mono','Courier New',monospace;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">Volunteer team update</p>
      <h1 class="email-heading" style="margin:0 0 24px;color:#111111;font-size:36px;font-weight:700;line-height:1.15;">${escapeHtml(subject)}</h1>
      ${messageHtml(input.body)}
      <p class="letter-footer" style="margin:28px 0 0;padding-top:20px;border-top:1px solid #D7D3C9;color:#68645D;font-size:12px;line-height:1.6;">You are receiving this update because you were selected for the DevCon26 volunteer team.<br><a href="${unsubscribeUrl}" style="color:#C80D68;font-weight:700;text-decoration:underline;">Unsubscribe from these updates</a></p>`,
  });
  const text = `${subject}\n\n${input.body.trim()}\n\nYou are receiving this update because you were selected for the DevCon26 volunteer team.\nUnsubscribe: ${input.unsubscribeUrl}`;

  return { from: EMAIL_SENDERS.events.from, subject, html, text };
}
