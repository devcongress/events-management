import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const outerWorker = await readFile(new URL('./_worker.js', import.meta.url), 'utf8');
const staticHeaders = await readFile(new URL('./_headers', import.meta.url), 'utf8');
const apiApp = await readFile(new URL('../server/app.ts', import.meta.url), 'utf8');

describe('deployed response-layer security parity', () => {
  it('sets the cross-domain policy at the static, Pages proxy, and API layers', () => {
    for (const source of [staticHeaders, outerWorker, apiApp]) {
      expect(source.toLowerCase()).toContain('x-permitted-cross-domain-policies');
      expect(source).toContain('none');
    }
  });

  it('keeps the allowlisted media frame origins at every CSP response layer', () => {
    for (const origin of [
      'https://challenges.cloudflare.com',
      'https://www.youtube.com',
      'https://www.youtube-nocookie.com',
      'https://player.vimeo.com',
    ]) {
      expect(staticHeaders).toContain(origin);
      expect(outerWorker).toContain(origin);
      expect(apiApp).toContain(origin);
    }
  });
});
