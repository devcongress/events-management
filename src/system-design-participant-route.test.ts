import { describe, expect, it } from 'vitest';
import {
  SYSTEM_DESIGN_PARTICIPANT_ROUTE_NAME,
  systemDesignParticipantPath,
  systemDesignParticipantRoute,
} from './system-design-participant-route';

describe('public System Design participant route', () => {
  it('registers a dedicated attendee page without organizer auth metadata', () => {
    expect(systemDesignParticipantRoute).toMatchObject({
      path: '/learn/system-design/:code',
      name: SYSTEM_DESIGN_PARTICIPANT_ROUTE_NAME,
    });
    expect(systemDesignParticipantRoute.meta?.requiresOrganizer).not.toBe(true);
    expect(systemDesignParticipantPath('ABC 234')).toBe('/learn/system-design/ABC%20234');
  });
});
