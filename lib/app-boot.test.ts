import { describe, expect, it } from 'vitest';
import {
  appBootVariantForPathname,
  applyAppBootVariant,
  renderAppBootMarkup,
} from './app-boot';

describe('app boot route variants', () => {
  it('assigns a specific public shell to each public link family', () => {
    expect(appBootVariantForPathname('/r/devcongress-august')).toBe('registration');
    expect(appBootVariantForPathname('/register/event-id')).toBe('registration');
    expect(appBootVariantForPathname('/cfp/event-id')).toBe('cfp');
    expect(appBootVariantForPathname('/feedback/event-id')).toBe('feedback');
    expect(appBootVariantForPathname('/speaker-talks/event-id/token')).toBe('speaker');
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

    const staticHtml = '<div id="app" data-app-boot-variant="organizer"></div>';
    expect(applyAppBootVariant(staticHtml, '/feedback/event-id'))
      .toContain('data-app-boot-variant="feedback"');
  });
});
