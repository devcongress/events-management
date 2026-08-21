import { describe, expect, it } from 'vitest';
import type { AnnualConferenceEdition } from '@/lib/annual-conference-work-plan';
import {
  LEGACY_DECEMBER_2026_VOLUNTEER_PUBLIC_PATH,
  VOLUNTEER_PUBLIC_PATH,
  annualConferenceEditionsForNavigation,
  annualConferencePath,
  currentAnnualConferenceYear,
  mobileAnnualConferencePath,
  volunteerCanAccessOrganizerPath,
} from './annual-conference';

const edition = (year: number): AnnualConferenceEdition => ({
  id: `edition-${year}`,
  year,
  name: 'DevCongress Annual Conference',
  label: `December ${year}`,
  provisional_date: `${year}-12-19`,
  date_status: 'provisional',
  venue_note: null,
  keynote_note: null,
  task_creator_email: 'owner@example.com',
  created_at: `${year}-01-01T00:00:00.000Z`,
  updated_at: `${year}-01-01T00:00:00.000Z`,
});

describe('volunteer organizer routes', () => {
  it('uses an evergreen volunteer form path while retaining the distributed legacy path', () => {
    expect(VOLUNTEER_PUBLIC_PATH).toBe('/volunteer');
    expect(LEGACY_DECEMBER_2026_VOLUNTEER_PUBLIC_PATH).toBe('/volunteer/december-mega-meetup');
  });

  it('allows only the conference overview and assigned work plan', () => {
    expect(volunteerCanAccessOrganizerPath(annualConferencePath())).toBe(true);
    expect(volunteerCanAccessOrganizerPath(annualConferencePath('work-plan'))).toBe(true);
    expect(volunteerCanAccessOrganizerPath(mobileAnnualConferencePath())).toBe(true);
    expect(volunteerCanAccessOrganizerPath(annualConferencePath('volunteers'))).toBe(false);
    expect(volunteerCanAccessOrganizerPath(annualConferencePath('timeline'), ['timeline.view'])).toBe(true);
    expect(volunteerCanAccessOrganizerPath(annualConferencePath('volunteers'), ['volunteers.view_team'])).toBe(true);
    expect(volunteerCanAccessOrganizerPath(annualConferencePath('volunteers/display'), ['volunteers.review_applications'])).toBe(false);
    expect(volunteerCanAccessOrganizerPath(annualConferencePath('volunteers/display'), ['volunteers.share_intake'])).toBe(true);
    expect(volunteerCanAccessOrganizerPath('/organizer-console/events')).toBe(false);
    expect(volunteerCanAccessOrganizerPath('/organizer-console/events/event-1/finance')).toBe(false);
    expect(volunteerCanAccessOrganizerPath('/organizer-console/organizers')).toBe(false);
  });

  it('uses the current Accra year for the default conference route', () => {
    expect(currentAnnualConferenceYear(new Date('2027-01-01T00:30:00.000Z'))).toBe('2027');
  });

  it('keeps volunteers on their current workspace edition even with no assigned tasks', () => {
    const currentEdition = edition(2026);

    expect(annualConferenceEditionsForNavigation('volunteer', [], currentEdition)).toEqual([currentEdition]);
    expect(annualConferenceEditionsForNavigation('organizer', [edition(2027), currentEdition], currentEdition))
      .toHaveLength(2);
  });
});
