import { describe, expect, it } from 'vitest';
import { auditLogSections, registrationSections, resolveAuditLogSection, resolveRegistrationSection } from './organizer-workspace-sections';

describe('organizer workspace section queries', () => {
  it('restores only supported registration sections', () => {
    for (const section of registrationSections) expect(resolveRegistrationSection(section)).toBe(section);
    expect(resolveRegistrationSection(['guests'])).toBe('summary');
    expect(resolveRegistrationSection('invalid')).toBe('summary');
  });

  it('restores only supported audit log sections', () => {
    for (const section of auditLogSections) expect(resolveAuditLogSection(section)).toBe(section);
    expect(resolveAuditLogSection(['email-delivery'])).toBe('activity');
    expect(resolveAuditLogSection('invalid')).toBe('activity');
  });
});
