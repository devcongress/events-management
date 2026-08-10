import { describe, expect, it } from 'vitest';
import { EVENT_ANNOUNCEMENT_FALLBACK_COVER, publicEventCoverUrl } from './event-cover';

describe('public event cover resolution', () => {
  it('uses the agreed announcement fallback when no cover is supplied', () => {
    expect(publicEventCoverUrl(null)).toBe(EVENT_ANNOUNCEMENT_FALLBACK_COVER);
    expect(publicEventCoverUrl('')).toBe(EVENT_ANNOUNCEMENT_FALLBACK_COVER);
  });

  it.each([
    '/images/apr-meetup.jpg',
    '/images/event-fallback.png',
    '/images/logo.png',
    '/images/quarterly-april-meetup-2.jpeg',
  ])('replaces the legacy placeholder %s', (cover) => {
    expect(publicEventCoverUrl(cover)).toBe(EVENT_ANNOUNCEMENT_FALLBACK_COVER);
  });

  it('preserves an explicit safe uploaded cover', () => {
    expect(publicEventCoverUrl('https://storage.example.test/community-cover.webp'))
      .toBe('https://storage.example.test/community-cover.webp');
  });
});
