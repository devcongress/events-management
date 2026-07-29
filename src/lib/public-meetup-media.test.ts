import { describe, expect, it } from 'vitest';
import { canEmbedPublicMeetupMedia } from './public-meetup-media';

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
