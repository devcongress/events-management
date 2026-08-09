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
] as const;

export type AnnualConferenceCapability = typeof ANNUAL_CONFERENCE_CAPABILITIES[number];

export interface AnnualConferenceCapabilityDefinition {
  value: AnnualConferenceCapability;
  section: 'Work plan' | 'Timeline' | 'Volunteers' | 'Speakers' | 'Finance';
  label: string;
  description: string;
}

export const ANNUAL_CONFERENCE_CAPABILITY_DEFINITIONS: readonly AnnualConferenceCapabilityDefinition[] = [
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
    value: 'timeline.view',
    section: 'Timeline',
    label: 'View the timeline',
    description: 'Open the delivery timeline and see conference-wide planning dates.',
  },
  {
    value: 'phases.manage',
    section: 'Timeline',
    label: 'Manage phases',
    description: 'Create, reorder, edit, and remove delivery phases.',
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
  isPlanningOwner?: boolean;
}): AnnualConferenceCapability[] {
  const capabilities = new Set<AnnualConferenceCapability>(annualConferenceRoleCapabilities(input.role));
  for (const capability of input.grants ?? []) {
    if ((capability === 'finance.view' || capability.startsWith('speakers.')) && input.role === 'volunteer') continue;
    capabilities.add(capability);
  }
  if (input.isPlanningOwner) {
    capabilities.add('work_plan.manage');
    capabilities.add('phases.manage');
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

export function canDelegateAnnualConferenceCapability(
  capability: AnnualConferenceCapability,
  role: AdminRole,
): boolean {
  if (capability === 'finance.view' || capability.startsWith('speakers.')) return role === 'organizer';
  return role === 'volunteer';
}
