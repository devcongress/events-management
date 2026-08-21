import { VOLUNTEER_PUBLIC_PATH } from '@/lib/volunteer-intake-routes';
import type { ShortLinkDestination } from '@/types/supabase';

export function staticShortLinkDestinationPath(destination: ShortLinkDestination): string | null {
  return destination === 'volunteer_intake' ? VOLUNTEER_PUBLIC_PATH : null;
}
