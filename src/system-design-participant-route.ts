import type { RouteRecordRaw } from 'vue-router';

export const SYSTEM_DESIGN_PARTICIPANT_ROUTE_NAME = 'system-design-participant';

export function systemDesignParticipantPath(joinCode: string): string {
  return `/learn/system-design/${encodeURIComponent(joinCode)}`;
}

export const systemDesignParticipantRoute: RouteRecordRaw = {
  path: '/learn/system-design/:code',
  name: SYSTEM_DESIGN_PARTICIPANT_ROUTE_NAME,
  component: () => import('./views/SystemDesignParticipantView.vue'),
};
