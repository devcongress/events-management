import { emailSubjects } from '@/lib/email/scenarios';

type SpeakerProposalRejectionEmailInput = {
  eventName: string;
  speakerName: string;
  talkTitle: string;
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
  const subject = emailSubjects.speakerProposalRejected(input.eventName);
  const safeSubject = escapeHtml(subject);
  const safeFirstName = escapeHtml(firstName(input.speakerName));
  const safeEventName = escapeHtml(input.eventName);
  const safeTalkTitle = escapeHtml(input.talkTitle);
  const text = [
    `Hi ${firstName(input.speakerName)},`,
    '',
    `Thank you for submitting “${input.talkTitle}” for ${input.eventName}.`,
    '',
    'After reviewing the programme, we will not be moving forward with this proposal for this event.',
    '',
    'We appreciate the time and thought you put into it, and we hope you will submit another idea for a future DevCongress event.',
    '',
    'If you have a question, reply to this email and the DevCongress team will help.',
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>${safeSubject}</title>
  </head>
  <body style="margin:0;background:#f5f2e8;color:#111111;font-family:Inter,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">An update on your DevCongress presentation proposal.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f2e8;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;border:2px solid #111111;border-radius:12px;background:#ffffff;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px;border-bottom:1px solid #d6d2c8;background:#fffbea;">
                <p style="margin:0;color:#e8117f;font-family:monospace;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">DevCongress speakers</p>
                <h1 style="margin:10px 0 0;font-size:28px;line-height:1.15;">A programme update</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px;font-size:16px;line-height:1.65;">
                <p style="margin:0 0 18px;">Hi ${safeFirstName},</p>
                <p style="margin:0 0 18px;">Thank you for submitting <strong>&ldquo;${safeTalkTitle}&rdquo;</strong> for ${safeEventName}.</p>
                <p style="margin:0 0 18px;">After reviewing the programme, we will not be moving forward with this proposal for this event.</p>
                <p style="margin:0;">We appreciate the time and thought you put into it, and we hope you will submit another idea for a future DevCongress event.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px;border-top:1px solid #d6d2c8;background:#faf9f5;color:#5f5b54;font-size:13px;line-height:1.55;">
                If you have a question, reply to this email and the DevCongress team will help.
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
