import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SPEAKER_ARCHIVE_ABSTRACT_MAX_CHARACTERS,
  SPEAKER_ARCHIVE_BIO_MAX_CHARACTERS,
} from '../lib/speaker-intake-limits';

const originalCwd = process.cwd();
let tempRoot: string;

const event = {
  id: 'event-july',
  name: 'DevCongress July Meetup',
  description: null,
  event_date: '2026-07-25T10:00:00.000Z',
  series_type: 'monthly',
  status: 'completed',
  publish_to_website: true,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
};

async function importArchiveModules() {
  vi.resetModules();
  const links = await import('../lib/mock-db/speaker-intake-links');
  const submissions = await import('../lib/mock-db/speaker-submissions');
  const talks = await import('../lib/mock-db/talks');
  const app = (await import('./app')).default;
  return { app, links, submissions, talks };
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'devcon-archive-kind-'));
  process.chdir(tempRoot);
  await fs.mkdir('data');
  await fs.writeFile(
    path.join(tempRoot, 'data', 'events.json'),
    JSON.stringify([event]),
    'utf-8',
  );
  vi.stubEnv('APP_DATA_SOURCE', 'local-json');
  vi.stubEnv('NODE_ENV', 'test');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('archive item discriminator at the public intake boundary', () => {
  it('uses the backfill invitation kind and title instead of public form overrides', async () => {
    const { app, links, talks } = await importArchiveModules();
    const { token } = await links.createSpeakerIntakeLink({
      event_id: event.id,
      event_month: '2026-07',
      expires_at: '2099-01-01T00:00:00.000Z',
      kind: 'product_demo',
      speaker_name: 'Product Builder',
      speaker_email: 'builder@example.com',
      talk_title: 'Demo the community tool',
    });

    const response = await app.request(
      `http://localhost/api/events/${event.id}/speaker-intake/${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'talk',
          title: 'A browser-tampered title',
          topic: 'Product Engineering',
          abstract: 'A live product demonstration.',
          bio: 'Community builder.',
          slides_url: 'https://example.com/demo',
        }),
      },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      kind: 'product_demo',
      title: 'Demo the community tool',
    });
    await expect(talks.getTalksByEvent(event.id)).resolves.toEqual([
      expect.objectContaining({ kind: 'product_demo' }),
    ]);
  });

  it('carries a selected proposal kind through its server-created link and talk', async () => {
    const { app, links, submissions, talks } = await importArchiveModules();
    const submission = await submissions.createSpeakerSubmission({
      event_id: event.id,
      kind: 'product_demo',
      speaker_name: 'Selected Builder',
      speaker_email: 'selected@example.com',
      github_username: null,
      title: 'Show the selected product',
      topic: 'Product Engineering',
      abstract: 'A selected product demonstration.',
      bio: 'Community builder.',
    });
    await submissions.updateSpeakerSubmission(submission.id, { status: 'selected' });
    const { link, token } = await links.createSpeakerIntakeLink({
      event_id: event.id,
      event_month: '2026-07',
      expires_at: '2099-01-01T00:00:00.000Z',
      kind: 'product_demo',
      purpose: 'selected_speaker_confirmation',
      speaker_submission_id: submission.id,
      speaker_name: submission.speaker_name,
      speaker_email: submission.speaker_email,
      talk_title: submission.title,
    });
    await submissions.updateSpeakerSubmission(submission.id, {
      selected_intake_link_id: link.id,
    });

    const response = await app.request(
      `http://localhost/api/events/${event.id}/speaker-intake/${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'talk',
          slides_url: 'https://example.com/selected-demo',
        }),
      },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      kind: 'product_demo',
      title: submission.title,
    });
    await expect(talks.getTalksByEvent(event.id)).resolves.toEqual([
      expect.objectContaining({ kind: 'product_demo' }),
    ]);
    await expect(submissions.getSpeakerSubmissionById(submission.id)).resolves.toEqual(
      expect.objectContaining({
        kind: 'product_demo',
        selected_talk_id: expect.any(String),
      }),
    );
  });

  it('revokes completion access when a selected proposal is no longer selected', async () => {
    const { app, links, submissions, talks } = await importArchiveModules();
    const submission = await submissions.createSpeakerSubmission({
      event_id: event.id,
      kind: 'talk',
      speaker_name: 'Changed Decision',
      speaker_email: 'changed@example.com',
      github_username: null,
      title: 'A proposal that was deselected',
      topic: 'Engineering',
      abstract: 'The organizer changed the selection decision.',
      bio: 'Community builder.',
    });
    await submissions.updateSpeakerSubmission(submission.id, { status: 'selected' });
    const { link, token } = await links.createSpeakerIntakeLink({
      event_id: event.id,
      event_month: '2026-07',
      expires_at: '2099-01-01T00:00:00.000Z',
      kind: 'talk',
      purpose: 'selected_speaker_confirmation',
      speaker_submission_id: submission.id,
      speaker_name: submission.speaker_name,
      speaker_email: submission.speaker_email,
      talk_title: submission.title,
    });
    await submissions.updateSpeakerSubmission(submission.id, {
      selected_intake_link_id: link.id,
      status: 'not_selected',
    });

    const response = await app.request(
      `http://localhost/api/events/${event.id}/speaker-intake/${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slides_url: 'https://example.com/slides' }),
      },
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      error: 'This archive completion link is no longer available.',
    });
    await expect(talks.getTalksByEvent(event.id)).resolves.toEqual([]);
  });

  it('rejects a selected link whose archive kind no longer matches its proposal', async () => {
    const { app, links, submissions } = await importArchiveModules();
    const submission = await submissions.createSpeakerSubmission({
      event_id: event.id,
      kind: 'talk',
      speaker_name: 'Mismatched Presenter',
      speaker_email: 'mismatch@example.com',
      github_username: null,
      title: 'A talk proposal',
      topic: 'Engineering',
      abstract: 'This proposal is intentionally mismatched in the test.',
      bio: 'Community builder.',
    });
    await submissions.updateSpeakerSubmission(submission.id, { status: 'selected' });
    const { link, token } = await links.createSpeakerIntakeLink({
      event_id: event.id,
      event_month: '2026-07',
      expires_at: '2099-01-01T00:00:00.000Z',
      kind: 'product_demo',
      purpose: 'selected_speaker_confirmation',
      speaker_submission_id: submission.id,
      speaker_name: submission.speaker_name,
      speaker_email: submission.speaker_email,
      talk_title: submission.title,
    });
    await submissions.updateSpeakerSubmission(submission.id, {
      selected_intake_link_id: link.id,
    });

    const response = await app.request(
      `http://localhost/api/events/${event.id}/speaker-intake/${token}`,
    );

    expect(response.status).toBe(410);
  });

  it('enforces concise abstract and bio limits at the public intake boundary', async () => {
    const { app, links, talks } = await importArchiveModules();
    const { token } = await links.createSpeakerIntakeLink({
      event_id: event.id,
      event_month: '2026-07',
      expires_at: '2099-01-01T00:00:00.000Z',
      kind: 'talk',
      speaker_name: 'Concise Presenter',
      speaker_email: 'concise@example.com',
      talk_title: 'Keep archive details concise',
    });
    const submit = (abstract: string, bio: string) => app.request(
      `http://localhost/api/events/${event.id}/speaker-intake/${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Keep archive details concise',
          topic: 'Technical Communication',
          abstract,
          bio,
          slides_url: 'https://example.com/slides',
        }),
      },
    );

    const longAbstractResponse = await submit(
      'A'.repeat(SPEAKER_ARCHIVE_ABSTRACT_MAX_CHARACTERS + 1),
      'Community builder.',
    );
    expect(longAbstractResponse.status).toBe(400);
    await expect(longAbstractResponse.json()).resolves.toMatchObject({
      error: `Presentation summary must be ${SPEAKER_ARCHIVE_ABSTRACT_MAX_CHARACTERS} characters or fewer`,
    });

    const longBioResponse = await submit(
      'A concise presentation summary.',
      'B'.repeat(SPEAKER_ARCHIVE_BIO_MAX_CHARACTERS + 1),
    );
    expect(longBioResponse.status).toBe(400);
    await expect(longBioResponse.json()).resolves.toMatchObject({
      error: `Presenter bio must be ${SPEAKER_ARCHIVE_BIO_MAX_CHARACTERS} characters or fewer`,
    });
    await expect(talks.getTalksByEvent(event.id)).resolves.toEqual([]);
  });

  it('accepts only http or https archive resource URLs', async () => {
    const { app, links, talks } = await importArchiveModules();
    const { token } = await links.createSpeakerIntakeLink({
      event_id: event.id,
      event_month: '2026-07',
      expires_at: '2099-01-01T00:00:00.000Z',
      kind: 'product_demo',
      speaker_name: 'Safe Link Presenter',
      speaker_email: 'safe-link@example.com',
      talk_title: 'Unsafe resource demonstration',
    });

    const response = await app.request(
      `http://localhost/api/events/${event.id}/speaker-intake/${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Unsafe resource demonstration',
          topic: 'Security',
          abstract: 'This URL must not become a public link.',
          bio: 'Community builder.',
          slides_url: 'javascript:alert(document.domain)',
        }),
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Resource URL must use http or https',
    });
    await expect(talks.getTalksByEvent(event.id)).resolves.toEqual([]);
  });

  it('serializes concurrent submissions of the same one-time archive request', async () => {
    const { app, links, talks } = await importArchiveModules();
    const { token } = await links.createSpeakerIntakeLink({
      event_id: event.id,
      event_month: '2026-07',
      expires_at: '2099-01-01T00:00:00.000Z',
      kind: 'talk',
      speaker_name: 'One Time Presenter',
      speaker_email: 'one-time@example.com',
      talk_title: 'Submit exactly once',
    });
    const request = () => app.request(
      `http://localhost/api/events/${event.id}/speaker-intake/${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Submit exactly once',
          topic: 'Backend Engineering',
          abstract: 'A concurrent one-time form submission.',
          bio: 'Community builder.',
          slides_url: 'https://example.com/slides',
        }),
      },
    );

    const responses = await Promise.all([request(), request()]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 410]);
    await expect(talks.getTalksByEvent(event.id)).resolves.toHaveLength(1);
  });

  it('keeps talks while exposing additive archive items and product demo schedule metadata', async () => {
    const { app, talks } = await importArchiveModules();
    const created = await talks.createTalk({
      event_id: event.id,
      kind: 'product_demo',
      speaker_name: 'Archived Builder',
      speaker_email: 'archive@example.com',
      github_username: null,
      title: 'Archived product demo',
      topic: 'Product Engineering',
      abstract: 'A published product demonstration.',
      bio: 'Community builder.',
      slides_url: 'https://example.com/archive-demo',
      slides_type: 'url',
      storage_path: null,
      slides_uploaded_at: '2026-07-25T12:00:00.000Z',
    });
    await talks.updateTalk(created.id, { status: 'published' });

    const archiveResponse = await app.request('http://localhost/api/public/archive');
    expect(archiveResponse.status).toBe(200);
    const archive = await archiveResponse.json();
    expect(archive.talks).toEqual([
      expect.objectContaining({ id: created.id, kind: 'product_demo' }),
    ]);
    expect(archive.archive_items).toEqual(archive.talks);

    const meetupsResponse = await app.request('http://localhost/api/public/meetups');
    expect(meetupsResponse.status).toBe(200);
    const meetups = await meetupsResponse.json();
    expect(meetups.data[0].schedule).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: 'Archived product demo',
        type: 'product_demo',
        resources: [{
          title: 'Demo resource',
          url: 'https://example.com/archive-demo',
        }],
      }),
    ]));
  });
});
