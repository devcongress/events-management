import type { AdminRole } from '@/types/supabase';

export const ANNUAL_CONFERENCE_CAPABILITIES = [
  'work_plan.tasks.view',
  'work_plan.tasks.manage',
  'work_plan.timeline.view',
  'work_plan.phases.manage',
  'volunteers.directory.view',
  'volunteers.intake.share',
  'volunteers.reviews.view',
  'volunteers.reviews.manage',
  'volunteers.campaign.view',
  'volunteers.campaign.manage',
  'volunteers.campaign.send',
  'programme.view',
  'programme.manage',
  'speakers.proposals.view',
  'speakers.proposals.manage',
  'speakers.participation.view',
  'speakers.participation.manage',
  'speakers.delivery.view',
  'speakers.delivery.manage',
  'speakers.delivery.retry',
  'speakers.outcomes.view',
  'speakers.outcomes.manage',
  'speakers.outcomes.send',
  'finance.view',
  'ticketing.overview.view',
  'ticketing.overview.manage',
  'ticketing.orders.view',
  'ticketing.orders.manage',
  'ticketing.delivery.view',
  'ticketing.delivery.manage',
  'ticketing.delivery.retry',
  'ticketing.sponsors.view',
  'ticketing.sponsors.manage',
  'ticketing.complimentary.view',
  'ticketing.complimentary.manage',
  'ticketing.coupons.view',
  'ticketing.coupons.manage',
  'registration.summary.view',
  'registration.guests.view',
  'registration.guests.manage',
  'registration.form.view',
  'registration.form.manage',
  'registration.emails.view',
  'registration.emails.manage',
  'registration.emails.retry',
  'registration.community.view',
  'registration.community.manage',
  'registration.blasts.view',
  'registration.blasts.manage',
  'registration.blasts.send',
  'ticketing.check_in',
] as const;

export type LeafAnnualConferenceCapability = typeof ANNUAL_CONFERENCE_CAPABILITIES[number];
export const LEGACY_ANNUAL_CONFERENCE_CAPABILITY_MAP = {
  'work_plan.view_all': ['work_plan.tasks.view'],
  'work_plan.manage': ['work_plan.tasks.view', 'work_plan.tasks.manage'],
  'timeline.view': ['work_plan.timeline.view'],
  'phases.manage': ['work_plan.phases.manage'],
  'volunteers.view_team': ['volunteers.directory.view'],
  'volunteers.share_intake': ['volunteers.intake.share'],
  'volunteers.review_applications': ['volunteers.reviews.view', 'volunteers.reviews.manage'],
  'speakers.view': ['speakers.proposals.view', 'speakers.participation.view'],
  'speakers.manage': ['speakers.proposals.view', 'speakers.proposals.manage', 'speakers.participation.view', 'speakers.participation.manage'],
  'ticketing.view': ['ticketing.overview.view', 'ticketing.orders.view', 'ticketing.delivery.view', 'ticketing.sponsors.view'],
  'ticketing.manage': ['ticketing.overview.view', 'ticketing.overview.manage', 'ticketing.orders.view', 'ticketing.orders.manage', 'ticketing.delivery.view', 'ticketing.delivery.manage', 'ticketing.sponsors.view', 'ticketing.sponsors.manage'],
  'registration.view': ['registration.summary.view', 'registration.guests.view'],
  'registration.manage': ['registration.summary.view', 'registration.guests.view', 'registration.guests.manage'],
} as const satisfies Record<string, readonly LeafAnnualConferenceCapability[]>;
export type LegacyAnnualConferenceCapability = keyof typeof LEGACY_ANNUAL_CONFERENCE_CAPABILITY_MAP;
// Legacy values remain accepted at old call sites while route authorization is migrated.
export type AnnualConferenceCapability = LeafAnnualConferenceCapability | LegacyAnnualConferenceCapability;
export interface AnnualConferenceCapabilityOverride {
  capability: AnnualConferenceCapability;
  enabled: boolean;
}
export interface AnnualConferenceCapabilityDefinition {
  value: LeafAnnualConferenceCapability;
  section: string;
  subsection: string;
  action: string;
  label: string;
  description: string;
}

type CapabilityAction = readonly [LeafAnnualConferenceCapability, string];
export interface AnnualConferenceCapabilitySection {
  section: string;
  subsections: readonly { label: string; actions: readonly CapabilityAction[] }[];
}

