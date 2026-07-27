function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function monthlyArchiveRequestEmail(input: {
  eventName: string;
  speakerName: string;
  talkTitle: string;
  privateUrl: string;
  expiresAt: string;
}): { subject: string; html: string; text: string } {
  const safeEventName = escapeHtml(input.eventName);
  const safeSpeakerName = escapeHtml(input.speakerName);
  const safeTalkTitle = escapeHtml(input.talkTitle);
  const safePrivateUrl = escapeHtml(input.privateUrl);
  const expiryLabel = new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(input.expiresAt));
  const safeExpiryLabel = escapeHtml(expiryLabel);
  const subject = `Add your presentation details for ${input.eventName}`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;background:#f5f1e8;color:#111111;font-family:Inter,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f1e8;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #d8d2c4;border-radius:8px;">
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 10px;color:#e01875;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">DevCongress archive request</p>
                <h1 style="margin:0 0 20px;font-size:27px;line-height:1.2;">Hi ${safeSpeakerName},</h1>
                <p style="margin:0 0 16px;color:#4b4b4b;font-size:16px;line-height:1.65;">Thanks for being part of ${safeEventName}. We are completing the community archive for <strong>${safeTalkTitle}</strong>.</p>
                <p style="margin:0 0 24px;color:#4b4b4b;font-size:16px;line-height:1.65;">Use your private link to add the presentation details and public resource. The link is unique to you and expires on ${safeExpiryLabel}.</p>
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="border-radius:6px;background:#fff2a8;">
                      <a href="${safePrivateUrl}" style="display:inline-block;border:1px solid #111111;border-radius:6px;padding:14px 20px;color:#111111;font-size:15px;font-weight:700;text-decoration:none;">Add my presentation details</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;color:#717171;font-size:13px;line-height:1.6;">Please do not forward this email. If you have a question, reply and the DevCongress team will help.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `Hi ${input.speakerName},`,
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
