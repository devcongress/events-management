export type AnnualConferenceSocialCardEmailDeliveryConfiguration = {
  enabled: boolean;
  apiKey: string | null;
  from: string | null;
  replyTo: string | null;
};

export function annualConferenceSocialCardEmailDeliveryConfiguration(env: Record<string, string | undefined>): AnnualConferenceSocialCardEmailDeliveryConfiguration {
  const apiKey = env.RESEND_API_KEY?.trim() || null;
  const from = env.DEVCON26_SOCIAL_CARD_EMAIL_FROM?.trim() || null;
  const replyTo = env.DEVCON26_SOCIAL_CARD_EMAIL_REPLY_TO?.trim() || null;
  const enabled = env.DEVCON26_SOCIAL_CARD_EMAILS_ENABLED?.trim().toLowerCase() === 'true' && Boolean(apiKey && from && replyTo);

  return { enabled, apiKey: enabled ? apiKey : null, from: enabled ? from : null, replyTo: enabled ? replyTo : null };
}

export function annualConferenceSocialCardManagementUrl(capability: string): string {
  return `https://devcongress.org/devcon26/social-card/#${capability}`;
}

export function annualConferenceSocialCardCollectionManagementUrl(capability: string): string {
  return `https://devcongress.org/devcon26/social-card/#collection=${capability}`;
}
