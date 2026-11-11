import type { AdminRole } from '@/types/supabase';
import { adminPath } from './admin-routes';
import { TICKETING_VIEW_CAPABILITIES } from './ticketing-navigation';
import type { AnnualConferenceEdition } from '@/lib/annual-conference-work-plan';
import {
  hasAnyAnnualConferenceCapability,
  type AnnualConferenceCapability,
  VOLUNTEER_SECTION_CAPABILITIES,
} from '@/lib/annual-conference-capabilities';

export {
  LEGACY_DECEMBER_2026_VOLUNTEER_PUBLIC_PATH,
  VOLUNTEER_PUBLIC_PATH,
} from '@/lib/volunteer-intake-routes';

export function currentAnnualConferenceYear(date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Accra',
    year: 'numeric',
  }).format(date);
}

const currentYear = currentAnnualConferenceYear();

export const ACTIVE_ANNUAL_CONFERENCE_EDITION = {
  year: currentYear,
  label: `December ${currentYear}`,
  name: 'DevCongress Annual Conference',
} as const;

export function canCreateConferenceBadge(year: string, role?: AdminRole): boolean {
  return year === '2026' && role === 'volunteer';
}

export function mobileAnnualConferencePath(year: string = ACTIVE_ANNUAL_CONFERENCE_EDITION.year): string {
  return adminPath(`mobile/annual-conference/${encodeURIComponent(year)}`);
}

export function annualConferencePath(path = '', year: string = ACTIVE_ANNUAL_CONFERENCE_EDITION.year): string {
  const editionPath = `annual-conference/${year}`;

  return adminPath(path ? `${editionPath}/${path.replace(/^\/+/, '')}` : editionPath);
}

export function annualConferenceEditionsForNavigation(
  role: AdminRole | undefined,
  editions: AnnualConferenceEdition[],
  currentEdition?: AnnualConferenceEdition,
): AnnualConferenceEdition[] {
  if (role !== 'volunteer' && role !== 'member') return editions;

  return currentEdition ? [currentEdition] : [];
}

export const RESTRICTED_CONFERENCE_HOME = adminPath('conference-access');

export const REGISTRATION_VIEW_CAPABILITIES = [
  'registration.summary.view', 'registration.guests.view', 'registration.form.view',
  'registration.emails.view', 'registration.community.view', 'registration.blasts.view',
] as const;

export const SPEAKER_VIEW_CAPABILITIES = [
  'speakers.proposals.view', 'speakers.participation.view',
  'speakers.delivery.view', 'speakers.outcomes.view',
] as const;

const RESTRICTED_CONFERENCE_PLACES = [
  { path: 'work-plan', label: 'Work plan', icon: 'work-plan', capabilities: ['work_plan.tasks.view', 'work_plan.timeline.view', 'work_plan.phases.manage'] },
  { path: 'volunteers', label: 'Volunteers', icon: 'volunteers', capabilities: VOLUNTEER_SECTION_CAPABILITIES },
  { path: 'programme', label: 'Programme', icon: 'work-plan', capabilities: ['programme.view'] },
  { path: 'speakers', label: 'Speakers', icon: 'speakers', capabilities: SPEAKER_VIEW_CAPABILITIES },
  { path: 'ticketing', label: 'Ticketing', icon: 'tickets', capabilities: TICKETING_VIEW_CAPABILITIES },
  { path: 'registrations', label: 'Registration', icon: 'tickets', capabilities: REGISTRATION_VIEW_CAPABILITIES },
  { path: 'check-in', label: 'Check-in', icon: 'tickets', capabilities: ['ticketing.check_in'] },
  { path: 'finance', label: 'Finance', icon: 'finance', capabilities: ['finance.view'] },
] as const;

export function restrictedConferencePlaces(year: string, capabilities: readonly AnnualConferenceCapability[]) {
  return RESTRICTED_CONFERENCE_PLACES
    .filter((place) => hasAnyAnnualConferenceCapability(capabilities, place.capabilities))
    .map(({ path, label, icon }) => ({ href: annualConferencePath(path, year), label, icon }));
}

export function volunteerCanAccessOrganizerPath(
  path: string,
  capabilities: readonly AnnualConferenceCapability[] = [],
): boolean {
  return path === annualConferencePath()
    || (/^\/organizer-console\/annual-conference\/\d{4}\/ticketing$/.test(path)
      && hasAnyAnnualConferenceCapability(capabilities, TICKETING_VIEW_CAPABILITIES))
    || (/^\/organizer-console\/annual-conference\/\d{4}\/check-in$/.test(path)
      && hasAnyAnnualConferenceCapability(capabilities, ['ticketing.check_in']))
    || (/^\/organizer-console\/annual-conference\/\d{4}\/registrations$/.test(path)
      && hasAnyAnnualConferenceCapability(capabilities, REGISTRATION_VIEW_CAPABILITIES))
    || /^\/organizer-console\/annual-conference\/\d{4}\/work-plan$/.test(path)
    || /^\/organizer-console\/mobile\/annual-conference\/\d{4}$/.test(path)
    || (/^\/organizer-console\/annual-conference\/\d{4}\/timeline$/.test(path)
      && hasAnyAnnualConferenceCapability(capabilities, ['work_plan.timeline.view', 'work_plan.phases.manage']))
    || (/^\/organizer-console\/annual-conference\/\d{4}\/volunteers$/.test(path)
      && hasAnyAnnualConferenceCapability(capabilities, VOLUNTEER_SECTION_CAPABILITIES))
    || (/^\/organizer-console\/annual-conference\/\d{4}\/volunteers\/display$/.test(path)
      && hasAnyAnnualConferenceCapability(capabilities, ['volunteers.intake.share']))
    || (/^\/organizer-console\/annual-conference\/\d{4}\/speakers$/.test(path)
      && hasAnyAnnualConferenceCapability(capabilities, SPEAKER_VIEW_CAPABILITIES))
    || (/^\/organizer-console\/annual-conference\/\d{4}\/programme$/.test(path)
      && hasAnyAnnualConferenceCapability(capabilities, ['programme.view']))
    || (/^\/organizer-console\/annual-conference\/\d{4}\/finance$/.test(path)
      && hasAnyAnnualConferenceCapability(capabilities, ['finance.view']));
}

export function annualConferenceRegistrationTarget(
  capabilities: readonly AnnualConferenceCapability[],
  year: string = ACTIVE_ANNUAL_CONFERENCE_EDITION.year,
): string | null {
  if (hasAnyAnnualConferenceCapability(capabilities, REGISTRATION_VIEW_CAPABILITIES)) {
    return annualConferencePath('registrations', year);
  }

  if (hasAnyAnnualConferenceCapability(capabilities, ['ticketing.check_in'])) {
    return annualConferencePath('check-in', year);
  }

  return null;
}
