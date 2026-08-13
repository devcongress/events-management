import { describe, expect, it } from 'vitest';
import { meetupMediaPath, validateMeetupMediaContent, validateMeetupMediaFile } from './media';

function imageFile(bytes: Iterable<number>, name: string, type: string): File {
  return new File([Uint8Array.from(bytes).buffer], name, { type });
}

function writeUint32(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string) {
  bytes.set(new TextEncoder().encode(value), offset);
}

function pngFile(width: number, height: number): File {
  return imageFile([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
    (width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff,
    (height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff,
  ], 'cover.png', 'image/png');
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
    const png = pngFile(1600, 900);

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

  it('rejects images whose decoded canvas can exhaust downstream resources', async () => {
    await expect(validateMeetupMediaContent(pngFile(20_000, 20_000))).resolves.toBe(
      'Image dimensions must be 4096 × 4096 pixels or smaller',
    );
  });

  it('rejects a valid signature when dimensions cannot be verified', async () => {
    const truncated = imageFile(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      'cover.png',
      'image/png',
    );
    await expect(validateMeetupMediaContent(truncated)).resolves.toBe('Image dimensions could not be verified');
  });

  it('checks a large AVIF header without converting the whole bounded slice into function arguments', async () => {
    const bytes = new Uint8Array(512 * 1024);
    writeUint32(bytes, 0, 24);
    writeAscii(bytes, 4, 'ftyp');
    writeAscii(bytes, 8, 'avif');
    writeAscii(bytes, 16, 'mif1');
    writeAscii(bytes, 20, 'avif');
    writeUint32(bytes, 24, 48);
    writeAscii(bytes, 28, 'meta');
    writeUint32(bytes, 36, 36);
    writeAscii(bytes, 40, 'iprp');
    writeUint32(bytes, 44, 28);
    writeAscii(bytes, 48, 'ipco');
    writeUint32(bytes, 52, 20);
    writeAscii(bytes, 56, 'ispe');
    writeUint32(bytes, 64, 1600);
    writeUint32(bytes, 68, 900);

    await expect(validateMeetupMediaContent(imageFile(bytes, 'cover.avif', 'image/avif'))).resolves.toBeNull();
  });
});
