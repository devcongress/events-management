function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function eventBlastEmail(input: {
  subject: string;
  body: string;
  unsubscribeUrl: string;
}): { html: string; text: string } {
  const subject = escapeHtml(input.subject.trim());
  const body = escapeHtml(input.body.trim()).replace(/\r?\n/g, '<br>');
  const unsubscribeUrl = escapeHtml(input.unsubscribeUrl);

  return {
    html: `<div style="margin:0;padding:32px 20px;background:#F5F2E8;color:#111111;font-family:Inter,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;margin:0 auto;background:#FFFFFF;border:2px solid #111111;border-radius:8px;border-collapse:separate;overflow:hidden;">
    <tr><td style="height:6px;font-size:0;line-height:0;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;"><tr><td width="52%" bgcolor="#E8117F" style="background:#E8117F;font-size:0;line-height:0;">&nbsp;</td><td width="18%" bgcolor="#6A38F0" style="background:#6A38F0;font-size:0;line-height:0;">&nbsp;</td><td width="30%" bgcolor="#F5E642" style="background:#F5E642;font-size:0;line-height:0;">&nbsp;</td></tr></table>
    </td></tr>
    <tr><td style="padding:28px 30px 30px;">
      <p style="margin:0 0 20px;color:#C80D68;font-family:'Courier New',monospace;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">DevCongress · event update</p>
      <h1 style="margin:0 0 18px;color:#111111;font-size:30px;font-weight:800;letter-spacing:-.03em;line-height:1.1;">${subject}</h1>
      <p style="margin:0;color:#3F3F3F;font-size:16px;line-height:1.65;">${body}</p>
      <p style="margin:28px 0 0;padding-top:18px;border-top:1px solid #DDD6C8;color:#6C6860;font-size:12px;line-height:1.5;">You are receiving this because you registered for this DevCongress event.<br><a href="${unsubscribeUrl}" style="color:#C80D68;font-weight:700;text-decoration:underline;">Unsubscribe</a></p>
    </td></tr>
  </table>
</div>`,
    text: `${input.subject.trim()}\n\n${input.body.trim()}\n\nYou are receiving this because you registered for this DevCongress event.\nUnsubscribe: ${input.unsubscribeUrl}`,
  };
}
