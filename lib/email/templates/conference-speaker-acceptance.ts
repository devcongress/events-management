import { emailSubjects } from '@/lib/email/scenarios';
import { renderSpeakerEmailLayout, truncateSpeakerEmailCardTitle } from '@/lib/email/templates/speaker-email-layout';

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export function conferenceSpeakerAcceptanceEmail(input: {
  editionLabel: string;
  speakerName: string;
  talkTitle: string;
  privateUrl: string;
  deadline: string;
}) {
  const firstName = input.speakerName.trim().split(/\s+/)[0] || 'there';
  const deadlineLabel = new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(input.deadline));
  const subject = emailSubjects.conferenceSpeakerAccepted(input.editionLabel);
  const safeTitle = escapeHtml(truncateSpeakerEmailCardTitle(input.talkTitle));
  const safeEdition = escapeHtml(input.editionLabel);
  const safeUrl = escapeHtml(input.privateUrl);
  const contentHtml = `
    <p class="email-eyebrow" style="margin:0 0 10px;color:#C80D68;font-family:'IBM Plex Mono','Courier New',monospace;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">Accepted session / ${safeEdition}</p>
    <h1 class="email-heading" style="margin:0 0 12px;color:#111111;font-size:34px;font-weight:800;line-height:1.15;">Hi ${escapeHtml(firstName)},</h1>
    <p class="email-copy" style="margin:0 0 24px;color:#444444;font-size:17px;line-height:1.6;">Great news&mdash;we accepted your proposal for the DevCongress Annual Conference.</p>
    <div style="margin:0 0 24px;padding:20px 22px;background:#F5F2E8;border:1px solid #D8D2C4;border-radius:8px;">
      <p style="margin:0 0 8px;color:#C80D68;font-family:'IBM Plex Mono','Courier New',monospace;font-size:10px;font-weight:700;text-transform:uppercase;">Your session</p>
      <p style="margin:0;color:#111111;font-size:22px;font-weight:800;line-height:1.3;">${safeTitle}</p>
    </div>
    <p class="email-copy" style="margin:0 0 24px;color:#444444;font-size:16px;line-height:1.65;">Your proposal is already saved. Use the private workspace below to confirm availability and keep slides, setup needs, workshop prerequisites, equipment, laptop needs, and capacity up to date through ${escapeHtml(deadlineLabel)}.</p>
    <p style="margin:0;"><a href="${safeUrl}" style="color:#C80D68;font-family:'IBM Plex Mono','Courier New',monospace;font-size:13px;font-weight:700;text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:4px;text-transform:uppercase;">Open speaker workspace&nbsp;&nbsp;&rarr;</a></p>`;
  const html = renderSpeakerEmailLayout({
    subject,
    preheader: `Your session was accepted. Update logistics by ${deadlineLabel}.`,
    brandMeta: ['Annual Conference', 'Private speaker workspace'],
    contentHtml,
    footerTitle: `Private workspace · Updates close ${deadlineLabel}`,
    footerCopy: 'Please do not forward this link. Reply to this email if you need help.',
  });
  const text = [
    `Hi ${firstName},`,
    '',
    `Great news—your proposal “${input.talkTitle}” was accepted for ${input.editionLabel}.`,
    '',
    'Your proposal is already saved. Use this private workspace to keep your conference logistics up to date:',
    input.privateUrl,
    '',
    `Updates close ${deadlineLabel}. Please do not forward this link.`,
  ].join('\n');

  return { subject, html, text };
}
