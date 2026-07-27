import { describe, expect, it } from 'vitest';
import { monthlyArchiveRequestEmail } from './monthly-archive-request';

describe('monthly archive request email', () => {
  it('embeds the private URL behind a CTA and escapes dynamic HTML', () => {
    const result = monthlyArchiveRequestEmail({
      eventName: 'DevCongress <July>',
      speakerName: 'Ama & Kojo',
      talkTitle: '"Workers" at scale',
      privateUrl: 'https://em.devcongress.org/speaker-talks/event/token',
      expiresAt: '2026-08-03T12:00:00.000Z',
    });

    expect(result.html).toContain('Add my presentation details');
    expect(result.html).toContain('href="https://em.devcongress.org/speaker-talks/event/token"');
    expect(result.html).toContain('Ama &amp; Kojo');
    expect(result.html).not.toContain('DevCongress <July>');
    expect(result.text).toContain('https://em.devcongress.org/speaker-talks/event/token');
  });
});
