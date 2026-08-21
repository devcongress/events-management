import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';
import {
  VOLUNTEER_INTAKE_ROUTE_NAME,
  volunteerIntakeRoutes,
} from './volunteer-intake-route';

describe('volunteer intake route', () => {
  it('uses the evergreen path as the canonical form route', () => {
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: volunteerIntakeRoutes,
    });

    expect(testRouter.resolve('/volunteer').name).toBe(VOLUNTEER_INTAKE_ROUTE_NAME);
  });

  it('redirects the distributed December path to the evergreen route', () => {
    const legacyRoute = volunteerIntakeRoutes.find((route) => route.path === '/volunteer/december-mega-meetup');

    expect(legacyRoute?.redirect).toBe('/volunteer');
  });
});
