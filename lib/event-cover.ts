import { safeWebsiteUrl } from '@/lib/safe-url';

export const EVENT_ANNOUNCEMENT_FALLBACK_COVER = '/images/event-announcement-fallback.png';

const LEGACY_EVENT_COVERS = new Set([
  '/images/apr-meetup.jpg',
  '/images/event-fallback.png',
  '/images/logo.png',
  '/images/quarterly-april-meetup-2.jpeg',
]);

export function publicEventCoverUrl(value: string | null | undefined): string {
  const cover = safeWebsiteUrl(value);
  return !cover || LEGACY_EVENT_COVERS.has(cover)
    ? EVENT_ANNOUNCEMENT_FALLBACK_COVER
    : cover;
}
