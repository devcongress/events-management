import type { RouteRecordRaw } from 'vue-router';

export const SPEAKER_TALK_INTAKE_ROUTE_NAME = 'speaker-talk-intake';
export const CONFERENCE_SPEAKER_INTAKE_ROUTE_NAME = 'conference-speaker-intake';

export const speakerTalkIntakeRoute: RouteRecordRaw = {
  path: '/speaker-talks/:eventId/:token',
  name: SPEAKER_TALK_INTAKE_ROUTE_NAME,
  component: () => import('./views/SpeakerTalkIntakeView.vue'),
};

export const conferenceSpeakerIntakeRoute: RouteRecordRaw = {
  path: '/conference-speakers/:year(\\d{4})/:token',
  name: CONFERENCE_SPEAKER_INTAKE_ROUTE_NAME,
  component: () => import('./views/SpeakerTalkIntakeView.vue'),
};
