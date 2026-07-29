import { describe, expect, it } from 'vitest';
import {
  adminAuthFailureCopy,
  adminAuthFailureReasonForStatus,
  parseAdminAuthFailureReason,
} from './admin-auth-flow';

describe('admin auth failure states', () => {
  it('accepts only the allowlisted failure reasons used by the login surface', () => {
    expect(parseAdminAuthFailureReason('access_denied')).toBe('access_denied');
    expect(parseAdminAuthFailureReason('oauth_failed')).toBe('oauth_failed');
    expect(parseAdminAuthFailureReason('unexpected_internal_error')).toBeNull();
    expect(parseAdminAuthFailureReason(['access_denied'])).toBeNull();
  });

  it('maps exchange responses to bounded, non-sensitive UI states', () => {
    expect(adminAuthFailureReasonForStatus(403)).toBe('access_denied');
    expect(adminAuthFailureReasonForStatus(429)).toBe('rate_limited');
    expect(adminAuthFailureReasonForStatus(503)).toBe('service_unavailable');
    expect(adminAuthFailureReasonForStatus(401)).toBe('oauth_failed');
  });

  it('does not expose membership records or provider error details in denial copy', () => {
    const copy = adminAuthFailureCopy('access_denied');

    expect(copy.description).toBe('This Google account does not have access to the organizer workspace.');
    expect(copy.description).not.toContain('@');
    expect(copy.description).not.toContain('membership');
    expect(copy.actionLabel).toBe('Use another Google account');
  });
});
