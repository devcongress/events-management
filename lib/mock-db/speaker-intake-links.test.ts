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
  it('creates a hashed one-time token that can be consumed once', async () => {
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
    });

    await expect(fs.readFile(path.join(tempRoot, 'data', 'speaker-intake-links.json'), 'utf-8')).resolves.not.toContain(token);
    await expect(getSpeakerIntakeLinkByToken('event-june', token)).resolves.toMatchObject({ id: link.id, used_at: null });
    expect(speakerIntakeLinkExpired(link)).toBe(false);

    await expect(consumeSpeakerIntakeLink('event-june', token, 'talk-1')).resolves.toMatchObject({
      id: link.id,
      used_talk_id: 'talk-1',
    });
    await expect(consumeSpeakerIntakeLink('event-june', token, 'talk-2')).rejects.toThrow('already been used');
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
});
