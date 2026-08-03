import { adminPath } from './admin-routes';

export const ACTIVE_ANNUAL_CONFERENCE_EDITION = {
  year: '2026',
  label: 'December 2026',
  name: 'DevCongress Annual Conference',
} as const;

export const DECEMBER_2026_VOLUNTEER_PUBLIC_PATH = '/volunteer/december-mega-meetup';

export function mobileAnnualConferencePath(year: string = ACTIVE_ANNUAL_CONFERENCE_EDITION.year): string {
  return adminPath(`mobile/annual-conference/${encodeURIComponent(year)}`);
}

export function annualConferencePath(path = '', year: string = ACTIVE_ANNUAL_CONFERENCE_EDITION.year): string {
  const editionPath = `annual-conference/${year}`;
  return adminPath(path ? `${editionPath}/${path.replace(/^\/+/, '')}` : editionPath);
}

export function volunteerCanAccessOrganizerPath(path: string): boolean {
  return path === annualConferencePath()
    || path === annualConferencePath('work-plan')
    || /^\/organizer-console\/mobile\/annual-conference\/\d{4}$/.test(path);
}
