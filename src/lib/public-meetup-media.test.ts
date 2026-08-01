import { describe, expect, it } from 'vitest';
import { canEmbedPublicMeetupMedia, versionPublicMeetupMediaUrl } from './public-meetup-media';

describe('public meetup media embedding', () => {
  it.each([
    'https://www.youtube.com/embed/abc_DEF-123',
    'https://www.youtube-nocookie.com/embed/videoseries?list=PL123',
    'https://player.vimeo.com/video/123456789',
  ])('allows an approved HTTPS player URL: %s', (url) => {
    expect(canEmbedPublicMeetupMedia(url)).toBe(true);
  });

  it.each([
    'http://www.youtube.com/embed/abc123',
    'https://youtube.example.com/embed/abc123',
    'https://attacker.youtube.com/embed/abc123',
    'https://www.youtube.com/watch?v=abc123',
    'https://player.vimeo.com.evil.test/video/123456789',
    'https://player.vimeo.com:444/video/123456789',
    'javascript:alert(1)',
    'not-a-url',
  ])('rejects a non-approved player URL: %s', (url) => {
    expect(canEmbedPublicMeetupMedia(url)).toBe(false);
  });
});

describe('public meetup cover versioning', () => {
  it('adds the event revision to uploaded meetup media', () => {
    expect(versionPublicMeetupMediaUrl(
      'https://project.supabase.co/storage/v1/object/public/meetup-media/events/test/cover.webp',
      '2026-08-01T02:30:00.000Z',
    )).toContain('v=2026-08-01T02%3A30%3A00.000Z');
  });

  it('does not rewrite externally hosted covers', () => {
    const cover = 'https://images.example.com/event-cover.jpg';
    expect(versionPublicMeetupMediaUrl(cover, 'revision')).toBe(cover);
  });
});
