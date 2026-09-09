export const VOLUNTEER_EMAIL_RETRY_LIMIT = {
  action: 'volunteer_application_email_daily',
  maxAttempts: 3,
  windowSeconds: 24 * 60 * 60,
} as const;

export function normalizedVolunteerEmailKey(email: string): string {
  return email.trim().toLowerCase();
}
