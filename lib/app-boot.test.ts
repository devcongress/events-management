import { describe, expect, it } from 'vitest';
import {
  APP_BOOT_STYLES,
  appBootVariantForPathname,
  applyAppBootVariant,
  renderAppBootMarkup,
} from './app-boot';
import { readFile } from 'node:fs/promises';

const viteConfig = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8');
const serverApp = await readFile(new URL('../server/app.ts', import.meta.url), 'utf8');
const pagesWorker = await readFile(new URL('../public/_worker.js', import.meta.url), 'utf8');
// The deployed Pages worker is JavaScript and intentionally has no separate TS declaration.
// @ts-expect-error Import it directly so the test exercises the real response transformation.
const pagesWorkerModule = await import('../public/_worker.js');
const pagesClassifierSource = pagesWorker.match(/function publicBootVariant\(pathname\) \{[\s\S]*?\n\}/)?.[0];

if (!pagesClassifierSource) throw new Error('Pages boot classifier is missing.');
const pagesPublicBootVariant = new Function(`${pagesClassifierSource}; return publicBootVariant;`)() as (pathname: string) => string;

describe('app boot route variants', () => {
  it('assigns a specific public shell to each public link family', () => {
    expect(appBootVariantForPathname('/r/devcongress-august')).toBe('registration');
    expect(appBootVariantForPathname('/register/event-id')).toBe('registration');
    expect(appBootVariantForPathname('/cfp/event-id')).toBe('cfp');
    expect(appBootVariantForPathname('/speak/m/event-id')).toBe('cfp');
    expect(appBootVariantForPathname('/speak/c/2026')).toBe('cfp');
    expect(appBootVariantForPathname('/feedback/event-id')).toBe('feedback');
    expect(appBootVariantForPathname('/speaker-talks/event-id/token')).toBe('speaker');
    expect(appBootVariantForPathname('/conference-speakers/2026/token')).toBe('speaker');
    expect(appBootVariantForPathname('/event-amendments')).toBe('speaker');
    expect(appBootVariantForPathname('/event-amendments/legacy-capability')).toBe('speaker');
    expect(appBootVariantForPathname('/volunteer')).toBe('volunteer');
    expect(appBootVariantForPathname('/volunteer/december-mega-meetup')).toBe('volunteer');
    expect(appBootVariantForPathname('/learn/system-design/ROOM42')).toBe('learning-room');
  });

  it('keeps organizer and unknown routes on the organizer boot shell', () => {
    expect(appBootVariantForPathname('/')).toBe('organizer');
    expect(appBootVariantForPathname('/organizer-console/events')).toBe('organizer');
    expect(appBootVariantForPathname('/present/system-design/session-id')).toBe('organizer');
    expect(appBootVariantForPathname('/unknown')).toBe('organizer');
  });

  it('keeps the Pages worker behavior aligned with public speaker and volunteer routes', () => {
    expect(pagesPublicBootVariant('/speak/m/event-id')).toBe('cfp');
    expect(pagesPublicBootVariant('/speak/c/2026')).toBe('cfp');
    expect(pagesPublicBootVariant('/conference-speakers/2026/token')).toBe('speaker');
    expect(pagesPublicBootVariant('/volunteer')).toBe('volunteer');
    expect(pagesPublicBootVariant('/organizer-console/events')).toBe('organizer');
  });

  it('renders and rewrites the first-paint variant without changing the shell contract', () => {
    const publicMarkup = renderAppBootMarkup('/cfp/event-id');

    expect(publicMarkup).toContain('data-app-boot-variant="cfp"');
    expect(publicMarkup).toContain('<div class="app-boot__organizer" hidden>');
    expect(publicMarkup).toContain('data-app-boot-public="registration" class="app-boot__public" hidden');
    expect(publicMarkup).toContain('data-app-boot-public="cfp" class="app-boot__public" aria-hidden="true"');

    const staticHtml = renderAppBootMarkup('/organizer-console');
    const rewrittenHtml = applyAppBootVariant(staticHtml, '/feedback/event-id');

    expect(rewrittenHtml).toContain('data-app-boot-variant="feedback"');
    expect(rewrittenHtml).toContain('aria-label="Loading the feedback form"');
    expect(rewrittenHtml).toContain('<div class="app-boot__organizer" hidden>');
    expect(rewrittenHtml).toContain('data-app-boot-public="cfp" class="app-boot__public" hidden');
    expect(rewrittenHtml).toContain('data-app-boot-public="feedback" class="app-boot__public" aria-hidden="true"');
  });

  it('hides organizer content in the Pages response before a redirected CFP hydrates', async () => {
    const response = await pagesWorkerModule.default.fetch(
      new Request('https://em.devcongress.org/speak/c/2026'),
      {
        ASSETS: {
          fetch: async () => new Response(renderAppBootMarkup('/organizer-console'), {
            headers: { 'content-type': 'text/html; charset=utf-8' },
          }),
        },
      },
    );
    const html = await response.text();

    expect(html).toContain('data-app-boot-variant="cfp"');
    expect(html).toContain('<div class="app-boot__organizer" hidden>');
    expect(html).toContain('data-app-boot-public="cfp" class="app-boot__public" aria-hidden="true"');
    expect(html).toContain('data-app-boot-public="speaker" class="app-boot__public" hidden');
  });

  it('serves first-paint styles as a same-origin stylesheet instead of an inline block', () => {
    expect(APP_BOOT_STYLES).toContain('.app-boot');
    expect(viteConfig).toContain('fileName: \'app-boot.css\'');
    expect(viteConfig).toContain('href="/app-boot.css"');
    expect(viteConfig).not.toContain('<style>${APP_BOOT_STYLES}</style>');
    expect(serverApp).toContain('href="/app-boot.css"');
    expect(serverApp).not.toContain('<style>${APP_BOOT_STYLES}</style>');
  });
});
