import { adminPath } from './admin-routes';
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

export function mobileAnnualConferencePath(year: string = ACTIVE_ANNUAL_CONFERENCE_EDITION.year): string {
  return adminPath(`mobile/annual-conference/${encodeURIComponent(year)}`);
}

export function annualConferencePath(path = '', year: string = ACTIVE_ANNUAL_CONFERENCE_EDITION.year): string {
  const editionPath = `annual-conference/${year}`;
  return adminPath(path ? `${editionPath}/${path.replace(/^\/+/, '')}` : editionPath);
}

export function annualConferenceEditionsForNavigation(
  role: 'owner' | 'organizer' | 'volunteer' | undefined,
  editions: AnnualConferenceEdition[],
  currentEdition?: AnnualConferenceEdition,
): AnnualConferenceEdition[] {
  if (role !== 'volunteer') return editions;
  return currentEdition ? [currentEdition] : [];
}

export function volunteerCanAccessOrganizerPath(
  path: string,
  capabilities: readonly AnnualConferenceCapability[] = [],
): boolean {
  return path === annualConferencePath()
    || path === annualConferencePath('work-plan')
    || /^\/organizer-console\/mobile\/annual-conference\/\d{4}$/.test(path)
    || (/^\/organizer-console\/annual-conference\/\d{4}\/timeline$/.test(path)
      && hasAnyAnnualConferenceCapability(capabilities, ['timeline.view', 'phases.manage']))
    || (/^\/organizer-console\/annual-conference\/\d{4}\/volunteers$/.test(path)
      && hasAnyAnnualConferenceCapability(capabilities, VOLUNTEER_SECTION_CAPABILITIES))
    || (/^\/organizer-console\/annual-conference\/\d{4}\/volunteers\/display$/.test(path)
      && hasAnyAnnualConferenceCapability(capabilities, ['volunteers.share_intake']));
}
