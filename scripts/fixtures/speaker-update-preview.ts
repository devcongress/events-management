import { DEFAULT_SPEAKER_UPDATE, renderSpeakerUpdate } from '../../lib/annual-conference-speaker-updates';

const rendered = renderSpeakerUpdate({
  template: { ...DEFAULT_SPEAKER_UPDATE, subject: 'Updated details' },
  speakerName: 'Ada Example',
  talkTitle: 'Reliable systems',
  edition: 'DevCon26',
  workspaceUrl: 'https://example.test/private-speaker-workspace',
  year: '2026',
});

process.stdout.write(JSON.stringify({ rendered, defaultDraft: DEFAULT_SPEAKER_UPDATE }));
