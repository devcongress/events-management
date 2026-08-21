import type { RouteRecordRaw } from 'vue-router';
import {
  LEGACY_DECEMBER_2026_VOLUNTEER_PUBLIC_PATH,
  VOLUNTEER_PUBLIC_PATH,
} from '@/lib/volunteer-intake-routes';

export const VOLUNTEER_INTAKE_ROUTE_NAME = 'volunteer-intake';

export const volunteerIntakeRoutes: RouteRecordRaw[] = [
  {
    path: LEGACY_DECEMBER_2026_VOLUNTEER_PUBLIC_PATH,
    redirect: VOLUNTEER_PUBLIC_PATH,
  },
  {
    path: VOLUNTEER_PUBLIC_PATH,
    name: VOLUNTEER_INTAKE_ROUTE_NAME,
    component: () => import('./views/VolunteerIntakeView.vue'),
  },
];
