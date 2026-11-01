import type { Context, Hono } from 'hono';
import { getAnnualConferenceSession, getAnnualConferenceSpeakerIntakeLink, getAnnualConferenceSpeakerSubmission } from '@/lib/annual-conference-speakers';
import { requireAdmin } from '@/lib/supabase/admin-auth';
import { getSupabaseAdminClient, isSupabaseServerConfigured } from '@/lib/supabase/server';
import { getAnnualConferenceEditionByYear, requireAnnualConferenceCapability } from '@/server/annual-conference-request';
import type { AppBindings } from '@/server/http/app-bindings';
import { internalErrorResponse } from '@/server/http/internal-error-response';
import { enforcePublicRateLimit, publicClientKey } from '@/server/http/public-intake-protection';

const BUCKET = 'annual-conference-speaker-materials';

export const SPEAKER_MATERIAL_MAX_BYTES = 5 * 1024 * 1024;
const MIME = {
  pdf: 'application/pdf',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
} as const;

type Material = { id: string; file_name: string; content_type: string; size_bytes: number; storage_path: string; created_at: string };

function hasPresentationEntries(bytes: Uint8Array): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const names = new Set<string>();
  let end = -1;

  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) === bytes.length) {
      end = offset;
      break;
    }
  }
  if (end < 0 || view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0) return false;
  const count = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  let offset = view.getUint32(end + 16, true);

  if (offset + directorySize !== end || count > 10000) return false;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) return false;
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const next = offset + 46 + nameLength + extraLength + commentLength;

    if (next > end || localOffset + 30 > offset || view.getUint32(localOffset, true) !== 0x04034b50) return false;
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const compressedSize = view.getUint32(offset + 20, true);

    if (new TextDecoder().decode(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength)) !== name || localOffset + 30 + localNameLength + localExtraLength + compressedSize > offset) return false;
    if ((name === '[Content_Types].xml' || name === 'ppt/presentation.xml') && (compressedSize === 0 || view.getUint32(offset + 24, true) === 0)) return false;
    names.add(name);
    offset = next;
  }

  return offset === end && names.has('[Content_Types].xml') && names.has('ppt/presentation.xml');
}

