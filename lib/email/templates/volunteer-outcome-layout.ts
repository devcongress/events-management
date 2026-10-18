import { speakerEmailAssetUrl } from './speaker-email-layout';

interface VolunteerOutcomeLayoutInput {
  subject: string;
  preheader: string;
  contentHtml: string;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export function renderVolunteerOutcomeLayout(input: VolunteerOutcomeLayoutInput): string {
  const logo = escapeHtml(speakerEmailAssetUrl('/brand/dev-con-logo.png'));

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${escapeHtml(input.subject)}</title>
  <style>
    :root { color-scheme: light dark; }
    @media only screen and (max-width: 600px) {
      .letter-space { padding: 32px 24px !important; }
      .letter-logo { width: 160px !important; }
      .letter-content { padding-top: 36px !important; }
      .email-heading { font-size: 30px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .letter-body,.letter-canvas { background: #1C1C1C !important; }
      .email-heading { color: #E5E5E5 !important; }
      .email-copy { color: #CCCCCC !important; }
      .letter-meta,.letter-footer { color: #A1A1A1 !important; }
      .letter-footer { border-color: #444444 !important; }
    }
    [data-ogsc] .letter-body,[data-ogsc] .letter-canvas { background: #1C1C1C !important; }
    [data-ogsc] .email-heading { color: #E5E5E5 !important; }
    [data-ogsc] .email-copy { color: #CCCCCC !important; }
    [data-ogsc] .letter-meta,[data-ogsc] .letter-footer { color: #A1A1A1 !important; }
    [data-ogsc] .letter-footer { border-color: #444444 !important; }
  </style>
</head>
<body class="letter-body" style="margin:0;background:#F7F5EF;font-family:'Helvetica Neue',Arial,sans-serif;color:#181818;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="letter-canvas" bgcolor="#F7F5EF" style="width:100%;background:#F7F5EF;">
    <tr>
      <td align="center" class="letter-space" style="padding:48px 32px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:544px;text-align:left;">
          <tr>
            <td>
              <img src="${logo}" width="184" alt="DevCongress" class="letter-logo" style="display:block;width:184px;max-width:100%;height:auto;border:0;">
              <p class="letter-meta" style="margin:18px 0 0;color:#68645D;font-size:13px;line-height:1.5;">DevCon26 &nbsp;/&nbsp; Volunteers</p>
            </td>
          </tr>
          <tr>
            <td class="letter-content" style="padding:44px 0 16px;">${input.contentHtml}</td>
          </tr>
          <tr>
            <td class="letter-footer" style="border-top:1px solid #D7D3C9;padding-top:20px;color:#68645D;font-size:12px;line-height:1.6;">DevCongress &middot; Accra, Ghana</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
