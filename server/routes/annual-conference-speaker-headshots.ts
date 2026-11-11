import { createHash, randomUUID } from 'node:crypto';
import type { Context, Hono } from 'hono';
import { getAnnualConferenceSession, getAnnualConferenceSpeakerIntakeLink, getAnnualConferenceSpeakerSubmission, updateAnnualConferenceSessionHeadshot, type AnnualConferenceSession } from '@/lib/annual-conference-speakers';
import { DEVCON26_SOCIAL_CARD_BUCKET, validateDevcon26SocialCardImage } from '@/lib/annual-conference-social-cards';
import { safePublicResourceUrl } from '@/lib/safe-url';
import { ensureSpeakerSocialCard, type AnnualConferenceSocialCard } from '@/lib/supabase/annual-conference-social-cards';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { getAnnualConferenceEditionByYear, requireAnnualConferenceCapability } from '@/server/annual-conference-request';
import { enforcePublicRateLimit, publicClientKey } from '@/server/http/public-intake-protection';
import type { AppBindings } from '@/server/http/app-bindings';

const workspace = '/api/conferences/:year/speaker-intake/:token/headshot';
const organizerPhoto = '/api/annual-conference/:year/speaker-headshots/:sessionId/photo';

function version(path: string) {
  return createHash('sha256').update(path).digest('base64url');
}

function imageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) return 'image/png';
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));

  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (bytes.length >= 16 && ascii(4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(8, 12))) return 'image/avif';

  return null;
}

function dto(session: AnnualConferenceSession, card: AnnualConferenceSocialCard | null) {
  const path = card && !card.revoked_at ? card.photo_path : null;

  return {
    headshot: { source: session.headshot_photo_path ? 'photo' : session.headshot_url ? 'link' : 'none', url: session.headshot_url ?? null, revision: session.headshot_revision ?? 0, photo_available: Boolean(session.headshot_photo_path) },
    badge_photo: { available: Boolean(path), version: path ? version(path) : null },
  };
}

async function resolve(c: Context<AppBindings>, organizer = false) {
  const year = c.req.param('year') ?? '';

  if (!/^\d{4}$/.test(year)) return null;
  if (organizer) {
    const denied = await requireAnnualConferenceCapability(c, Number(year), 'speakers.participation.view');

    if (denied) return denied;
  }
  const edition = await getAnnualConferenceEditionByYear(Number(year), c);

  if (!edition) return null;
  const token = c.req.param('token');
  const link = organizer ? null : token && token.length <= 200 ? await getAnnualConferenceSpeakerIntakeLink(edition.id, token) : null;

  if (!organizer && (!link || link.revoked_at || !link.speaker_submission_id || !link.workspace_session_id)) return null;
  const sessionId = organizer ? c.req.param('sessionId') : link?.workspace_session_id;

  if (!sessionId) return null;
  const session = await getAnnualConferenceSession(sessionId);

  if (!session || session.edition_id !== edition.id || session.status !== 'confirmed' || !session.speaker_submission_id) return null;
  const submission = await getAnnualConferenceSpeakerSubmission(session.speaker_submission_id);

  if (!submission || submission.edition_id !== edition.id || submission.status !== 'selected' || submission.selected_session_id !== session.id) return null;
  if (!organizer && (!link || link.speaker_submission_id !== submission.id || submission.selected_intake_link_id !== link.id)) return null;

  return { session, edition, submission };
}

async function cardFor(c: Context<AppBindings>, resolved: NonNullable<Exclude<Awaited<ReturnType<typeof resolve>>, Response>>) {
  return ensureSpeakerSocialCard({ editionId: resolved.edition.id, sessionId: resolved.session.id, name: resolved.submission.speaker_name }, c);
}

function revision(c: Context<AppBindings>): number | null {
  const raw = c.req.header('X-Headshot-Revision');

  if (!raw || !/^(0|[1-9]\d*)$/.test(raw)) return null;
  const value = Number(raw);

  return Number.isSafeInteger(value) && value < 2147483647 ? value : null;
}

