import { emailSubjects } from '@/lib/email/scenarios';
import {
  renderSpeakerEmailLayout,
  speakerEmailAssetUrl,
  truncateSpeakerEmailCardTitle,
} from '@/lib/email/templates/speaker-email-layout';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function firstName(value: string): string {
  return value.trim().split(/\s+/)[0] || 'there';
}

type SpeakerPrivateFormEmailInput = {
  eventName: string;
  speakerName: string;
  talkTitle: string;
  privateUrl: string;
  expiresAt: string;
};

function speakerPrivateFormEmail(
  input: SpeakerPrivateFormEmailInput,
  intent: 'archive_request' | 'selected_confirmation',
): { subject: string; html: string; text: string } {
  const selectedConfirmation = intent === 'selected_confirmation';
  const safeEventName = escapeHtml(input.eventName);
  const speakerFirstName = firstName(input.speakerName);
  const safeSpeakerFirstName = escapeHtml(speakerFirstName);
  const cardTitle = truncateSpeakerEmailCardTitle(input.talkTitle);
  const safeCardTitle = escapeHtml(cardTitle);
  const safePrivateUrl = escapeHtml(input.privateUrl);
  const safeIllustrationUrl = escapeHtml(speakerEmailAssetUrl('/brand/speaker-archive-illustration.png'));
  const expiryLabel = new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(input.expiresAt));
  const subject = selectedConfirmation
    ? emailSubjects.speakerSelectedConfirmation(input.eventName)
    : emailSubjects.speakerArchiveRequest(input.eventName);
  const preheader = selectedConfirmation
    ? `Your presentation was selected. Complete your speaker details by ${expiryLabel}.`
    : `Add the archive details for ${cardTitle} by ${expiryLabel}.`;
  const brandMeta: [string, string] = selectedConfirmation
    ? ['Speaker selection', 'Private next step']
    : ['Speaker archive', 'Private request'];
  const eyebrow = selectedConfirmation
    ? `Selected speaker / ${safeEventName}`
    : `Archive request / ${safeEventName}`;
  const lead = selectedConfirmation
    ? 'Great news&mdash;your presentation has been selected for the DevCongress programme.'
    : 'Let&rsquo;s give your session a permanent home in the DevCongress community archive.';
  const instruction = selectedConfirmation
    ? 'Confirm your speaker details and public resource using the private link below. It is secured to you and will close after a successful submission.'
    : 'Add your presentation details and public resource using the private link below. It is secured to you and will close after a successful submission.';
  const cta = selectedConfirmation ? 'Complete speaker details' : 'Open your private form';

  const contentHtml = `
    <p class="email-eyebrow" style="margin:0 0 10px;color:#C80D68;font-family:'IBM Plex Mono','Courier New',monospace;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">${eyebrow}</p>
    <h1 class="email-heading" style="margin:0 0 12px;color:#111111;font-size:34px;font-weight:800;line-height:1.15;letter-spacing:-.02em;">Hi ${safeSpeakerFirstName},</h1>
    <p class="email-copy" style="margin:0 0 24px;color:#444444;font-size:17px;line-height:1.6;">${lead}</p>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#F5F2E8" class="email-session-card" style="width:100%;margin:0 0 24px;background:#F5F2E8;border:1px solid #D8D2C4;border-radius:8px;">
      <tr>
        <td style="padding:20px 22px;">
          <p class="email-session-label" style="margin:0 0 8px;color:#C80D68;font-family:'IBM Plex Mono','Courier New',monospace;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">Your presentation</p>
          <p class="email-session-title" style="margin:0;color:#111111;font-size:22px;font-weight:800;line-height:1.3;">${safeCardTitle}</p>
          <p class="email-session-event" style="margin:8px 0 0;color:#666666;font-size:13px;font-weight:600;line-height:1.4;">${safeEventName}</p>
        </td>
        <td width="112" align="right" valign="middle" style="width:112px;padding:14px 18px 14px 0;">
          <img src="${safeIllustrationUrl}" width="92" alt="" style="display:block;width:92px;max-width:100%;height:auto;border:0;">
        </td>
      </tr>
    </table>

    <p class="email-copy" style="margin:0 0 24px;color:#444444;font-size:16px;line-height:1.65;">${instruction}</p>
    <p style="margin:0;"><a href="${safePrivateUrl}" class="email-cta" style="color:#C80D68;-webkit-text-fill-color:#C80D68;font-family:'IBM Plex Mono','Courier New',monospace;font-size:13px;font-weight:700;letter-spacing:.03em;text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:4px;text-transform:uppercase;">${cta}&nbsp;&nbsp;&rarr;</a></p>`;

  const html = renderSpeakerEmailLayout({
    subject,
    preheader,
    brandMeta,
    contentHtml,
    footerTitle: `Private link · Expires ${expiryLabel}`,
    footerCopy: 'Please do not forward this email. Questions? Reply directly and the DevCongress team will help.',
  });

  const text = selectedConfirmation
    ? [
        `Hi ${speakerFirstName},`,
        '',
        `Great news—your presentation "${input.talkTitle}" was selected for ${input.eventName}.`,
        '',
        `Complete your speaker details using this private link: ${input.privateUrl}`,
        '',
        `This unique link expires on ${expiryLabel}. Please do not forward it.`,
        '',
        'If you have a question, reply to this email and the DevCongress team will help.',
      ].join('\n')
    : [
        `Hi ${speakerFirstName},`,
        '',
        `Thanks for being part of ${input.eventName}. We are completing the community archive for "${input.talkTitle}".`,
        '',
        `Add your presentation details using this private link: ${input.privateUrl}`,
        '',
        `This unique link expires on ${expiryLabel}. Please do not forward it.`,
        '',
        'If you have a question, reply to this email and the DevCongress team will help.',
      ].join('\n');

  return { subject, html, text };
}

export function monthlyArchiveRequestEmail(input: SpeakerPrivateFormEmailInput) {
  return speakerPrivateFormEmail(input, 'archive_request');
}

export function selectedSpeakerConfirmationEmail(input: SpeakerPrivateFormEmailInput) {
  return speakerPrivateFormEmail(input, 'selected_confirmation');
}
