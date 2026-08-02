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

    expect(result.subject).toBe('Share your talk resources: DevCongress <July>');
    expect(result.html).toContain('href="https://em.devcongress.org/speaker-talks/event/token"');
    expect(result.html).toContain('src="https://em.devcongress.org/brand/dev-con-logo.png"');
    expect(result.html).toContain('src="https://em.devcongress.org/brand/speaker-archive-illustration.png"');
    expect(result.html).toContain('Open your private form');
    expect(result.html).toContain('@media (prefers-color-scheme: dark)');
    expect(result.html).toContain('class="email-brand email-brand-pad"');
    expect(result.html).toContain('class="email-session-card"');
    expect(result.html).toContain('class="email-cta"');
    expect(result.html).not.toContain('email-cta-cell');
    expect(result.html).not.toContain('email-yellow-text-lock');
    expect(result.html).toContain('.email-wrap { padding: 20px 16px !important; }');
    expect(result.html).toContain('@media only screen and (max-width: 640px) and (prefers-color-scheme: dark)');
    expect(result.html).toContain('.email-wrap { padding: 14px 10px !important; }');
    expect(result.html).toContain('.email-logo { width: 166px !important; }');
    expect(result.html).toContain('background-image: linear-gradient(#1C1C1C, #1C1C1C) !important;');
    expect(result.html).toContain('background-image: linear-gradient(#161616, #161616) !important;');
    expect(result.html).toContain("font-family:'Inter','Helvetica Neue',Arial,sans-serif");
    expect(result.html).toContain("font-family:'IBM Plex Mono','Courier New',monospace");
    expect(result.html).toContain("src: url('https://em.devcongress.org/fonts/inter-800.woff2')");
    expect(result.html).toContain("src: url('https://em.devcongress.org/fonts/ibm-plex-mono-700.woff2')");
    expect(result.html).not.toContain('#fff2a8');
    expect(result.html).toContain('Hi Ama,');
    expect(result.html).not.toContain('Hi Ama &amp; Kojo,');
    expect(result.html).not.toContain('DevCongress <July>');
    expect(result.text).toContain('https://em.devcongress.org/speaker-talks/event/token');
  });

  it('truncates a long presentation title in HTML while retaining it in plain text', () => {
    const talkTitle = 'A'.repeat(80);
    const result = monthlyArchiveRequestEmail({
      eventName: 'DevCongress July Meetup',
      speakerName: 'Ama',
      talkTitle,
      privateUrl: 'https://em.devcongress.org/speaker-talks/event/token',
      expiresAt: '2026-08-03T12:00:00.000Z',
    });

    expect(result.html).toContain(`${'A'.repeat(55)}…`);
    expect(result.html).not.toContain(talkTitle);
    expect(result.text).toContain(talkTitle);
  });
});
