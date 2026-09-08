import { emailSubjects } from '@/lib/email/scenarios';
import {
  renderSpeakerEmailLayout,
  speakerEmailAssetUrl,
  truncateSpeakerEmailCardTitle,
} from '@/lib/email/templates/speaker-email-layout';

type SpeakerProposalRejectionEmailInput = {
  eventName: string;
  speakerName: string;
  talkTitle: string;
  subject?: string;
};

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

export function speakerProposalRejectionEmail(input: SpeakerProposalRejectionEmailInput) {
  const subject = input.subject ?? emailSubjects.speakerProposalRejected(input.eventName);
  const speakerFirstName = firstName(input.speakerName);
  const safeFirstName = escapeHtml(speakerFirstName);
  const safeEventName = escapeHtml(input.eventName);
  const safeCardTitle = escapeHtml(truncateSpeakerEmailCardTitle(input.talkTitle));
  const safeIllustrationUrl = escapeHtml(speakerEmailAssetUrl('/brand/speaker-archive-illustration.png'));
  const text = [
    `Hi ${speakerFirstName},`,
    '',
    `Thank you for submitting “${input.talkTitle}” for ${input.eventName}.`,
    '',
    'After reviewing the programme, we will not be moving forward with this proposal for this event.',
    '',
    'We appreciate the time and thought you put into it, and we hope you will submit another idea for a future DevCongress event.',
    '',
    'If you have a question, reply to this email and the DevCongress team will help.',
  ].join('\n');

  const contentHtml = `
    <p class="email-eyebrow" style="margin:0 0 10px;color:#C80D68;font-family:'IBM Plex Mono','Courier New',monospace;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">Programme update / ${safeEventName}</p>
    <h1 class="email-heading" style="margin:0 0 12px;color:#111111;font-size:34px;font-weight:800;line-height:1.15;letter-spacing:-.02em;">Hi ${safeFirstName},</h1>
    <p class="email-copy" style="margin:0 0 24px;color:#444444;font-size:17px;line-height:1.6;">Thank you for sharing your proposal with the DevCongress programme.</p>

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

    <p class="email-copy" style="margin:0 0 18px;color:#444444;font-size:16px;line-height:1.65;">After reviewing the programme, we will not be moving forward with this proposal for this event.</p>
    <p class="email-copy" style="margin:0;color:#444444;font-size:16px;line-height:1.65;">We appreciate the time and thought you put into it, and we hope you will submit another idea for a future DevCongress event.</p>`;

  const html = renderSpeakerEmailLayout({
    subject,
    preheader: 'An update on your DevCongress presentation proposal.',
    brandMeta: ['Programme decision', 'Proposal update'],
    contentHtml,
    footerTitle: 'Thank you for sharing your work',
    footerCopy: 'Questions? Reply directly and the DevCongress team will help.',
  });

  return { subject, html, text };
}
