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

describe('app boot route variants', () => {
  it('assigns a specific public shell to each public link family', () => {
    expect(appBootVariantForPathname('/r/devcongress-august')).toBe('registration');
    expect(appBootVariantForPathname('/register/event-id')).toBe('registration');
    expect(appBootVariantForPathname('/cfp/event-id')).toBe('cfp');
    expect(appBootVariantForPathname('/feedback/event-id')).toBe('feedback');
    expect(appBootVariantForPathname('/speaker-talks/event-id/token')).toBe('speaker');
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

  it('renders and rewrites the first-paint variant without changing the shell contract', () => {
    const publicMarkup = renderAppBootMarkup('/cfp/event-id');
    expect(publicMarkup).toContain('data-app-boot-variant="cfp"');
    expect(publicMarkup).toContain('data-app-boot-public="registration"');
    expect(publicMarkup).toContain('data-app-boot-public="cfp"');

    const staticHtml = '<section class="app-boot" aria-label="Opening the DevCongress organizer workspace" data-app-boot-variant="organizer"></section>';
    const rewrittenHtml = applyAppBootVariant(staticHtml, '/feedback/event-id');
    expect(rewrittenHtml).toContain('data-app-boot-variant="feedback"');
    expect(rewrittenHtml).toContain('aria-label="Loading the feedback form"');
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
