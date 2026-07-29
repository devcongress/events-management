export const ADMIN_AUTH_FAILURE_REASONS = [
  'access_denied',
  'oauth_failed',
  'rate_limited',
  'service_unavailable',
] as const;

export type AdminAuthFailureReason = typeof ADMIN_AUTH_FAILURE_REASONS[number];

export interface AdminAuthFailureCopy {
  title: string;
  description: string;
  actionLabel: string;
  note: string;
}

export function parseAdminAuthFailureReason(value: unknown): AdminAuthFailureReason | null {
  if (typeof value !== 'string') return null;
  return ADMIN_AUTH_FAILURE_REASONS.includes(value as AdminAuthFailureReason)
    ? value as AdminAuthFailureReason
    : null;
}

export function adminAuthFailureReasonForStatus(status: number): AdminAuthFailureReason {
  if (status === 403) return 'access_denied';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'service_unavailable';
  return 'oauth_failed';
}

export function adminAuthFailureCopy(reason: AdminAuthFailureReason): AdminAuthFailureCopy {
  switch (reason) {
    case 'access_denied':
      return {
        title: 'Organizer access required.',
        description: 'This Google account does not have access to the organizer workspace.',
        actionLabel: 'Use another Google account',
        note: 'Ask a DevCongress owner to approve your account if you need organizer access.',
      };
    case 'rate_limited':
      return {
        title: 'Too many attempts.',
        description: 'Sign-in is temporarily paused after several attempts.',
        actionLabel: 'Try Google sign-in again',
        note: 'Wait a few minutes before trying again.',
      };
    case 'service_unavailable':
      return {
        title: 'Access check unavailable.',
        description: 'The organizer session service could not complete the access check.',
        actionLabel: 'Try Google sign-in again',
        note: 'Try again shortly. Access remains closed until the check succeeds.',
      };
    case 'oauth_failed':
      return {
        title: 'Sign-in was not completed.',
        description: 'Google organizer sign-in could not be completed.',
        actionLabel: 'Try Google sign-in again',
        note: 'Choose an approved DevCongress organizer account.',
      };
  }
}
