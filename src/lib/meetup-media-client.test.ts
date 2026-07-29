import { describe, expect, it } from 'vitest';
import {
  SOURCE_IMAGE_MAX_BYTES,
  validateMeetupImageFile,
} from './meetup-media-client';

function imageFile(size: number, type: string): File {
  return { size, type } as File;
}

describe('validateMeetupImageFile', () => {
  it('accepts supported images within the source limit', () => {
    expect(validateMeetupImageFile(imageFile(SOURCE_IMAGE_MAX_BYTES, 'image/webp'))).toBeNull();
  });

  it('rejects source images above 15MB', () => {
    expect(validateMeetupImageFile(imageFile(SOURCE_IMAGE_MAX_BYTES + 1, 'image/png')))
      .toBe('Image must be 15MB or smaller before compression.');
  });

  it('rejects unsupported file types', () => {
    expect(validateMeetupImageFile(imageFile(1000, 'image/svg+xml')))
      .toBe('Use an AVIF, JPEG, PNG, or WebP image.');
  });
});
