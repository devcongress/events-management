import { createHash } from 'node:crypto';
import type { Context } from 'hono';
import { getAnnualConferenceSpeakerSubmissions, type AnnualConferenceSpeakerSubmission } from '@/lib/annual-conference-speakers';
import { DEVCON26_SOCIAL_CARD_BUCKET } from '@/lib/annual-conference-social-cards';
import { readData, updateData } from '@/lib/mock-db';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';
import { createAnnualConferenceRepository } from '@/server/annual-conference-repository';
import { createAnnualConferenceProgrammeRepository } from '@/server/annual-conference-programme-repository';
import type { ProgrammeRow } from '@/lib/annual-conference-programme';

const FILE = 'annual-conference-programme-photos';

type Photo = { id: string; path: string; data?: string; type?: string };

export class ProgrammePhotoConflict extends Error {}

function localSpeakerId(email: string): string {
  const hash = createHash('sha256').update(email.trim().toLowerCase()).digest('hex');

  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function chunks<T>(items: T[], size = 100): T[][] {
  const unique = [...new Set(items)];
  const result: T[][] = [];

  for (let index = 0; index < unique.length; index += size) result.push(unique.slice(index, index + size));

  return result;
}

export type PublicProgrammeSpeaker = Pick<AnnualConferenceSpeakerSubmission, 'id' | 'speaker_profile_id' | 'speaker_name'>;

export async function publicProgrammeEditionId(year: number, c: Context): Promise<string | null> {
  if (!isSupabaseRuntimeEnabled(c)) {
    return (await createAnnualConferenceRepository(c).listEditions()).find((item) => item.year === year)?.id ?? null;
  }
  const result = await getSupabaseAdminClient(c).from('annual_conference_editions').select('id').eq('year', year).maybeSingle();

  if (result.error) throw new Error('Unable to load conference edition.');

  return result.data?.id ?? null;
}

export async function publicProgrammeRows(editionId: string, c: Context): Promise<ProgrammeRow[]> {
  if (!isSupabaseRuntimeEnabled(c)) return (await createAnnualConferenceProgrammeRepository(c).get(editionId)).rows;
  const result = await getSupabaseAdminClient(c).from('annual_conference_programmes' as never).select('rows').eq('edition_id', editionId).maybeSingle() as unknown as { data: { rows: ProgrammeRow[] } | null; error: unknown };

  if (result.error) throw new Error('Unable to load programme.');

  return result.data?.rows ?? [];
}

export async function publicProgrammeSpeakers(editionId: string, ids: string[], c: Context, profileId?: string): Promise<PublicProgrammeSpeaker[]> {
  if (!ids.length) return [];
  if (!isSupabaseRuntimeEnabled(c)) {
    return (await acceptedProgrammeProposals(editionId, c)).filter((item) => ids.includes(item.id) && (!profileId || item.speaker_profile_id === profileId)).map(({ id, speaker_profile_id, speaker_name }) => ({ id, speaker_profile_id, speaker_name }));
  }
  const output: PublicProgrammeSpeaker[] = [];

  for (const batch of chunks(ids)) {
    let query = getSupabaseAdminClient(c).from('annual_conference_speaker_submissions')
      .select('id, speaker_profile_id, speaker_name').eq('edition_id', editionId).eq('status', 'selected').in('id', batch);

    if (profileId) query = query.eq('speaker_profile_id', profileId);
    const result = await query;

    if (result.error) throw new Error('Unable to load programme speakers.');
    output.push(...(result.data ?? []));
  }

  return output;
}

export async function acceptedProgrammeProposals(editionId: string, c: Context) {
  if (isSupabaseRuntimeEnabled(c)) {
    const result = await getSupabaseAdminClient(c).from('annual_conference_speaker_submissions')
      .select('id, edition_id, speaker_profile_id, speaker_name, title, abstract, status')
      .eq('edition_id', editionId).eq('status', 'selected');

    if (result.error) throw new Error('Unable to load conference speaker proposals.');

    return (result.data ?? []) as AnnualConferenceSpeakerSubmission[];
  }

  const submissions = await getAnnualConferenceSpeakerSubmissions(editionId);
  const profiles = new Map(submissions.filter((item) => item.speaker_profile_id).map((item) => [item.speaker_email.trim().toLowerCase(), item.speaker_profile_id!]));

  return submissions.filter((item) => item.status === 'selected').map((item) => ({
    ...item,
    speaker_profile_id: item.speaker_profile_id ?? profiles.get(item.speaker_email.trim().toLowerCase()) ?? localSpeakerId(item.speaker_email),
  }));
}

export function programmeSpeakerId(proposal: PublicProgrammeSpeaker): string {
  return proposal.speaker_profile_id ?? proposal.id;
}

export async function programmePhotoPaths(ids: string[], c: Context): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  if (!isSupabaseRuntimeEnabled(c)) return new Map((await readData<Photo>(FILE)).filter((item) => ids.includes(item.id)).map((item) => [item.id, item.path]));
  const paths = new Map<string, string>();

  for (const batch of chunks(ids)) {
    const result = await getSupabaseAdminClient(c).from('annual_conference_speaker_profiles' as never)
      .select('id, programme_photo_path').in('id', batch) as unknown as { data: { id: string; programme_photo_path: string | null }[] | null; error: unknown };

    if (result.error) throw new Error('Unable to load speaker photos.');
    for (const item of result.data ?? []) if (item.programme_photo_path) paths.set(item.id, item.programme_photo_path);
  }

  return paths;
}