export async function validateSpeakerMaterial(file: File): Promise<string | null> {
  const extension = file.name.toLowerCase().match(/\.(pdf|ppt|pptx)$/)?.[1] as keyof typeof MIME | undefined;

  if (!extension || file.size === 0 || file.size > SPEAKER_MATERIAL_MAX_BYTES) return null;
  // Browsers may provide an empty MIME type, but a conflicting type is rejected.
  if (file.type && file.type !== MIME[extension] && file.type !== 'application/octet-stream') return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const starts = (signature: number[]) => signature.every((byte, index) => bytes[index] === byte);

  if (extension === 'pdf' && starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return MIME.pdf;
  if (extension === 'ppt' && starts([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return MIME.ppt;
  if (extension === 'pptx' && starts([0x50, 0x4b, 0x03, 0x04])) {
    if (hasPresentationEntries(bytes)) return MIME.pptx;
  }

  return null;
}

async function workspace(c: Context<AppBindings>) {
  const year = c.req.param('year') ?? ''; 

  if (!/^\d{4}$/.test(year)) return null;
  const edition = await getAnnualConferenceEditionByYear(Number(year), c);

  if (!edition) return null;
  const link = await getAnnualConferenceSpeakerIntakeLink(edition.id, c.req.param('token') ?? '');

  if (!link || link.revoked_at || new Date(edition.speaker_logistics_deadline ?? link.expires_at).getTime() <= Date.now() || !link.speaker_submission_id || !link.workspace_session_id) return null;
  const [submission, session] = await Promise.all([
    getAnnualConferenceSpeakerSubmission(link.speaker_submission_id),
    getAnnualConferenceSession(link.workspace_session_id),
  ]);

  if (!submission || !session || submission.edition_id !== edition.id || session.edition_id !== edition.id || session.speaker_submission_id !== submission.id || submission.status !== 'selected' || submission.selected_intake_link_id !== link.id || submission.selected_session_id !== session.id) return null;

  return { edition, session };
}

function publicMaterial(material: Material) {
  return { id: material.id, file_name: material.file_name, size_bytes: material.size_bytes, created_at: material.created_at };
}

export function registerAnnualConferenceSpeakerMaterialRoutes(app: Hono<AppBindings>): void {
  const privatePath = '/api/conference-speaker-materials/:year/:token';

  app.get(privatePath, async (c) => {
    c.header('Cache-Control', 'no-store');
    try {
      const access = await workspace(c);

      if (!access) return c.json({ error: 'This presenter link is no longer available.' }, 410);
      if (!isSupabaseServerConfigured(c)) return c.json({ error: 'File uploads are temporarily unavailable.' }, 503);
      const result = await getSupabaseAdminClient(c).from('annual_conference_speaker_materials' as never).select('*').eq('session_id', access.session.id).order('created_at') as unknown as { data: Material[] | null; error: unknown };

      if (result.error) throw result.error;

      return c.json({ materials: (result.data ?? []).map(publicMaterial) });
    } catch (error) {
      return internalErrorResponse(c, 'speaker_materials_list_failed', error, 'Unable to load uploaded files.');
    }
  });

  app.post(privatePath, async (c) => {
    c.header('Cache-Control', 'no-store');
    const rateLimit = await enforcePublicRateLimit(c, { action: 'conference_speaker_material_upload', clientKey: publicClientKey(c), maxAttempts: 20, windowSeconds: 3600 }, 'Too many uploads. Please try again later.');

    if (rateLimit) return rateLimit;
    try {
      const access = await workspace(c);

      if (!access) return c.json({ error: 'This presenter link is no longer available.' }, 410);
      if (!isSupabaseServerConfigured(c)) return c.json({ error: 'File uploads are temporarily unavailable.' }, 503);
      const form = await c.req.formData().catch(() => null);
      const file = form?.get('file');

      if (!(file instanceof File)) return c.json({ error: 'Choose a PDF, PPT, or PPTX file.' }, 400);
      const contentType = await validateSpeakerMaterial(file);

      if (!contentType) return c.json({ error: 'Choose a valid PDF, PPT, or PPTX file no larger than 5 MB.' }, 400);
      const client = getSupabaseAdminClient(c);
      const countResult = await client.from('annual_conference_speaker_materials' as never).select('id', { count: 'exact', head: true }).eq('session_id', access.session.id);

      if (countResult.error) throw countResult.error;
      if ((countResult.count ?? 0) >= 5) return c.json({ error: 'You can upload up to five files.' }, 400);
      const id = crypto.randomUUID();
      const fileName = file.name.replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(-160);
      const storagePath = `${access.edition.id}/${access.session.id}/${id}`;
      const uploaded = await client.storage.from(BUCKET).upload(storagePath, await file.arrayBuffer(), { contentType, upsert: false });

      if (uploaded.error) throw uploaded.error;
      const result = await client.from('annual_conference_speaker_materials' as never).insert({ id, edition_id: access.edition.id, session_id: access.session.id, file_name: fileName, content_type: contentType, size_bytes: file.size, storage_path: storagePath } as never).select('*').single() as unknown as { data: Material | null; error: unknown };

      if (result.error || !result.data) {
        await client.storage.from(BUCKET).remove([storagePath]);

        throw result.error ?? new Error('File metadata was not saved.');
      }

      return c.json({ material: publicMaterial(result.data) }, 201);
    } catch (error) {
      return internalErrorResponse(c, 'speaker_material_upload_failed', error, 'Unable to upload the file. Please try again.');
    }
  });

  const organizerPath = '/api/annual-conference/:year/speaker-submissions/:submissionId/materials';
  const organizerAccess = async (c: Context<AppBindings>) => {
    const adminError = await requireAdmin(c, ['owner', 'organizer']);

    if (adminError) return { error: adminError };
    const year = c.req.param('year') ?? ''; 

    if (!/^\d{4}$/.test(year)) return { error: c.json({ error: 'Conference year must use four digits.' }, 400) };
    const capabilityError = await requireAnnualConferenceCapability(c, Number(year), 'speakers.view');

    if (capabilityError) return { error: capabilityError };
    const edition = await getAnnualConferenceEditionByYear(Number(year), c);
    const submission = await getAnnualConferenceSpeakerSubmission(c.req.param('submissionId') ?? '');

    if (!edition || !submission || submission.edition_id !== edition.id || !submission.selected_session_id) return { error: c.json({ error: 'Conference proposal not found.' }, 404) };

    return { sessionId: submission.selected_session_id };
  };

  app.get(organizerPath, async (c) => {
    c.header('Cache-Control', 'no-store');
    try {
      const access = await organizerAccess(c);

      if (access.error) return access.error;
      if (!isSupabaseServerConfigured(c)) return c.json({ error: 'File uploads are temporarily unavailable.' }, 503);
      const result = await getSupabaseAdminClient(c).from('annual_conference_speaker_materials' as never).select('*').eq('session_id', access.sessionId).order('created_at') as unknown as { data: Material[] | null; error: unknown };

      if (result.error) throw result.error;

      return c.json({ materials: (result.data ?? []).map(publicMaterial) });
    } catch (error) {
      return internalErrorResponse(c, 'speaker_materials_admin_list_failed', error, 'Unable to load uploaded files.');
    }
  });

  app.get(`${organizerPath}/:materialId`, async (c) => {
    c.header('Cache-Control', 'no-store');
    try {
      const access = await organizerAccess(c);

      if (access.error) return access.error;
      if (!isSupabaseServerConfigured(c)) return c.json({ error: 'File downloads are temporarily unavailable.' }, 503);
      const client = getSupabaseAdminClient(c);
      const result = await client.from('annual_conference_speaker_materials' as never).select('*').eq('session_id', access.sessionId).eq('id', c.req.param('materialId')).maybeSingle() as unknown as { data: Material | null; error: unknown };

      if (result.error) throw result.error;
      if (!result.data) return c.json({ error: 'File not found.' }, 404);
      const download = await client.storage.from(BUCKET).download(result.data.storage_path);

      if (download.error || !download.data) throw download.error ?? new Error('File unavailable.');
      c.header('Content-Type', 'application/octet-stream');
      c.header('X-Content-Type-Options', 'nosniff');
      c.header('Content-Disposition', `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(result.data.file_name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`);

      return c.body(await download.data.arrayBuffer());
    } catch (error) {
      return internalErrorResponse(c, 'speaker_material_download_failed', error, 'Unable to download the file.');
    }
  });
}
