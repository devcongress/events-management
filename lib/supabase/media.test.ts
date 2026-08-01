import { describe, expect, it } from 'vitest';
import { meetupMediaPath, validateMeetupMediaContent, validateMeetupMediaFile } from './media';

function imageFile(bytes: number[], name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('meetup media validation', () => {
  it('gives every cover upload a versioned immutable path', () => {
    expect(meetupMediaPath('This is a Test Meetup', 'cover', 'webp', 'first-id')).toBe(
      'events/this-is-a-test-meetup/covers/first-id.webp',
    );
    expect(meetupMediaPath('This is a Test Meetup', 'cover', 'webp', 'next-id')).not.toBe(
      meetupMediaPath('This is a Test Meetup', 'cover', 'webp', 'first-id'),
    );
  });

  it('accepts an image only when its declared type and signature agree', async () => {
    const png = imageFile(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00],
      'cover.png',
      'image/png',
    );

    expect(validateMeetupMediaFile(png)).toBeNull();
    await expect(validateMeetupMediaContent(png)).resolves.toBeNull();
  });

  it('rejects active content renamed and labelled as an image', async () => {
    const disguisedHtml = imageFile(
      [...new TextEncoder().encode('<script>alert(1)</script>')],
      'cover.png',
      'image/png',
    );

    expect(validateMeetupMediaFile(disguisedHtml)).toBeNull();
    await expect(validateMeetupMediaContent(disguisedHtml)).resolves.toBe(
      'The file contents do not match the selected image type',
    );
  });
});
