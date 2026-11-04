export const registrationSections = ['summary', 'guests', 'form', 'emails', 'blasts'] as const;
export const auditLogSections = ['activity', 'email-delivery', 'email-previews', 'short-links', 'archived-events'] as const;

export type RegistrationWorkspaceTab = (typeof registrationSections)[number];
export type AuditLogSection = (typeof auditLogSections)[number];

export function resolveRegistrationSection(value: unknown): RegistrationWorkspaceTab {
  return registrationSections.find((section) => section === value) ?? 'summary';
}

export function resolveAuditLogSection(value: unknown): AuditLogSection {
  return auditLogSections.find((section) => section === value) ?? 'activity';
}
