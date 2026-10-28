import { conferenceTicketDesign as design } from './conference-ticket-design';
import { renderSpeakerEmailLayout } from './speaker-email-layout';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

export function conferenceTicketEmail(input: {
  name: string;
  badgeUrl?: string;
  managementUrl?: string;
  claimUrl?: string;
  hasTicket: boolean;
  isTest?: boolean;
}) {
  const subject = input.hasTicket ? 'Your DevCon26 ticket & conference badge' : input.claimUrl ? 'Your DevCon26 gift ticket' : 'Your DevCon26 tickets';
  const headline = input.hasTicket ? 'See you at DevCon26.' : input.claimUrl ? 'A place for you.' : 'Good company awaits.';
  const explanation = input.hasTicket
    ? 'Your private QR ticket is attached as a PDF. Save it somewhere handy, then make your conference badge.'
    : input.claimUrl ? 'Someone has saved you a place. Claim your ticket to receive your QR ticket PDF and create your conference badge.'
      : 'Your order is ready. Manage your tickets, share your claim links, and see who has claimed their place.';
  const primaryUrl = input.badgeUrl ?? input.claimUrl ?? input.managementUrl;
  const primaryLabel = input.badgeUrl ? 'Create your badge' : input.claimUrl ? 'Claim your ticket' : 'Manage your tickets';
  const management = input.managementUrl && input.badgeUrl
    ? `<p style="margin:20px 0 0;"><a class="email-cta" style="color:#C80D68;text-decoration:underline;font-size:14px;" href="${escapeHtml(input.managementUrl)}">Manage your tickets &rarr;</a></p>` : '';
  const contentHtml = `
    <p class="email-eyebrow" style="margin:0 0 12px;color:#C80D68;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">DevCon26 / Your ticket</p>
    <h1 class="email-heading" style="margin:0 0 20px;color:#111111;font-size:32px;line-height:1.15;font-weight:800;">${headline}</h1>
    <p class="email-copy" style="margin:0 0 12px;color:#444444;font-size:16px;line-height:1.6;">Hi ${escapeHtml(input.name)},</p>
    <p class="email-copy" style="margin:0 0 24px;color:#444444;font-size:16px;line-height:1.6;">${explanation}</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="email-session-card" bgcolor="#F5F2E8" style="background:#F5F2E8;border:1px solid #D8D2C4;border-radius:8px;margin:0 0 24px;">
      <tr><td style="padding:20px;">
        <p class="email-session-title" style="margin:0 0 8px;font-weight:700;color:#111111;font-size:18px;">Saturday, 19 December 2026</p>
        <p class="email-session-event" style="margin:0;color:#666666;font-size:14px;line-height:1.6;">Ghana Digital Center, Accra<br>One ticket. One person. A day of building what’s next.</p>
      </td></tr>
    </table>
    ${primaryUrl ? `<table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#C80068" style="border-radius:6px;background:#C80068;"><a href="${escapeHtml(primaryUrl)}" style="display:inline-block;padding:15px 20px;color:#FFFFFF;-webkit-text-fill-color:#FFFFFF;font-weight:700;font-size:15px;line-height:1.4;text-decoration:none;">${primaryLabel} &rarr;</a></td></tr></table>` : ''}
    ${management}
    <p class="email-copy" style="margin:24px 0 0;color:#666666;font-size:13px;line-height:1.6;">${input.hasTicket ? 'The PDF is your private ticket; your badge is for sharing. ' : ''}Keep this email and its private links. Reply here if you need a hand.</p>
    ${input.isTest ? '<p class="email-copy" style="margin:20px 0 0;color:#666666;font-size:12px;line-height:1.5;"><strong>TEST ONLY</strong> — No money was charged. These tickets and badges are for testing, not admission to DevCon26.</p>' : ''}`;

  return {
    subject: input.isTest ? `[TEST] ${subject}` : subject,
    html: renderSpeakerEmailLayout({ subject, preheader: explanation, brandMeta: ['DevCon26', '2026'], contentHtml,
      footerTitle: 'Made for the community', footerCopy: 'Your private links are for you. Badge links expire after 30 days. Payment receipts are sent by Paystack.' }).replace('</style>', `
      /* Keep both color modes on the same compact mobile grid. */
      .email-shell { border:1px solid ${design.border} !important; border-radius:${design.radius}px !important; }
      .email-brand-pad { padding:24px 32px !important; }
      .email-logo { width:190px !important; }
      .email-heading { font-size:30px !important; line-height:1.15 !important; }
      @media only screen and (max-width:640px) {
        .email-wrap { padding:16px 12px !important; }
        .email-pad { padding:24px !important; }
        .email-brand-pad { padding:20px 24px !important; }
        .email-logo { width:176px !important; }
        .email-heading { font-size:28px !important; }
        .email-copy { font-size:15px !important; line-height:1.6 !important; }
      }
      @media (prefers-color-scheme:dark) { .email-shell { border-color:#3A3A3A !important; } }
      [data-ogsc] .email-shell { border-color:#3A3A3A !important; }
    </style>`),
    text: [`Hi ${input.name},`, explanation, 'DevCon26 | Saturday, 19 December 2026', 'Ghana Digital Center, Accra',
      primaryUrl ? `${primaryLabel}: ${primaryUrl}` : '', input.badgeUrl && input.managementUrl ? `Manage your tickets: ${input.managementUrl}` : '',
      'Keep this email private. Your badge is separate from admission. Badge links expire after 30 days.',
      input.isTest ? 'TEST ONLY — No money was charged. These tickets and badges are for testing, not admission to DevCon26.' : ''].filter(Boolean).join('\n\n'),
  };
}
