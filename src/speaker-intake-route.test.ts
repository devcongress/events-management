import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';
import {
  CONFERENCE_SPEAKER_INTAKE_ROUTE_NAME,
  SPEAKER_TALK_INTAKE_ROUTE_NAME,
  conferenceSpeakerIntakeRoute,
  speakerTalkIntakeRoute,
} from './speaker-intake-route';

describe('speaker talk intake route', () => {
  it('matches generated speaker links before the organizer fallback', () => {
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: [
        speakerTalkIntakeRoute,
        { path: '/:pathMatch(.*)*', redirect: '/organizer-console/events' },
      ],
    });

    const resolved = testRouter.resolve('/speaker-talks/event-123/private-token-456');

    expect(resolved.name).toBe(SPEAKER_TALK_INTAKE_ROUTE_NAME);
    expect(resolved.params).toEqual({
      eventId: 'event-123',
      token: 'private-token-456',
    });
    expect(resolved.redirectedFrom).toBeUndefined();
  });

  it('keeps Annual Conference presenter links outside event-scoped routes', () => {
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: [conferenceSpeakerIntakeRoute],
    });

    const resolved = testRouter.resolve('/conference-speakers/2026/private-token-456');

    expect(resolved.name).toBe(CONFERENCE_SPEAKER_INTAKE_ROUTE_NAME);
    expect(resolved.params).toEqual({ year: '2026', token: 'private-token-456' });
  });
});