export function registerAnnualConferenceSpeakerHeadshotRoutes(app: Hono<AppBindings>) {
  for (const [path, organizer] of [[`${workspace}/photo`, false], [organizerPhoto, true]] as const) {
    app.get(path, async (c) => {
      c.header('Cache-Control', 'private, no-store');
      const resolved = await resolve(c, organizer);

      if (resolved instanceof Response) return resolved;
      if (!resolved?.session.headshot_photo_path) return c.json({ error: 'Headshot not found.' }, 404);
      const result = await getSupabaseAdminClient(c).storage.from(DEVCON26_SOCIAL_CARD_BUCKET).download(resolved.session.headshot_photo_path);

      if (result.error || !result.data) return c.json({ error: 'Headshot not found.' }, 404);
      const bytes = new Uint8Array(await result.data.arrayBuffer());
      const type = imageType(bytes);

      if (!type || bytes.length > 5 * 1024 * 1024) return c.json({ error: 'Headshot unavailable.' }, 503);
      c.header('Content-Type', type);
      c.header('X-Content-Type-Options', 'nosniff');
      if (organizer) {
        const extension = type === 'image/jpeg' ? 'jpg' : type.slice('image/'.length);

        c.header('Content-Disposition', `attachment; filename="speaker-headshot.${extension}"`);
      }

      return c.body(bytes);
    });
  }
  app.get(workspace, async (c) => {
    c.header('Cache-Control', 'private, no-store');
    const resolved = await resolve(c);

    if (resolved instanceof Response) return resolved;
    if (!resolved) return c.json({ error: 'This speaker workspace is unavailable.' }, 404);

    return c.json(dto(resolved.session, await cardFor(c, resolved)));
  });

  for (const method of ['post', 'patch', 'delete'] as const) {
    const path = method === 'post' ? `${workspace}/photo` : workspace;

    app[method](path, async (c) => {
      c.header('Cache-Control', 'private, no-store');
      const limited = await enforcePublicRateLimit(c, { action: 'speaker_headshot', clientKey: publicClientKey(c), maxAttempts: 60, windowSeconds: 3600 }, 'Too many attempts. Please try again later.');

      if (limited) return limited;
      const resolved = await resolve(c);

      if (resolved instanceof Response) return resolved;
      if (!resolved) return c.json({ error: 'This speaker workspace is unavailable.' }, 404);
      const expected = revision(c);

      if (expected === null) return c.json({ error: 'A headshot revision is required.' }, 400);
      if (expected !== (resolved.session.headshot_revision ?? 0)) return c.json({ error: 'The headshot changed. Refresh and try again.' }, 409);
      let card = await cardFor(c, resolved);
      let selection: { headshot_url: string | null; headshot_photo_path: string | null } = { headshot_url: null, headshot_photo_path: null };
      const storage = getSupabaseAdminClient(c).storage.from(DEVCON26_SOCIAL_CARD_BUCKET);

      try {
        if (method === 'post') {
          const file = (await c.req.parseBody()).file;

          if (!(file instanceof File) || validateDevcon26SocialCardImage(file)) return c.json({ error: 'Choose an AVIF, JPEG, PNG, or WebP image up to 5MB.' }, 400);
          const bytes = new Uint8Array(await file.arrayBuffer());
          const type = imageType(bytes);

          if (!type || type !== file.type) return c.json({ error: 'Image content does not match its type.' }, 400);
          const destination = `headshots/${resolved.session.id}/${randomUUID()}`;
          const uploaded = await storage.upload(destination, bytes, { contentType: type, upsert: false });

          if (uploaded.error) throw new Error('Upload failed.');
          selection = { headshot_url: null, headshot_photo_path: destination };
        } else if (method === 'patch') {
          const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;

          if (body?.source === 'link' && Object.keys(body).every(key => ['source', 'url'].includes(key))) {
            const url = typeof body.url === 'string' ? safePublicResourceUrl(body.url) : null;

            if (!url) return c.json({ error: 'Enter a valid HTTPS link.' }, 400);
            selection = { headshot_url: url, headshot_photo_path: null };
          } else if (body?.source === 'badge' && Object.keys(body).every(key => ['source', 'badge_version'].includes(key))) {
            const badgePath = card && !card.revoked_at ? card.photo_path : null;

            if (!badgePath || body.badge_version !== version(badgePath)) return c.json({ error: 'The badge photo changed. Refresh and try again.' }, 409);
            const downloaded = await storage.download(badgePath);

            if (downloaded.error || !downloaded.data) return c.json({ error: 'The badge photo changed. Refresh and try again.' }, 409);
            const bytes = new Uint8Array(await downloaded.data.arrayBuffer());

            if (bytes.length > 5 * 1024 * 1024 || !imageType(bytes)) return c.json({ error: 'Badge image is invalid.' }, 400);
            const destination = `headshots/${resolved.session.id}/${randomUUID()}`;
            const copied = await storage.copy(badgePath, destination);

            if (copied.error) throw new Error('Copy failed.');
            card = await cardFor(c, resolved);
            if (!card || card.revoked_at || card.photo_path !== badgePath) return c.json({ error: 'The badge photo changed. Refresh and try again.' }, 409);
            selection = { headshot_url: null, headshot_photo_path: destination };
          } else return c.json({ error: 'Choose a headshot source.' }, 400);
        }
        const current = await resolve(c);

        if (!current || current instanceof Response || current.session.id !== resolved.session.id || current.submission.id !== resolved.submission.id) {
          return c.json({ error: 'This speaker workspace is unavailable.' }, 404);
        }
        const updated = await updateAnnualConferenceSessionHeadshot(resolved.session.id, expected, selection);

        if (!updated) return c.json({ error: 'The headshot changed. Refresh and try again.' }, 409);

        return c.json(dto(updated, card));
      } catch {
        return c.json({ error: 'Unable to save the headshot. Please try again.' }, 503);
      }
    });
  }
}
