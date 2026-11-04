import type { AdminSessionResponse } from './api';
import { adminPath, isAdminPath, safeInternalAppPath } from '../admin-routes';
import { isSystemDesignPresenterPath } from '../system-design-presenter-route';

export const ORGANIZER_SESSION_LOCK_STORAGE_KEY = 'organizer-session-lock';

function safeProtectedPath(value: unknown): string | null {
  const path = safeInternalAppPath(value);

  if (!path) return null;
  const pathname = new URL(path, 'https://app.devcongress.invalid').pathname;

  if (pathname === adminPath('login') || pathname === adminPath('auth/callback')) return null;

  if (!isAdminPath(pathname) && !isSystemDesignPresenterPath(pathname)) return null;

  const parsed = new URL(path, 'https://app.devcongress.invalid');
  const allowedValues: Record<string, readonly string[]> = {
    section: ['overview', 'volunteers', 'work-plan', 'tasks', 'timeline', 'submissions', 'events', 'attendance', 'feedback', 'summary', 'guests', 'form', 'emails', 'blasts', 'activity', 'email-delivery', 'email-previews', 'short-links', 'archived-events', 'community', 'proposals', 'participation', 'outcome-messages', 'delivery', 'orders', 'testing', 'sponsors'],
    volunteerView: ['directory', 'reviews', 'campaign'],
    campaignTab: ['updates', 'outcomes', 'invitations', 'settings'],
    from: ['attendance', 'feedback'],
    view: ['attendance', 'feedback', 'responses'],
  };
  const query = new URLSearchParams();

  for (const [key, values] of Object.entries(allowedValues)) {
    const value = parsed.searchParams.get(key);

    if (value && values.includes(value)) query.set(key, value);
  }
  const month = parsed.searchParams.get('month');

  if (month && /^\d{4}-\d{2}$/.test(month)) query.set('month', month);

  return `${pathname}${query.size ? `?${query}` : ''}`;
}

export function readOrganizerSessionLock(): string | null {
  try {
    return safeProtectedPath(window.sessionStorage.getItem(ORGANIZER_SESSION_LOCK_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveOrganizerSessionLock(path: string): void {
  const safePath = safeProtectedPath(path);

  if (!safePath) return;
  try {
    window.sessionStorage.setItem(ORGANIZER_SESSION_LOCK_STORAGE_KEY, safePath);
  } catch {
    // The in-memory lock still protects this page if storage is unavailable.
  }
}

export function clearOrganizerSessionLock(): void {
  try {
    window.sessionStorage.removeItem(ORGANIZER_SESSION_LOCK_STORAGE_KEY);
  } catch {
    // Storage may be unavailable in private browsing.
  }
}

export function organizerDeadlineState(now: number, lastActivityAt: number, absoluteExpiryAt: number | null): 'active' | 'warning' | 'expired' {
  if ((absoluteExpiryAt !== null && now >= absoluteExpiryAt) || now - lastActivityAt >= 30 * 60 * 1000) return 'expired';
  if (now - lastActivityAt >= 28 * 60 * 1000) return 'warning';

  return 'active';
}

export function shouldRedirectUnauthenticatedOrganizer(input: {
  authenticated: boolean | undefined;
  warningOpen: boolean;
  sessionEnding: boolean;
}): boolean {
  return input.authenticated === false && !input.warningOpen && !input.sessionEnding;
}

export function matchesObservedOrganizerSession(
  observed: { instanceId?: string; email?: string | null; role?: string | null },
  session: AdminSessionResponse,
): boolean {
  return session.authenticated
    && (!observed.instanceId || session.session_instance_id === observed.instanceId)
    && (observed.email === undefined || session.user?.email === observed.email)
    && (observed.role === undefined || session.user?.role === observed.role);
}
