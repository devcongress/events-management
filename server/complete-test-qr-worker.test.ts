import { createRequire } from 'node:module';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { expect, it, vi } from 'vitest';

vi.mock('qrcode', () => {
  const require = createRequire(import.meta.url);

  // Match the entry selected by Workers' browser-aware bundling.
  return { default: require('qrcode/lib/browser.js') };
});

import { completeTestQrPng } from './complete-test-qr';

it('renders a decodable labeled test QR with the Worker/browser qrcode entry', async () => {
  const token = 'c'.repeat(64);
  const bytes = await completeTestQrPng(token);
  const image = PNG.sync.read(bytes);

  expect(image.width).toBe(600);
  expect(image.height).toBe(720);
  expect(jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data).toBe(token);
});
