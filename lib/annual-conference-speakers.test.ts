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
      claimAnnualConferenceDecisionEmailAttempt,
      createAnnualConferenceSession,
      createAnnualConferenceSpeakerIntakeLink,
      createAnnualConferenceSpeakerSubmission,
      getAnnualConferenceSession,
      getAnnualConferenceSpeakerIntakeLink,
      getAnnualConferenceSpeakerSubmissions,
      getAnnualConferenceSpeakerSubmission,
      revokeAnnualConferenceSpeakerWorkspace,
      rotateAnnualConferenceSpeakerWorkspace,
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
      accessibility_requirements: 'Step-free access',
      headshot_url: 'https://example.com/headshot',
      social_handle: '@ada',
      workshop_prerequisites: null,
      required_software_equipment: 'Presentation clicker',
      participants_need_laptops: false,
      preferred_workshop_capacity: null,
    });
    await updateAnnualConferenceSessionLogistics(session.id, {
      slides_url: 'https://example.com/final-slides',
      availability_confirmed: true,
      technical_requirements: 'USB-C display',
      accessibility_requirements: 'Step-free access',
      headshot_url: 'https://example.com/headshot',
      social_handle: '@ada',
      workshop_prerequisites: null,
      required_software_equipment: 'Presentation clicker',
      participants_need_laptops: false,
      preferred_workshop_capacity: null,
    });
    await expect(getAnnualConferenceSession(session.id)).resolves.toMatchObject({
      slides_url: 'https://example.com/final-slides',
      technical_requirements: 'USB-C display',
      accessibility_requirements: 'Step-free access',
      headshot_url: 'https://example.com/headshot',
      social_handle: '@ada',
    });
    await expect(getAnnualConferenceSpeakerIntakeLink('edition-2026', token)).resolves.toMatchObject({
      workspace_session_id: session.id,
      revoked_at: null,
    });

    const exhausted = await updateAnnualConferenceSpeakerSubmission(submission.id, {
      decision_email_kind: 'acceptance',
      decision_email_status: 'failed',
      decision_email_recipient: submission.speaker_email,
      decision_email_idempotency_key: `conference-speaker-accepted-${link.id}`,
      decision_email_attempt_count: 5,
      decision_email_last_attempt_at: '2099-01-01T00:00:00.000Z',
      decision_email_retryable: false,
    });
    const replacement = await rotateAnnualConferenceSpeakerWorkspace({
      submission: exhausted,
      deadline: '2099-12-31T23:59:59.000Z',
      tokenSecret: 'test-speaker-link-secret-that-is-at-least-32-bytes',
      allowAccepted: true,
    });

    const [rotated, revoked] = await Promise.all([
      rotateAnnualConferenceSpeakerWorkspace({
        submission: replacement.submission,
        deadline: '2099-12-31T23:59:59.000Z',
        tokenSecret: 'test-speaker-link-secret-that-is-at-least-32-bytes',
        allowAccepted: true,
      }),
      revokeAnnualConferenceSpeakerWorkspace(submission.edition_id, submission.id),
    ]);

    expect(revoked).toBe(true);
    await expect(getAnnualConferenceSpeakerIntakeLink(submission.edition_id, rotated.token)).resolves.toMatchObject({ revoked_at: expect.any(String) });
    const payload = { subject: 'Subject', html: 'HTML', text: 'Text', recipient: submission.speaker_email, from: 'sender@example.com', replyTo: 'reply@example.com', deadline: '2099-12-31T23:59:59.000Z', linkId: rotated.link.id, linkExpiresAt: rotated.link.expires_at };

    await updateAnnualConferenceSpeakerSubmission(submission.id, { decision_email_kind: 'acceptance', decision_email_status: 'failed', decision_email_attempt_count: 1 });
    const submissionsPath = path.join(tempRoot, 'data', 'annual-conference-speaker-submissions.json');
    const submissions = JSON.parse(await fs.readFile(submissionsPath, 'utf-8'));
    const target = submissions.find((item: { id: string }) => item.id === submission.id);

    target.decision_email_payload = payload;
    await fs.writeFile(submissionsPath, JSON.stringify(submissions));
    await expect(claimAnnualConferenceDecisionEmailAttempt({ submissionId: submission.id, expectedIdempotencyKey: rotated.submission.decision_email_idempotency_key!, expectedAttemptCount: 1, payload })).resolves.toBeNull();

    expect(replacement.submission.decision_email_attempt_count).toBe(0);
    expect(replacement.submission.decision_email_last_attempt_at).toBeNull();
    await expect(getAnnualConferenceSpeakerSubmission(secondProposal.id)).resolves.toMatchObject({ status: 'submitted' });
  });
});
