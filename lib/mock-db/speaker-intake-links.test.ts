import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalCwd = process.cwd();
let tempRoot: string;

async function importLinksStore() {
  vi.resetModules();
  return import('./speaker-intake-links');
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'devcon-speaker-intake-links-'));
  process.chdir(tempRoot);
  await fs.mkdir('data');
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('speaker intake links', () => {
  it('creates a recoverable, speaker-bound one-time token that can be consumed once', async () => {
    const {
      consumeSpeakerIntakeLink,
      createSpeakerIntakeLink,
      getSpeakerIntakeLinkByToken,
      speakerIntakeLinkExpired,
    } = await importLinksStore();

    const { link, token } = await createSpeakerIntakeLink({
      event_id: 'event-june',
      event_month: '2026-06',
      expires_at: '2099-01-01T00:00:00.000Z',
      speaker_name: 'Ama Mensah',
      speaker_email: 'ama@example.com',
    });

    await expect(fs.readFile(path.join(tempRoot, 'data', 'speaker-intake-links.json'), 'utf-8')).resolves.toContain(token);
    await expect(getSpeakerIntakeLinkByToken('event-june', token)).resolves.toMatchObject({
      id: link.id,
      kind: 'talk',
      speaker_name: 'Ama Mensah',
      speaker_email: 'ama@example.com',
      used_at: null,
    });
    expect(speakerIntakeLinkExpired(link)).toBe(false);

    await expect(consumeSpeakerIntakeLink('event-june', token, 'talk-1')).resolves.toMatchObject({
      id: link.id,
      used_talk_id: 'talk-1',
    });
    await expect(consumeSpeakerIntakeLink('event-june', token, 'talk-2')).rejects.toThrow('already been used');
  });

  it('persists the server-selected product demo discriminator', async () => {
    const {
      createSpeakerIntakeLink,
      getSpeakerIntakeLinkByToken,
    } = await importLinksStore();

    const { token } = await createSpeakerIntakeLink({
      event_id: 'event-july',
      event_month: '2026-07',
      expires_at: '2099-01-01T00:00:00.000Z',
      kind: 'product_demo',
      speaker_name: 'Product Builder',
      speaker_email: 'builder@example.com',
    });

    await expect(getSpeakerIntakeLinkByToken('event-july', token)).resolves.toMatchObject({
      kind: 'product_demo',
    });
  });

  it('rejects expired links', async () => {
    const {
      consumeSpeakerIntakeLink,
      createSpeakerIntakeLink,
      speakerIntakeLinkExpired,
    } = await importLinksStore();

    const { link, token } = await createSpeakerIntakeLink({
      event_id: 'event-june',
      event_month: '2026-06',
      expires_at: '2000-01-01T00:00:00.000Z',
    });

    expect(speakerIntakeLinkExpired(link)).toBe(true);
    await expect(consumeSpeakerIntakeLink('event-june', token, 'talk-1')).rejects.toThrow('expired');
  });

  it('deletes a generated link for the matching event', async () => {
    const {
      createSpeakerIntakeLink,
      deleteSpeakerIntakeLink,
      getSpeakerIntakeLinksByEvent,
    } = await importLinksStore();

    const { link } = await createSpeakerIntakeLink({
      event_id: 'event-june',
      event_month: '2026-06',
      expires_at: '2099-01-01T00:00:00.000Z',
    });

    await expect(deleteSpeakerIntakeLink('event-june', link.id)).resolves.toMatchObject({ id: link.id });
    await expect(getSpeakerIntakeLinksByEvent('event-june')).resolves.toEqual([]);
    await expect(deleteSpeakerIntakeLink('event-june', link.id)).rejects.toThrow('not found');
  });

  it('removes superseded active completion links while preserving the current one', async () => {
    const {
      createSpeakerIntakeLink,
      deleteActiveSpeakerIntakeLinksBySubmission,
      getSpeakerIntakeLinksByEvent,
    } = await importLinksStore();
    const first = await createSpeakerIntakeLink({
      event_id: 'event-june',
      event_month: '2026-06',
      expires_at: '2099-01-01T00:00:00.000Z',
      purpose: 'selected_speaker_confirmation',
      speaker_submission_id: 'submission-1',
    });
    const current = await createSpeakerIntakeLink({
      event_id: 'event-june',
      event_month: '2026-06',
      expires_at: '2099-01-01T00:00:00.000Z',
      purpose: 'selected_speaker_confirmation',
      speaker_submission_id: 'submission-1',
    });

    await expect(deleteActiveSpeakerIntakeLinksBySubmission(
      'event-june',
      'submission-1',
      current.link.id,
    )).resolves.toEqual([
      expect.objectContaining({ id: first.link.id }),
    ]);
    await expect(getSpeakerIntakeLinksByEvent('event-june')).resolves.toEqual([
      expect.objectContaining({ id: current.link.id }),
    ]);

    await expect(deleteActiveSpeakerIntakeLinksBySubmission(
      'event-june',
      'submission-1',
    )).resolves.toEqual([
      expect.objectContaining({ id: current.link.id }),
    ]);
    await expect(getSpeakerIntakeLinksByEvent('event-june')).resolves.toEqual([]);
  });

  it('updates a batch of email delivery states atomically', async () => {
    const {
      createSpeakerIntakeLink,
      getSpeakerIntakeLinksByEvent,
      updateSpeakerIntakeLinkEmailDeliveries,
    } = await importLinksStore();
    const first = await createSpeakerIntakeLink({
      event_id: 'event-june',
      event_month: '2026-06',
      expires_at: '2099-01-01T00:00:00.000Z',
      speaker_name: 'First Speaker',
      speaker_email: 'first@example.com',
    });
    const second = await createSpeakerIntakeLink({
      event_id: 'event-june',
      event_month: '2026-06',
      expires_at: '2099-01-01T00:00:00.000Z',
      speaker_name: 'Second Speaker',
      speaker_email: 'second@example.com',
    });

    await updateSpeakerIntakeLinkEmailDeliveries('event-june', [
      {
        id: first.link.id,
        status: 'accepted',
        provider_id: 'email-first',
        idempotency_key: 'batch-1',
      },
      {
        id: second.link.id,
        status: 'accepted',
        provider_id: 'email-second',
        idempotency_key: 'batch-1',
      },
    ]);

    const deliveredLinks = await getSpeakerIntakeLinksByEvent('event-june');
    expect(deliveredLinks).toHaveLength(2);
    expect(deliveredLinks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: second.link.id,
        email_status: 'accepted',
        email_provider_id: 'email-second',
        email_sent_at: expect.any(String),
      }),
      expect.objectContaining({
        id: first.link.id,
        email_status: 'accepted',
        email_provider_id: 'email-first',
        email_sent_at: expect.any(String),
      }),
    ]));
  });
});
