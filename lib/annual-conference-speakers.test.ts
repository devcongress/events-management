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
  it('keeps independent proposals and a reusable logistics workspace inside one edition', async () => {
    const {
      createAnnualConferenceSession,
      createAnnualConferenceSpeakerIntakeLink,
      createAnnualConferenceSpeakerSubmission,
      getAnnualConferenceSession,
      getAnnualConferenceSpeakerIntakeLink,
      getAnnualConferenceSpeakerSubmissions,
      updateAnnualConferenceSessionLogistics,
      updateAnnualConferenceSpeakerSubmission,
    } = await store();

    const submission = await createAnnualConferenceSpeakerSubmission({
      edition_id: 'edition-2026',
      speaker_name: 'Ama Speaker',
      speaker_email: 'ama@example.com',
      title: 'Reliable systems in emerging markets',
      topic: 'Real-World Impact',
      session_type: '40-minute long talk',
      learning_outcomes: ['Identify failure modes', 'Design safe retries', 'Measure reliability'],
      abstract: 'A practical talk about dependable infrastructure.',
      bio: 'Platform engineer and community speaker.',
    });
    const secondProposal = await createAnnualConferenceSpeakerSubmission({
      edition_id: 'edition-2026',
      speaker_name: 'Ama Speaker',
      speaker_email: 'ama@example.com',
      title: 'Teaching incident response',
      topic: 'Tech Education',
      session_type: '25-minute short talk',
      learning_outcomes: ['Build a drill', 'Run a debrief', 'Improve the next exercise'],
      abstract: 'A second, independently reviewed proposal.',
      bio: 'Updated speaker profile.',
    });
    expect(secondProposal.speaker_profile_id).toBe(submission.speaker_profile_id);

    const session = await createAnnualConferenceSession({
      edition_id: submission.edition_id,
      speaker_submission_id: submission.id,
      speaker_name: submission.speaker_name,
      speaker_email: submission.speaker_email,
      title: submission.title,
      topic: submission.topic,
      session_type: submission.session_type,
      learning_outcomes: submission.learning_outcomes,
      abstract: submission.abstract,
      bio: submission.bio,
      slides_url: null,
    });
    const { link, token } = await createAnnualConferenceSpeakerIntakeLink({
      edition_id: submission.edition_id,
      speaker_submission_id: submission.id,
      speaker_name: submission.speaker_name,
      speaker_email: submission.speaker_email,
      talk_title: submission.title,
      expires_at: '2099-12-31T23:59:59.000Z',
      workspace_session_id: session.id,
    });
    await updateAnnualConferenceSpeakerSubmission(submission.id, {
      status: 'selected',
      selected_intake_link_id: link.id,
      selected_session_id: session.id,
    });

    const storedLinks = await fs.readFile(path.join(tempRoot, 'data', 'annual-conference-speaker-intake-links.json'), 'utf-8');
    expect(storedLinks).not.toContain(token);
    expect(await getAnnualConferenceSpeakerSubmissions('edition-2026')).toHaveLength(2);
    await expect(getAnnualConferenceSpeakerIntakeLink('edition-2027', token)).resolves.toBeUndefined();

    await updateAnnualConferenceSessionLogistics(session.id, {
      slides_url: 'https://example.com/slides',
      availability_confirmed: true,
      technical_requirements: 'HDMI display',
      workshop_prerequisites: null,
      required_software_equipment: 'Presentation clicker',
      participants_need_laptops: false,
      preferred_workshop_capacity: null,
    });
    await updateAnnualConferenceSessionLogistics(session.id, {
      slides_url: 'https://example.com/final-slides',
      availability_confirmed: true,
      technical_requirements: 'USB-C display',
      workshop_prerequisites: null,
      required_software_equipment: 'Presentation clicker',
      participants_need_laptops: false,
      preferred_workshop_capacity: null,
    });
    await expect(getAnnualConferenceSession(session.id)).resolves.toMatchObject({
      slides_url: 'https://example.com/final-slides',
      technical_requirements: 'USB-C display',
    });
    await expect(getAnnualConferenceSpeakerIntakeLink('edition-2026', token)).resolves.toMatchObject({
      workspace_session_id: session.id,
      revoked_at: null,
    });
  });
});
