export type AnnualConferenceTicketEmailDeliveryConfiguration = {
  enabled: boolean;
  apiKey: string | null;
  from: string | null;
  replyTo: string | null;
};

export function annualConferenceTicketEmailDeliveryConfiguration(env: Record<string, string | undefined>): AnnualConferenceTicketEmailDeliveryConfiguration {
  const apiKey = env.RESEND_API_KEY?.trim() || null;
  const from = env.DEVCON26_TICKET_EMAIL_FROM?.trim() || null;
  const replyTo = env.DEVCON26_TICKET_EMAIL_REPLY_TO?.trim() || null;
  const enabled = env.DEVCON26_TICKET_EMAILS_ENABLED?.trim().toLowerCase() === 'true' && Boolean(apiKey && from && replyTo);

  return { enabled, apiKey: enabled ? apiKey : null, from: enabled ? from : null, replyTo: enabled ? replyTo : null };
}
