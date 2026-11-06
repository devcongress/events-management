import { describe, expect, it } from 'vitest';
import { DEFAULT_SPEAKER_UPDATE, defaultSpeakerUpdate, renderSpeakerUpdate } from './annual-conference-speaker-updates';
import { defaultSpeakerOutcomeMessage, renderSpeakerOutcomeMessage } from './annual-conference-speaker-outcomes';

describe('speaker update message', () => {
  it('uses the November correction only for the 2026 edition', () => {
    expect(defaultSpeakerUpdate(2026)).toEqual(DEFAULT_SPEAKER_UPDATE);
    expect(defaultSpeakerUpdate(2027).message).not.toContain('November 12, 2026');
    expect(defaultSpeakerUpdate(2027).message).toContain('{edition}');
  });

  it('renders the correction and private link without changing the acceptance template', () => {
    const result = renderSpeakerUpdate({
      template: DEFAULT_SPEAKER_UPDATE,
      speakerName: 'Ama Mensah',
      talkTitle: 'A talk',
      edition: 'DevCon26',
      workspaceUrl: 'https://example.org/private',
      year: '2026',
    });

    expect(result.subject).toBe(DEFAULT_SPEAKER_UPDATE.subject);
    expect(result.text).toContain('Hi Ama,');
    expect(result.text).toContain('preferred headshot');
    expect(result.text).toContain('You do not need to send a short bio');
    expect(result.text).toContain('https://example.org/private');
    expect(result.html).toContain('Speaker update');
    expect(result.html).toContain('Open private link &rarr;');
    expect(result.html).not.toContain('Speaker outcome');
    expect(defaultSpeakerOutcomeMessage('edition', 'acceptance').message).toContain('upload your slides');
    expect(renderSpeakerOutcomeMessage({ template: defaultSpeakerOutcomeMessage('edition', 'acceptance'), speakerName: 'Ama', talkTitle: 'Talk', edition: 'DevCon26', deadline: '', workspaceUrl: '' }).html).toContain('Speaker outcome');
  });
});
