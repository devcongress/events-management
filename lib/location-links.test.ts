import { describe, expect, it } from 'vitest';
import { safeGoogleMapsUrl } from './location-links';

describe('safeGoogleMapsUrl', () => {
  it.each([
    'https://maps.app.goo.gl/n8u6C6TgdtW35db67',
    'https://www.google.com/maps/search/?api=1&query=5.5704282%2C-0.1888184',
    'https://maps.google.com/?q=Accra',
    'https://goo.gl/maps/example',
  ])('accepts a recognized HTTPS Google Maps URL: %s', (value) => {
    expect(safeGoogleMapsUrl(value)).toBeTruthy();
  });

  it.each([
    'http://maps.app.goo.gl/example',
    'https://example.com/maps/accra',
    'https://www.google.com/search?q=Accra',
    'https://user:password@maps.google.com/?q=Accra',
    'javascript:alert(1)',
  ])('rejects an unsafe or unrelated URL: %s', (value) => {
    expect(safeGoogleMapsUrl(value)).toBeNull();
  });
});
