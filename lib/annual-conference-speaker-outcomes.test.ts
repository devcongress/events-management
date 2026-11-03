import { describe, expect, it } from 'vitest';
import { defaultSpeakerOutcomeMessage, isLegacyDefaultAcceptance, renderSpeakerOutcomeMessage } from './annual-conference-speaker-outcomes';

describe('speaker outcome message', () => {
  it('personalizes the suggested acceptance in text and escaped HTML', () => {
    const template = defaultSpeakerOutcomeMessage('edition-1', 'acceptance');
    const result = renderSpeakerOutcomeMessage({
      template,
      speakerName: 'Ama Mensah',
      talkTitle: 'Tools <for> all',
      edition: 'December 2026',
      year: '2026',
      deadline: 'November 30, 2026',
      workspaceUrl: 'https://example.org/private',
      sessionFormat: 'short talk',
      sessionDuration: '25 minutes',
      conferenceDate: '19 December 2026',
      conferenceVenue: 'Ghana Digital Center, Accra',
    });

    expect(result.subject).toBe('You’re in! Your DevCon 2026 proposal has been accepted');
    expect(result.text).toContain('Hi Ama,');
    expect(result.text).toContain('Format: short talk\nDuration: 25 minutes\nDate: 19 December 2026\nVenue: Ghana Digital Center, Accra');
    expect(result.text).toContain('by November 30, 2026');
    expect(result.text).not.toMatch(/\{\w+\}/);
    expect(result.html).toContain('Tools &lt;for&gt; all');
    expect(result.html).toContain('Open private link &rarr;');
    expect(result.html).toContain('href="mailto:events@devcongress.org"');
    expect(result.html).toContain('Website</a>');
    expect(result.text).toContain('https://example.org/private');
    expect(result.html).toContain('href="https://example.org/private"');
  });

  it('preserves existing template placeholders and custom copy', () => {
    const template = { ...defaultSpeakerOutcomeMessage('edition-1', 'acceptance'), subject: 'Custom {edition}', message: 'Hello {first_name}: {workspace_url}' };
    const result = renderSpeakerOutcomeMessage({ template, speakerName: 'Ama', talkTitle: 'Talk', edition: '2026', deadline: '', workspaceUrl: 'https://example.org/private' });

    expect(result.subject).toBe('Custom 2026');
    expect(result.text).toBe('Hello Ama: https://example.org/private');
  });
  it('recognizes only the untouched old acceptance default', () => {
    const old = { ...defaultSpeakerOutcomeMessage('edition-1', 'acceptance'), subject: 'Your {edition} proposal has been accepted', message: 'Hi {first_name},\n\nGreat news! Your proposal “{talk_title}” has been accepted for {edition}.\n\nPlease use your private workspace to keep your logistics up to date by {deadline}:\n{workspace_url}\n\nPlease do not forward this private link.' };

    expect(isLegacyDefaultAcceptance(old)).toBe(true);
    expect(isLegacyDefaultAcceptance({ ...old, message: `${old.message} Thanks!` })).toBe(false);
  });

});
