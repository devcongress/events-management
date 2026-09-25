import { VOLUNTEER_PUBLIC_PATH } from '@/lib/volunteer-intake-routes';
import type { ShortLinkDestination } from '@/types/supabase';

export const VOLUNTEER_FOLLOW_UP_TEST_PATH = '/volunteer/follow-up/test';

export function staticShortLinkDestinationPath(destination: ShortLinkDestination): string | null {
  if (destination === 'volunteer_intake') return VOLUNTEER_PUBLIC_PATH;
  if (destination === 'volunteer_follow_up_test') return VOLUNTEER_FOLLOW_UP_TEST_PATH;

  return null;
}
