import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalCwd = process.cwd();
let tempRoot: string;

async function importSubmissionsStore() {
  vi.resetModules();
  return import('./speaker-submissions');
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'devcon-speaker-submissions-'));
  process.chdir(tempRoot);
  await fs.mkdir('data');
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('speaker submissions', () => {
  it('stores public CFP interest separately from talks and blocks duplicate active proposals', async () => {
    const { createSpeakerSubmission, getSpeakerSubmissionsByEvent } = await importSubmissionsStore();

    const submission = await createSpeakerSubmission({
      event_id: 'event-july',
      speaker_name: 'Ama Speaker',
      speaker_email: 'ama@example.com',
      github_username: 'ama-dev',
      title: 'Testing the Platform',
      topic: 'Testing',
      abstract: 'A practical testing talk.',
      bio: 'Community engineer.',
    });

    expect(submission.status).toBe('submitted');
    await expect(getSpeakerSubmissionsByEvent('event-july')).resolves.toHaveLength(1);
    await expect(createSpeakerSubmission({
      event_id: 'event-july',
      speaker_name: 'Ama Speaker',
      speaker_email: 'ama@example.com',
      github_username: 'ama-dev',
      title: 'Testing the Platform',
      topic: 'Testing',
      abstract: 'A practical testing talk.',
      bio: 'Community engineer.',
    })).rejects.toThrow('already been submitted');
  });

  it('records organizer decisions without creating a talk', async () => {
    const { createSpeakerSubmission, updateSpeakerSubmission } = await importSubmissionsStore();

    const submission = await createSpeakerSubmission({
      event_id: 'event-july',
      speaker_name: 'Kojo Speaker',
      speaker_email: 'kojo@example.com',
      github_username: null,
      title: 'Shipping Small',
      topic: 'Product',
      abstract: null,
      bio: null,
    });
    const selected = await updateSpeakerSubmission(submission.id, {
      status: 'selected',
      selected_intake_link_id: 'link-1',
    });

    expect(selected).toMatchObject({
      status: 'selected',
      selected_intake_link_id: 'link-1',
      selected_talk_id: null,
    });
    expect(selected.decided_at).toEqual(expect.any(String));
  });
});
