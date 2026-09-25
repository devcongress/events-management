import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalCwd = process.cwd();
let tempRoot: string;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'devcon-blast-segments-'));
  process.chdir(tempRoot);
  await fs.mkdir('data');
  vi.stubEnv('APP_DATA_SOURCE', 'local-json');
  vi.stubEnv('NODE_ENV', 'test');
  vi.resetModules();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('event blast segment pool', () => {
  it('claims only three slots and requires terminal confirmation before release', async () => {
    const {
      claimEventBlastSegmentSlot,
      findOwnedEventBlastSegmentSlot,
      markEventBlastSegmentTerminal,
      recordEventBlastSegmentSlotError,
      releaseEventBlastSegmentSlot,
      setEventBlastSegmentSlotProviderId,
    } = await import('./event-blast-segment-pool');
    const eventId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const slots = await Promise.all([
      claimEventBlastSegmentSlot('11111111-1111-4111-8111-111111111111', eventId),
      claimEventBlastSegmentSlot('22222222-2222-4222-8222-222222222222', eventId),
      claimEventBlastSegmentSlot('33333333-3333-4333-8333-333333333333', eventId),
    ]);

    expect(slots.map((slot) => slot?.slot_number).sort()).toEqual([1, 2, 3]);
    await expect(claimEventBlastSegmentSlot('44444444-4444-4444-8444-444444444444', eventId)).resolves.toBeNull();

    const slot = slots[0]!;

    await expect(setEventBlastSegmentSlotProviderId(slot.active_blast_id!, slot.slot_number, 'segment-1')).resolves.toBe(true);
    await expect(releaseEventBlastSegmentSlot(slot.active_blast_id!, slot.slot_number)).resolves.toBe(false);
    await expect(markEventBlastSegmentTerminal(slot.active_blast_id!, slot.slot_number)).resolves.toBe(true);
    await expect(releaseEventBlastSegmentSlot(slot.active_blast_id!, slot.slot_number)).resolves.toBe(true);

    const fourth = await claimEventBlastSegmentSlot('44444444-4444-4444-8444-444444444444', eventId);

    expect(fourth?.slot_number).toBe(slot.slot_number);
  });

  it('records cleanup errors on the exact clearing slot without releasing its owner', async () => {
    const {
      claimEventBlastSegmentSlot,
      findOwnedEventBlastSegmentSlot,
      markEventBlastSegmentTerminal,
      recordEventBlastSegmentSlotError,
    } = await import('./event-blast-segment-pool');
    const blastId = '11111111-1111-4111-8111-111111111111';
    const eventId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const slot = await claimEventBlastSegmentSlot(blastId, eventId);

    expect(slot).not.toBeNull();
    await markEventBlastSegmentTerminal(blastId, slot!.slot_number);
    await expect(recordEventBlastSegmentSlotError(blastId, slot!.slot_number, 'Provider cleanup failed')).resolves.toBe(true);

    await expect(findOwnedEventBlastSegmentSlot(blastId, eventId, slot!.slot_number)).resolves.toMatchObject({
      status: 'clearing',
      active_blast_id: blastId,
      active_event_id: eventId,
      last_error: 'Provider cleanup failed',
    });
    await expect(findOwnedEventBlastSegmentSlot('22222222-2222-4222-8222-222222222222', eventId, slot!.slot_number)).resolves.toBeNull();
  });
});
