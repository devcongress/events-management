import { describe, expect, it } from 'vitest';
import { annualConferencePath, volunteerCanAccessOrganizerPath } from './annual-conference';

describe('volunteer organizer routes', () => {
  it('allows only the conference overview and assigned work plan', () => {
    expect(volunteerCanAccessOrganizerPath(annualConferencePath())).toBe(true);
    expect(volunteerCanAccessOrganizerPath(annualConferencePath('work-plan'))).toBe(true);
    expect(volunteerCanAccessOrganizerPath(annualConferencePath('volunteers'))).toBe(false);
    expect(volunteerCanAccessOrganizerPath('/organizer-console/events')).toBe(false);
    expect(volunteerCanAccessOrganizerPath('/organizer-console/organizers')).toBe(false);
  });
});
