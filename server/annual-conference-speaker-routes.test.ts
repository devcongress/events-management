import { describe, expect, it } from 'vitest';
import app from './app';

describe('Annual Conference speaker route registration', () => {
  it('mounts the complete feature surface exactly once', () => {
    const expectedRoutes = [
      ['GET', '/api/cfp/conferences/:year'],
      ['POST', '/api/cfp/conferences/:year'],
      ['GET', '/api/annual-conference/:year/speakers'],
      ['PATCH', '/api/annual-conference/:year/speakers/call'],
      ['PATCH', '/api/annual-conference/:year/speakers/logistics-deadline'],
      ['PATCH', '/api/annual-conference/:year/speaker-submissions/:submissionId'],
      ['POST', '/api/annual-conference/:year/speaker-submissions/:submissionId/resend-workspace-email'],
      ['GET', '/api/conferences/:year/speaker-intake/:token'],
      ['POST', '/api/conferences/:year/speaker-intake/:token'],
    ] as const;

    for (const [method, path] of expectedRoutes) {
      expect(app.routes.filter((route) => route.method === method && route.path === path)).toHaveLength(1);
    }
  });
});
