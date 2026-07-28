function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function truncateCardTitle(value: string, maxLength = 56): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  const characters = Array.from(normalized);

  if (characters.length <= maxLength) return normalized;

  return `${characters.slice(0, maxLength - 1).join('').trimEnd()}…`;
}

function firstName(value: string): string {
  return value.trim().split(/\s+/)[0] || 'there';
}

export function monthlyArchiveRequestEmail(input: {
  eventName: string;
  speakerName: string;
  talkTitle: string;
  privateUrl: string;
  expiresAt: string;
}): { subject: string; html: string; text: string } {
  const safeEventName = escapeHtml(input.eventName);
  const speakerFirstName = firstName(input.speakerName);
  const safeSpeakerFirstName = escapeHtml(speakerFirstName);
  const safeTalkTitle = escapeHtml(input.talkTitle);
  const safeCardTitle = escapeHtml(truncateCardTitle(input.talkTitle));
  const safePrivateUrl = escapeHtml(input.privateUrl);
  const safeLogoUrl = escapeHtml(
    new URL('/brand/dev-con-logo.png', input.privateUrl).toString(),
  );
  const safeIllustrationUrl = escapeHtml(
    new URL('/brand/speaker-archive-illustration.png', input.privateUrl).toString(),
  );
  const safeInter400Url = escapeHtml(
    new URL('/fonts/inter-400.woff2', input.privateUrl).toString(),
  );
  const safeInter600Url = escapeHtml(
    new URL('/fonts/inter-600.woff2', input.privateUrl).toString(),
  );
  const safeInter700Url = escapeHtml(
    new URL('/fonts/inter-700.woff2', input.privateUrl).toString(),
  );
  const safeInter800Url = escapeHtml(
    new URL('/fonts/inter-800.woff2', input.privateUrl).toString(),
  );
  const safeIbmPlexMono700Url = escapeHtml(
    new URL('/fonts/ibm-plex-mono-700.woff2', input.privateUrl).toString(),
  );
  const expiryLabel = new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(input.expiresAt));
  const safeExpiryLabel = escapeHtml(expiryLabel);
  const subject = 'Your DevCongress archive link';

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${escapeHtml(subject)}</title>
    <style>
      @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 400;
        font-display: swap;
        src: url('${safeInter400Url}') format('woff2');
      }
      @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 600;
        font-display: swap;
        src: url('${safeInter600Url}') format('woff2');
      }
      @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 700;
        font-display: swap;
        src: url('${safeInter700Url}') format('woff2');
      }
      @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 800;
        font-display: swap;
        src: url('${safeInter800Url}') format('woff2');
      }
      @font-face {
        font-family: 'IBM Plex Mono';
        font-style: normal;
        font-weight: 700;
        font-display: swap;
        src: url('${safeIbmPlexMono700Url}') format('woff2');
      }
      :root {
        color-scheme: light dark;
        supported-color-schemes: light dark;
      }
      u + .email-body .email-brand {
        background-repeat: repeat !important;
      }
      @media only screen and (max-width: 640px) {
        .email-wrap { padding: 20px 16px !important; }
        .email-pad { padding: 28px 22px !important; }
        .email-brand-pad { padding: 20px 22px !important; }
        .email-logo { width: 190px !important; }
        .email-heading { font-size: 29px !important; }
      }
      @media only screen and (max-width: 640px) and (prefers-color-scheme: dark) {
        .email-wrap { padding: 14px 10px !important; }
        .email-pad { padding: 24px 18px !important; }
        .email-brand-pad { padding: 16px 18px !important; }
        .email-logo { width: 166px !important; }
        .email-heading { font-size: 27px !important; line-height: 1.13 !important; }
        .email-copy { font-size: 15px !important; line-height: 1.58 !important; }
      }
      @media (prefers-color-scheme: dark) {
        .email-body,
        .email-canvas {
          background: #111111 !important;
          background-image: linear-gradient(#111111, #111111) !important;
        }
        .email-shell {
          background: #1C1C1C !important;
          background-image: linear-gradient(#1C1C1C, #1C1C1C) !important;
          border-color: #3A3A3A !important;
        }
        .email-brand {
          background: #111111 !important;
          background-image: linear-gradient(#111111, #111111) !important;
        }
        .email-brand-meta {
          color: #E5E5E5 !important;
          -webkit-text-fill-color: #E5E5E5 !important;
        }
        .email-content {
          background: #1C1C1C !important;
          background-image: linear-gradient(#1C1C1C, #1C1C1C) !important;
        }
        .email-eyebrow { color: #FF5AA5 !important; }
        .email-heading { color: #E5E5E5 !important; }
        .email-copy { color: #C8C8C8 !important; }
        .email-footer {
          background: #161616 !important;
          background-image: linear-gradient(#161616, #161616) !important;
          border-color: #3A3A3A !important;
        }
        .email-footer-title { color: #F5E642 !important; }
        .email-footer-copy,
        .email-signoff { color: #A1A1A1 !important; }
        .email-session-card { background: #262626 !important; border-color: #3A3A3A !important; }
        .email-session-label { color: #FF5AA5 !important; }
        .email-session-title { color: #E5E5E5 !important; }
        .email-session-event { color: #A1A1A1 !important; }
        .email-cta { color: #FF5AA5 !important; -webkit-text-fill-color: #FF5AA5 !important; }
      }
      [data-ogsc] .email-body,
      [data-ogsc] .email-canvas {
        background: #111111 !important;
        background-image: linear-gradient(#111111, #111111) !important;
      }
      [data-ogsc] .email-shell {
        background: #1C1C1C !important;
        background-image: linear-gradient(#1C1C1C, #1C1C1C) !important;
        border-color: #3A3A3A !important;
      }
      [data-ogsc] .email-brand {
        background: #111111 !important;
        background-image: linear-gradient(#111111, #111111) !important;
      }
      [data-ogsc] .email-brand-meta {
        color: #E5E5E5 !important;
        -webkit-text-fill-color: #E5E5E5 !important;
      }
      [data-ogsc] .email-content {
        background: #1C1C1C !important;
        background-image: linear-gradient(#1C1C1C, #1C1C1C) !important;
      }
      [data-ogsc] .email-eyebrow { color: #FF5AA5 !important; }
      [data-ogsc] .email-heading { color: #E5E5E5 !important; }
      [data-ogsc] .email-copy { color: #C8C8C8 !important; }
      [data-ogsc] .email-footer {
        background: #161616 !important;
        background-image: linear-gradient(#161616, #161616) !important;
        border-color: #3A3A3A !important;
      }
      [data-ogsc] .email-footer-title { color: #F5E642 !important; }
      [data-ogsc] .email-footer-copy,
      [data-ogsc] .email-signoff { color: #A1A1A1 !important; }
      [data-ogsc] .email-session-card { background: #262626 !important; border-color: #3A3A3A !important; }
      [data-ogsc] .email-session-label { color: #FF5AA5 !important; }
      [data-ogsc] .email-session-title { color: #E5E5E5 !important; }
      [data-ogsc] .email-session-event { color: #A1A1A1 !important; }
      [data-ogsc] .email-cta { color: #FF5AA5 !important; -webkit-text-fill-color: #FF5AA5 !important; }
    </style>
  </head>
  <body class="email-body" style="margin:0;background:#F5F2E8;color:#111111;font-family:'Inter','Helvetica Neue',Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      Add the archive details for ${safeCardTitle} by ${safeExpiryLabel}.
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#F5F2E8" class="email-canvas" style="width:100%;background:#F5F2E8;">
      <tr>
        <td align="center" class="email-wrap" style="padding:32px 16px;">
          <div style="width:100%;max-width:640px;margin:0 auto;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#FFFFFF" class="email-shell" style="width:100%;background:#FFFFFF;border:2px solid #111111;border-radius:8px;border-collapse:separate;overflow:hidden;">
            <tr>
              <td bgcolor="#111111" class="email-brand email-brand-pad" style="padding:22px 32px;background:#111111;background-image:linear-gradient(#111111,#111111);">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td valign="middle">
                      <img
                        src="${safeLogoUrl}"
                        width="224"
                        alt="DevCongress"
                        class="email-logo"
                        style="display:block;width:224px;max-width:100%;height:auto;border:0;color:#FFFFFF;font-size:18px;font-weight:700;"
                      >
                    </td>
                    <td align="right" valign="middle" class="email-brand-meta" style="padding-left:16px;color:#FFFFFF;-webkit-text-fill-color:#FFFFFF;font-family:'IBM Plex Mono','Courier New',monospace;font-size:10px;font-weight:700;line-height:1.5;letter-spacing:.14em;text-transform:uppercase;">
                      Speaker archive<br>Private request
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td height="5" bgcolor="#E8117F" style="height:5px;background:#E8117F;background-image:linear-gradient(#E8117F,#E8117F);font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td bgcolor="#FFFFFF" class="email-pad email-content" style="padding:38px 40px 36px;background:#FFFFFF;">
                <p class="email-eyebrow" style="margin:0 0 10px;color:#C80D68;font-family:'IBM Plex Mono','Courier New',monospace;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">Archive request / ${safeEventName}</p>
                <h1 class="email-heading" style="margin:0 0 12px;color:#111111;font-size:34px;font-weight:800;line-height:1.15;letter-spacing:-.02em;">Hi ${safeSpeakerFirstName},</h1>
                <p class="email-copy" style="margin:0 0 24px;color:#444444;font-size:17px;line-height:1.6;">Let&rsquo;s give your session a permanent home in the DevCongress community archive.</p>

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

                <p class="email-copy" style="margin:0 0 24px;color:#444444;font-size:16px;line-height:1.65;">Add your presentation details and public resource using the private link below. It is secured to you and will close after a successful submission.</p>
                <p style="margin:0;">
                  <a href="${safePrivateUrl}" class="email-cta" style="color:#C80D68;-webkit-text-fill-color:#C80D68;font-family:'IBM Plex Mono','Courier New',monospace;font-size:13px;font-weight:700;letter-spacing:.03em;text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:4px;text-transform:uppercase;">Open your private form&nbsp;&nbsp;&rarr;</a>
                </p>
              </td>
            </tr>
            <tr>
              <td bgcolor="#F5F2E8" class="email-pad email-footer" style="padding:24px 40px;background:#F5F2E8;border-top:1px solid #D8D2C4;">
                <p class="email-footer-title" style="margin:0 0 8px;color:#111111;font-family:'IBM Plex Mono','Courier New',monospace;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Private link &middot; Expires ${safeExpiryLabel}</p>
                <p class="email-footer-copy" style="margin:0;color:#666666;font-size:13px;line-height:1.6;">Please do not forward this email. Questions? Reply directly and the DevCongress team will help.</p>
              </td>
            </tr>
          </table>
          <p class="email-signoff" style="margin:16px 0 0;color:#77736A;font-family:'IBM Plex Mono','Courier New',monospace;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">DevCongress &middot; Building Ghana&rsquo;s developer community</p>
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
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