export const ANNUAL_CONFERENCE_CAPABILITY_SECTIONS: readonly AnnualConferenceCapabilitySection[] = [
  { section: 'Work plan', subsections: [
    { label: 'Tasks', actions: [['work_plan.tasks.view', 'View'], ['work_plan.tasks.manage', 'Manage']] },
    { label: 'Timeline', actions: [['work_plan.timeline.view', 'View']] },
    { label: 'Phases', actions: [['work_plan.phases.manage', 'Manage']] },
  ] },
  { section: 'Volunteers', subsections: [
    { label: 'Directory', actions: [['volunteers.directory.view', 'View']] },
    { label: 'Intake', actions: [['volunteers.intake.share', 'Share']] },
    { label: 'Reviews', actions: [['volunteers.reviews.view', 'View'], ['volunteers.reviews.manage', 'Manage']] },
    { label: 'Campaign', actions: [['volunteers.campaign.view', 'View'], ['volunteers.campaign.manage', 'Manage'], ['volunteers.campaign.send', 'Send']] },
  ] },
  { section: 'Programme', subsections: [{ label: 'Programme', actions: [['programme.view', 'View'], ['programme.manage', 'Manage']] }] },
  { section: 'Speakers', subsections: [
    { label: 'Proposals', actions: [['speakers.proposals.view', 'View'], ['speakers.proposals.manage', 'Manage']] },
    { label: 'Participation', actions: [['speakers.participation.view', 'View'], ['speakers.participation.manage', 'Manage']] },
    { label: 'Delivery', actions: [['speakers.delivery.view', 'View'], ['speakers.delivery.manage', 'Manage'], ['speakers.delivery.retry', 'Retry']] },
    { label: 'Outcome messages', actions: [['speakers.outcomes.view', 'View'], ['speakers.outcomes.manage', 'Manage'], ['speakers.outcomes.send', 'Send']] },
  ] },
  { section: 'Registration', subsections: [
    { label: 'Summary', actions: [['registration.summary.view', 'View']] },
    { label: 'Guests', actions: [['registration.guests.view', 'View'], ['registration.guests.manage', 'Manage']] },
    { label: 'Form & capacity', actions: [['registration.form.view', 'View'], ['registration.form.manage', 'Manage']] },
    { label: 'Emails', actions: [['registration.emails.view', 'View'], ['registration.emails.manage', 'Manage'], ['registration.emails.retry', 'Retry']] },
    { label: 'Community seats', actions: [['registration.community.view', 'View'], ['registration.community.manage', 'Manage']] },
    { label: 'Blasts', actions: [['registration.blasts.view', 'View'], ['registration.blasts.manage', 'Manage'], ['registration.blasts.send', 'Send']] },
  ] },
  { section: 'Ticketing', subsections: [
    { label: 'Overview', actions: [['ticketing.overview.view', 'View'], ['ticketing.overview.manage', 'Manage']] },
    { label: 'Orders', actions: [['ticketing.orders.view', 'View'], ['ticketing.orders.manage', 'Manage']] },
    { label: 'Delivery', actions: [['ticketing.delivery.view', 'View'], ['ticketing.delivery.manage', 'Manage'], ['ticketing.delivery.retry', 'Retry']] },
    { label: 'Sponsors', actions: [['ticketing.sponsors.view', 'View'], ['ticketing.sponsors.manage', 'Manage']] },
    { label: 'Complimentary', actions: [['ticketing.complimentary.view', 'View'], ['ticketing.complimentary.manage', 'Manage']] },
    { label: 'Coupons', actions: [['ticketing.coupons.view', 'View'], ['ticketing.coupons.manage', 'Manage']] },
  ] },
  { section: 'Finance', subsections: [{ label: 'Finance', actions: [['finance.view', 'View']] }] },
  { section: 'Check-in', subsections: [{ label: 'Check-in', actions: [['ticketing.check_in', 'Manage']] }] },
];

export const ANNUAL_CONFERENCE_CAPABILITY_DEFINITIONS: readonly AnnualConferenceCapabilityDefinition[] = ANNUAL_CONFERENCE_CAPABILITY_SECTIONS.flatMap(({ section, subsections }) =>
  subsections.flatMap(({ label: subsection, actions }) => actions.map(([value, action]) => ({
    value, section, subsection, action, label: `${subsection}: ${action}`, description: `${action} ${subsection.toLowerCase()} for this edition.`,
  }))));

const ORGANIZER_DEFAULT_CAPABILITIES: readonly LeafAnnualConferenceCapability[] = [
  'work_plan.tasks.view', 'work_plan.timeline.view', 'volunteers.directory.view', 'volunteers.intake.share',
  'volunteers.reviews.view', 'volunteers.reviews.manage', 'speakers.proposals.view', 'speakers.proposals.manage',
  'speakers.participation.view', 'speakers.participation.manage', 'programme.view', 'programme.manage',
];

function isLeaf(value: AnnualConferenceCapability): value is LeafAnnualConferenceCapability {
  return (ANNUAL_CONFERENCE_CAPABILITIES as readonly string[]).includes(value);
}

