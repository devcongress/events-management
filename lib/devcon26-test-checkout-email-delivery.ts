import { z } from 'zod';
import { devcon26TestCheckoutConfiguration } from '@/lib/devcon26-test-checkout';
import type { ResendEmail } from '@/lib/email/resend';

const emailAddress = z.string().email().max(254);

export function sandboxEmailConfiguration(env: Record<string, string | undefined>) {
  const recipients = (env.DEVCON26_TEST_CHECKOUT_EMAIL_RECIPIENTS ?? '')
    .split(',').map((value) => value.trim().toLowerCase());
  const from = env.DEVCON26_TEST_CHECKOUT_EMAIL_FROM?.trim();
  const replyTo = env.DEVCON26_TEST_CHECKOUT_EMAIL_REPLY_TO?.trim();
  const apiKey = env.RESEND_API_KEY?.trim();

  if (env.DEVCON26_TEST_CHECKOUT_EMAILS_ENABLED?.trim().toLowerCase() !== 'true'
    || !devcon26TestCheckoutConfiguration(env) || !apiKey
    || !emailAddress.safeParse(from).success || !emailAddress.safeParse(replyTo).success
    || !recipients.length || recipients.some((value) => !emailAddress.safeParse(value).success)) return null;

  return { apiKey, from: from!, replyTo: replyTo!, recipients: new Set(recipients) };
}

export type SandboxEmailSummary = {
  recipient_email: string;
  recipient_name: string;
  tier_key: string;
  quantity: number;
  amount_minor: number;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

export function sandboxEmailContent(summary: SandboxEmailSummary, from: string, replyTo: string): ResendEmail {
  const tier = { regular: 'Regular', team_3: 'Team of 3', team_5: 'Team of 5' }[summary.tier_key] ?? 'Test selection';
  const paragraphs = [
    `Hi ${summary.recipient_name},`,
    'Your DevCon26 sandbox payment was confirmed.',
    `Test selection: ${tier} · ${summary.quantity} people · GHS ${(summary.amount_minor / 100).toFixed(2)}.`,
    'TEST ONLY — this is not an admission ticket. No real seats, tickets or QR codes have been issued.',
    'Sandbox social cards are local previews only. They are not saved, and this email does not provide a resume link.',
  ];

  return {
    from, to: [summary.recipient_email], reply_to: replyTo,
    subject: '[TEST] DevCon26 sandbox payment confirmed — not an admission ticket',
    text: paragraphs.join('\n\n'),
    html: paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join(''),
  };
}

export const sandboxProviderPayloadSchema = z.object({
  from: emailAddress,
  to: z.array(emailAddress).length(1),
  reply_to: emailAddress,
  subject: z.string().startsWith('[TEST]').max(200),
  text: z.string().max(10000),
  html: z.string().max(20000),
}).strict();
