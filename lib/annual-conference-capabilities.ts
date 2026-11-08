import type { AdminRole } from '@/types/supabase';

export const ANNUAL_CONFERENCE_CAPABILITIES = [
  'work_plan.view_all',
  'work_plan.manage',
  'timeline.view',
  'phases.manage',
  'volunteers.view_team',
  'volunteers.share_intake',
  'volunteers.review_applications',
  'speakers.view',
  'speakers.manage',
  'finance.view',
  'ticketing.view',
  'ticketing.manage',
  'registration.view',
  'registration.manage',
  'ticketing.check_in',
] as const;

export type AnnualConferenceCapability = typeof ANNUAL_CONFERENCE_CAPABILITIES[number];
export interface AnnualConferenceCapabilityOverride {
  capability: AnnualConferenceCapability;
  enabled: boolean;
}

export interface AnnualConferenceCapabilityDefinition {
  value: AnnualConferenceCapability;
  section: 'Work plan' | 'Volunteers' | 'Speakers' | 'Finance' | 'Ticketing' | 'Registration' | 'Check-in';
  label: string;
  description: string;
}

export const ANNUAL_CONFERENCE_CAPABILITY_DEFINITIONS: readonly AnnualConferenceCapabilityDefinition[] = [
  {
    value: 'ticketing.check_in',
    section: 'Check-in',
    label: 'Check in attendees',
    description: 'Scan admission QR codes for this edition without access to finances or ticketing administration.',
  },
  {
    value: 'work_plan.view_all',
    section: 'Work plan',
    label: 'View the full work plan',
    description: 'See every conference task instead of assigned tasks only.',
  },
  {
    value: 'work_plan.manage',
    section: 'Work plan',
    label: 'Manage the work plan',
    description: 'Create tasks and edit every task, including internal planning details.',
  },
  {
    value: 'volunteers.view_team',
    section: 'Volunteers',
    label: 'View the volunteer team',
    description: 'See active volunteer names and roles without private applicant details.',
  },
  {
    value: 'volunteers.share_intake',
    section: 'Volunteers',
    label: 'Share the volunteer form',
    description: 'Open the form, copy its link, and display its QR code.',
  },
  {
    value: 'volunteers.review_applications',
    section: 'Volunteers',
    label: 'Review volunteer applications',
    description: 'See applicant names, email addresses, and social handles.',
  },
  {
    value: 'speakers.view',
    section: 'Speakers',
    label: 'View conference proposals',
    description: 'See conference Call for Speakers submissions and their review status.',
  },
  {
    value: 'speakers.manage',
    section: 'Speakers',
    label: 'Manage conference speakers',
    description: 'Open or close the call and select or decline conference proposals.',
  },
  {
    value: 'finance.view',
    section: 'Finance',
    label: 'View the finance workspace',
    description: 'See the private GHS budget, expenses, income, and financial summary for this edition.',
  },
  {
    value: 'ticketing.view',
    section: 'Ticketing',
    label: 'View ticketing',
    description: 'See ticket capacity, prices, orders, delivery status, and sponsor allocations for this edition.',
  },
  {
    value: 'registration.view',
    section: 'Registration',
    label: 'View registration',
    description: 'See the registration summary and guest list for this edition.',
  },
  {
    value: 'registration.manage',
    section: 'Registration',
    label: 'Manage registrations',
    description: 'View the guest list and cancel individual registrations. Campaigns and settings require separate access.',
  },
  {
    value: 'ticketing.manage',
    section: 'Ticketing',
    label: 'Manage ticketing',
    description: 'Manage ticket capacity, prices, orders, delivery operations, and sponsor allocations for this edition.',
  },
] as const;

const ORGANIZER_DEFAULT_CAPABILITIES: readonly AnnualConferenceCapability[] = [
  'work_plan.view_all',
  'timeline.view',
  'volunteers.view_team',
  'volunteers.share_intake',
  'volunteers.review_applications',
  'speakers.view',
  'speakers.manage',
];

export function isAnnualConferenceCapability(value: unknown): value is AnnualConferenceCapability {
  return typeof value === 'string'
    && (ANNUAL_CONFERENCE_CAPABILITIES as readonly string[]).includes(value);
}