export function programmePhotoUrl(origin: string, id: string): string {
  return `${origin}/api/public/annual-conference/2026/programme/speakers/${id}/photo`;
}

export async function saveProgrammePhoto(id: string, file: File | null, c: Context) {
  if (!isSupabaseRuntimeEnabled(c)) {
    const photo = file ? { id, path: crypto.randomUUID(), data: Buffer.from(await file.arrayBuffer()).toString('base64'), type: file.type } : null;

    await updateData<Photo, void>(FILE, (items) => ({ data: [...items.filter((item) => item.id !== id), ...(photo ? [photo] : [])], result: undefined }));

    return;
  }
  const client = getSupabaseAdminClient(c);
  const oldPath = (await programmePhotoPaths([id], c)).get(id);
  const path = file ? `programme-speakers/${id}/${crypto.randomUUID()}` : null;

  if (file && path) {
    const result = await client.storage.from(DEVCON26_SOCIAL_CARD_BUCKET).upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });

    if (result.error) throw new Error('Unable to upload speaker photo.');
  }
  let update = client.from('annual_conference_speaker_profiles' as never).update({ programme_photo_path: path } as never).eq('id', id);

  update = oldPath ? update.eq('programme_photo_path', oldPath) : update.is('programme_photo_path', null);
  const result = await update.select('id').maybeSingle();

  if (result.error) {
    if (path) await client.storage.from(DEVCON26_SOCIAL_CARD_BUCKET).remove([path]);

    throw new Error('Unable to save speaker photo.');
  }
  if (!result.data) {
    if (path) await client.storage.from(DEVCON26_SOCIAL_CARD_BUCKET).remove([path]);

    throw new ProgrammePhotoConflict('Speaker photo changed. Refresh and try again.');
  }
  if (oldPath) await client.storage.from(DEVCON26_SOCIAL_CARD_BUCKET).remove([oldPath]);
}

export async function readProgrammePhoto(id: string, path: string, c: Context): Promise<Blob | null> {
  if (!isSupabaseRuntimeEnabled(c)) {
    const item = (await readData<Photo>(FILE)).find((photo) => photo.id === id && photo.path === path);

    return item?.data ? new Blob([Buffer.from(item.data, 'base64')], { type: item.type }) : null;
  }
  const result = await getSupabaseAdminClient(c).storage.from(DEVCON26_SOCIAL_CARD_BUCKET).download(path);

  if (result.error) throw new Error('Unable to load speaker photo.');

  return result.data;
}

export function referencedProposalIds(rows: ProgrammeRow[]): Set<string> {
  return new Set(rows.flatMap((row) => row.speakerProposalIds ?? []));
}
