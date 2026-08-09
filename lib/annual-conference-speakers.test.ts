import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalCwd = process.cwd();
let tempRoot: string;

async function store() {
  vi.resetModules();
  return import('./annual-conference-speakers');
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'devcon-conference-speakers-'));
  process.chdir(tempRoot);
  await fs.mkdir('data');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('Annual Conference speaker scope', () => {
  it('keeps proposals, presenter links, and confirmed sessions inside one edition', async () => {
    const {
      claimAnnualConferenceSpeakerIntakeLink,
      consumeAnnualConferenceSpeakerIntakeLink,
      createAnnualConferenceSession,
      createAnnualConferenceSpeakerIntakeLink,
      createAnnualConferenceSpeakerSubmission,
      getAnnualConferenceSpeakerIntakeLink,
      getAnnualConferenceSpeakerSubmissions,
      updateAnnualConferenceSpeakerSubmission,
    } = await store();

    const submission = await createAnnualConferenceSpeakerSubmission({
      edition_id: 'edition-2026',
      kind: 'talk',
      speaker_name: 'Ama Speaker',
      speaker_email: 'ama@example.com',
      github_username: null,
      title: 'Reliable systems in emerging markets',
      topic: 'Backend Engineering',
      abstract: 'A practical talk about dependable infrastructure.',
      bio: null,
    });
    const { link, token } = await createAnnualConferenceSpeakerIntakeLink({
      edition_id: submission.edition_id,
      speaker_submission_id: submission.id,
      kind: submission.kind,
      speaker_name: submission.speaker_name,
      speaker_email: submission.speaker_email,
      talk_title: submission.title,
      expires_at: '2099-12-31T23:59:59.000Z',
    });
    await updateAnnualConferenceSpeakerSubmission(submission.id, {
      status: 'selected',
      selected_intake_link_id: link.id,
    });

    const storedLinks = await fs.readFile(path.join(tempRoot, 'data', 'annual-conference-speaker-intake-links.json'), 'utf-8');
    expect(storedLinks).not.toContain(token);
    expect(await getAnnualConferenceSpeakerSubmissions('edition-2026')).toHaveLength(1);
    await expect(getAnnualConferenceSpeakerIntakeLink('edition-2027', token)).resolves.toBeUndefined();

    const claim = await claimAnnualConferenceSpeakerIntakeLink('edition-2026', token);
    const session = await createAnnualConferenceSession({
      edition_id: submission.edition_id,
      speaker_submission_id: submission.id,
      kind: submission.kind,
      speaker_name: submission.speaker_name,
      speaker_email: submission.speaker_email,
      github_username: null,
      title: submission.title,
      topic: submission.topic,
      abstract: submission.abstract,
      bio: 'Platform engineer and community speaker.',
      slides_url: 'https://example.com/slides',
    });
    await consumeAnnualConferenceSpeakerIntakeLink('edition-2026', token, session.id, claim.claimId);

    await expect(claimAnnualConferenceSpeakerIntakeLink('edition-2026', token)).rejects.toThrow('no longer available');
  });
});