export function annualConferenceRoleCapabilities(role: AdminRole): AnnualConferenceCapability[] {
  if (role === 'owner') return [...ANNUAL_CONFERENCE_CAPABILITIES];
  if (role === 'organizer') return [...ORGANIZER_DEFAULT_CAPABILITIES];

  return [];
}

export function effectiveAnnualConferenceCapabilities(input: {
  role: AdminRole;
  grants?: readonly AnnualConferenceCapability[];
  overrides?: readonly AnnualConferenceCapabilityOverride[];
  isPlanningOwner?: boolean;
}): AnnualConferenceCapability[] {
  const capabilities = new Set<AnnualConferenceCapability>(annualConferenceRoleCapabilities(input.role));

  for (const capability of input.grants ?? []) {
    if (input.role === 'member' && !canDelegateAnnualConferenceCapability(capability, input.role)) continue;
    if ((capability === 'finance.view' || capability.startsWith('speakers.') || capability === 'ticketing.manage') && input.role === 'volunteer') continue;
    capabilities.add(capability);
  }
  if (input.isPlanningOwner && input.role !== 'member') {
    capabilities.add('work_plan.manage');
    capabilities.add('phases.manage');
  }
  for (const override of input.overrides ?? []) {
    if (input.role === 'member' && !canDelegateAnnualConferenceCapability(override.capability, input.role)) continue;
    if (override.enabled) capabilities.add(override.capability);
    else capabilities.delete(override.capability);
  }
  if (input.role === 'member') {
    if (capabilities.has('work_plan.manage')) capabilities.add('work_plan.view_all');
    if (capabilities.has('ticketing.manage')) capabilities.add('ticketing.view');
    if (capabilities.has('registration.manage')) capabilities.add('registration.view');
    if (capabilities.has('speakers.manage')) capabilities.add('speakers.view');
  }

  return ANNUAL_CONFERENCE_CAPABILITIES.filter((capability) => capabilities.has(capability));
}

export function hasAnnualConferenceCapability(
  capabilities: readonly AnnualConferenceCapability[],
  capability: AnnualConferenceCapability,
): boolean {
  return capabilities.includes(capability);
}

export function hasAnyAnnualConferenceCapability(
  capabilities: readonly AnnualConferenceCapability[],
  required: readonly AnnualConferenceCapability[],
): boolean {
  return required.some((capability) => capabilities.includes(capability));
}

export const VOLUNTEER_SECTION_CAPABILITIES: readonly AnnualConferenceCapability[] = [
  'volunteers.view_team',
  'volunteers.share_intake',
  'volunteers.review_applications',
];

const WORK_PLAN_PERMISSION_PAIR = ['work_plan.view_all', 'work_plan.manage'] as const;
const RESTRICTED_PERMISSION_PAIRS = [
  WORK_PLAN_PERMISSION_PAIR,
  ['speakers.view', 'speakers.manage'],
  ['ticketing.view', 'ticketing.manage'],
  ['registration.view', 'registration.manage'],
] as const;

export function annualConferenceCapabilityChanges(
  role: AdminRole,
  capability: AnnualConferenceCapability,
  enabled: boolean,
): AnnualConferenceCapability[] {
  const pairs = role === 'member' ? RESTRICTED_PERMISSION_PAIRS : [WORK_PLAN_PERMISSION_PAIR];
  const pair = pairs.find(([view, manage]) => enabled ? capability === manage : capability === view);

  return pair ? [...pair] : [capability];
}

export function canDelegateAnnualConferenceCapability(
  capability: AnnualConferenceCapability,
  role: AdminRole,
): boolean {
  if (role === 'member') {
    return ANNUAL_CONFERENCE_CAPABILITY_DEFINITIONS.some((definition) => definition.value === capability);
  }
  if (role === 'organizer') {
    return capability !== 'ticketing.view' && !capability.startsWith('registration.')
      && ANNUAL_CONFERENCE_CAPABILITY_DEFINITIONS.some((definition) => definition.value === capability);
  }

  return role === 'volunteer' && (
    capability.startsWith('work_plan.') || capability.startsWith('volunteers.') || capability === 'ticketing.check_in'
  );
}
