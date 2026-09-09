export const VOLUNTEER_NETWORK_BURST_LIMIT = {
  action: 'volunteer_application_burst',
  maxAttempts: 3,
  windowSeconds: 60,
} as const;

export const VOLUNTEER_NETWORK_DAILY_LIMIT = {
  action: 'volunteer_application_network_daily',
  maxAttempts: 10,
  windowSeconds: 24 * 60 * 60,
} as const;

export const VOLUNTEER_EMAIL_RETRY_LIMIT = {
  action: 'volunteer_application_email_daily',
  maxAttempts: 3,
  windowSeconds: 24 * 60 * 60,
} as const;

export function normalizedVolunteerEmailKey(email: string): string {
  return email.trim().toLowerCase();
}