export function isAnnualConferenceCapability(value: unknown): value is LeafAnnualConferenceCapability {
  return typeof value === 'string' && (ANNUAL_CONFERENCE_CAPABILITIES as readonly string[]).includes(value);
}

export function annualConferenceRoleCapabilities(role: AdminRole): AnnualConferenceCapability[] {
  if (role === 'owner') return [...ANNUAL_CONFERENCE_CAPABILITIES];
  if (role === 'organizer') return [...ORGANIZER_DEFAULT_CAPABILITIES];

  return [];
}

export function canDelegateAnnualConferenceCapability(capability: AnnualConferenceCapability, role: AdminRole): boolean {
  if (!isLeaf(capability)) return false;
  if (role === 'member' || role === 'organizer') return true;
  if (role !== 'volunteer') return false;

  return ['work_plan.tasks.view', 'work_plan.tasks.manage', 'volunteers.directory.view',
    'volunteers.intake.share', 'volunteers.reviews.view', 'volunteers.reviews.manage', 'ticketing.check_in'].includes(capability);
}

export function annualConferenceCapabilityChanges(
  _role: AdminRole,
  capability: AnnualConferenceCapability,
  enabled: boolean,
): AnnualConferenceCapability[] {
  if (!isLeaf(capability)) return [capability];
  const parts = capability.split('.');
  const action = parts.pop();
  const prefix = parts.join('.');
  const view = `${prefix}.view` as LeafAnnualConferenceCapability;
  const manage = `${prefix}.manage` as LeafAnnualConferenceCapability;

  if (enabled && ['manage', 'send', 'retry'].includes(action ?? '') && isLeaf(view)) return [view, capability];
  if (!enabled && action === 'view') {
    return [capability, ...[manage, `${prefix}.send`, `${prefix}.retry`]
      .filter((dependent): dependent is LeafAnnualConferenceCapability => isLeaf(dependent as AnnualConferenceCapability))];
  }

  return [capability];
}

export function effectiveAnnualConferenceCapabilities(input: {
  role: AdminRole;
  grants?: readonly AnnualConferenceCapability[];
  overrides?: readonly AnnualConferenceCapabilityOverride[];
  isPlanningOwner?: boolean;
}): AnnualConferenceCapability[] {
  if (input.role === 'owner') return [...ANNUAL_CONFERENCE_CAPABILITIES];
  const capabilities = new Set<AnnualConferenceCapability>(annualConferenceRoleCapabilities(input.role));

  if (input.isPlanningOwner && input.role === 'organizer') {
    capabilities.add('work_plan.tasks.view');
    capabilities.add('work_plan.tasks.manage');
    capabilities.add('work_plan.phases.manage');
  }
  for (const capability of input.grants ?? []) {
    if (canDelegateAnnualConferenceCapability(capability, input.role)) {
      for (const change of annualConferenceCapabilityChanges(input.role, capability, true)) capabilities.add(change);
    }
  }
  const overrides = (input.overrides ?? []).filter(({ capability }) => canDelegateAnnualConferenceCapability(capability, input.role));

  for (const { capability, enabled } of overrides) {
    if (enabled) capabilities.add(capability);
    else capabilities.delete(capability);
  }
  // Explicit view denials win over manage, regardless of database row order.
  for (const { capability, enabled } of overrides) {
    if (!enabled && capability.endsWith('.view')) {
      for (const change of annualConferenceCapabilityChanges(input.role, capability, false)) capabilities.delete(change);
    }
  }
  for (const capability of [...capabilities]) {
    for (const change of annualConferenceCapabilityChanges(input.role, capability, true)) capabilities.add(change);
  }

  return ANNUAL_CONFERENCE_CAPABILITIES.filter((capability) => capabilities.has(capability));
}

export function hasAnnualConferenceCapability(
  capabilities: readonly AnnualConferenceCapability[],
  capability: AnnualConferenceCapability,
): boolean {
  if (isLeaf(capability)) return capabilities.includes(capability);

  return LEGACY_ANNUAL_CONFERENCE_CAPABILITY_MAP[capability].every((leaf) => capabilities.includes(leaf));
}

export function hasAnyAnnualConferenceCapability(
  capabilities: readonly AnnualConferenceCapability[],
  required: readonly AnnualConferenceCapability[],
): boolean {
  return required.some((capability) => hasAnnualConferenceCapability(capabilities, capability));
}

export const VOLUNTEER_SECTION_CAPABILITIES: readonly AnnualConferenceCapability[] = [
  'volunteers.directory.view', 'volunteers.intake.share', 'volunteers.reviews.view',
  'volunteers.reviews.manage', 'volunteers.campaign.view', 'volunteers.campaign.manage', 'volunteers.campaign.send',
];
