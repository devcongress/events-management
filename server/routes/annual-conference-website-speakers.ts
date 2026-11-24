import { createHash } from 'node:crypto';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import {
  getAnnualConferenceSession,
  listFeaturedWebsiteConferenceSessions,
  updateAnnualConferenceSessionWebsiteLineup,
  type AnnualConferenceSession,
} from '@/lib/annual-conference-speakers';
import { DEVCON26_SOCIAL_CARD_BUCKET } from '@/lib/annual-conference-social-cards';
import { safePublicResourceUrl } from '@/lib/safe-url';
import { requireAdmin } from '@/lib/supabase/admin-auth';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';
import { getAnnualConferenceEditionByYear, requireAnnualConferenceCapability } from '@/server/annual-conference-request';
import { envValue } from '@/server/env';
import type { AppBindings } from '@/server/http/app-bindings';
import { internalErrorResponse } from '@/server/http/internal-error-response';
import { publicAppOrigin } from '@/server/http/public-app-origin';
import { recordProtectedMutationAudit } from '@/server/protected-mutation';

const PUBLIC_SPEAKERS_PATH = '/api/public/annual-conference/2026/speakers';
const PUBLIC_SPEAKER_PHOTO_PATH = `${PUBLIC_SPEAKERS_PATH}/:sessionId/photo`;
const ORGANIZER_LINEUP_PATH = '/api/annual-conference/:year/speaker-sessions/:sessionId/website-lineup';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const websiteLineupUpdateSchema = z.object({
  featured: z.boolean(),
  role: z.string().trim().max(120, 'Role must be 120 characters or fewer.').nullable().optional(),
  organization: z.string().trim().max(120, 'Organization must be 120 characters or fewer.').nullable().optional(),
}).strict();

function publicOrigin(c: Context<AppBindings>): string {
  if (envValue('NODE_ENV', c) !== 'production') return publicAppOrigin(c);
  const configured = envValue('PUBLIC_APP_URL', c);

  if (!configured) throw new Error('PUBLIC_APP_URL is required for public speaker listings.');
  const url = new URL(configured);

  if (url.protocol !== 'https:' || url.origin !== configured || url.username || url.password) {
    throw new Error('PUBLIC_APP_URL must be an HTTPS origin.');
  }

  return url.origin;
}

function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) return 'image/png';
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));

  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (bytes.length >= 16 && ascii(4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(8, 12))) return 'image/avif';

  return null;
}

function photoVersionFor(session: Pick<AnnualConferenceSession, 'headshot_photo_path' | 'headshot_revision'>): string | null {
  if (!session.headshot_photo_path) return null;

  return createHash('sha256')
    .update(`${session.headshot_photo_path}:${session.headshot_revision ?? 0}`)
    .digest('base64url')
    .slice(0, 16);
}

function projectPublicSpeaker(session: AnnualConferenceSession, origin: string) {
  const version = photoVersionFor(session);
  const safeExternalUrl = !session.headshot_photo_path && session.headshot_url
    ? safePublicResourceUrl(session.headshot_url)
    : null;
  const photoUrl = version
    ? `${origin}${PUBLIC_SPEAKERS_PATH}/${session.id}/photo?v=${encodeURIComponent(version)}`
    : safeExternalUrl;

  return {
    id: session.id,
    name: session.speaker_name.trim(),
    role: session.website_role?.trim() || null,
    organization: session.website_organization?.trim() || null,
    bio: session.bio?.trim() || '',
    photoUrl,
    photoVersion: version,
  };
}

function normalizeOptionalLabel(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();

  return trimmed.length ? trimmed : null;
}

export function registerAnnualConferenceWebsiteSpeakerRoutes(app: Hono<AppBindings>): void {
  app.get(PUBLIC_SPEAKERS_PATH, async (c) => {
    try {
      const edition = await getAnnualConferenceEditionByYear(2026, c);

      if (!edition) return c.json({ error: 'Conference edition not found.' }, 404);
      const sessions = await listFeaturedWebsiteConferenceSessions(edition.id);
      const origin = publicOrigin(c);
      const speakers = sessions.map((session) => projectPublicSpeaker(session, origin));
      const updatedAt = sessions.reduce<string | null>((latest, session) => {
        if (!latest || session.updated_at > latest) return session.updated_at;

        return latest;
      }, null);
      const payload = { year: 2026, updatedAt, speakers };
      const etag = `"${createHash('sha256').update(JSON.stringify(payload)).digest('base64url').slice(0, 24)}"`;

      c.header('ETag', etag);
      c.header('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
      if (c.req.header('If-None-Match') === etag) return c.body(null, 304);

      return c.json(payload);
    } catch (error) {
      return internalErrorResponse(c, 'public_annual_conference_speakers_failed', error, 'Unable to load conference speakers.');
    }
  });

  app.get(PUBLIC_SPEAKER_PHOTO_PATH, async (c) => {
    const sessionId = c.req.param('sessionId') ?? '';

    if (!UUID_PATTERN.test(sessionId)) return c.json({ error: 'Speaker photo not found.' }, 404);

    try {
      const edition = await getAnnualConferenceEditionByYear(2026, c);

      if (!edition) return c.json({ error: 'Speaker photo not found.' }, 404);
      const session = await getAnnualConferenceSession(sessionId);

      if (
        !session
        || session.edition_id !== edition.id
        || session.status !== 'confirmed'
        || !session.website_featured
        || !session.headshot_photo_path
      ) {
        return c.json({ error: 'Speaker photo not found.' }, 404);
      }
      if (!isSupabaseRuntimeEnabled(c)) return c.json({ error: 'Speaker photo unavailable.' }, 404);

      const result = await getSupabaseAdminClient(c).storage
        .from(DEVCON26_SOCIAL_CARD_BUCKET)
        .download(session.headshot_photo_path);

      if (result.error || !result.data) return c.json({ error: 'Speaker photo not found.' }, 404);
      const bytes = new Uint8Array(await result.data.arrayBuffer());
      const contentType = sniffImageType(bytes);

      if (!contentType || bytes.length > MAX_PHOTO_BYTES) return c.json({ error: 'Speaker photo unavailable.' }, 503);

      c.header('Content-Type', contentType);
      c.header('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
      c.header('X-Content-Type-Options', 'nosniff');

      return c.body(bytes);
    } catch (error) {
      return internalErrorResponse(c, 'public_annual_conference_speaker_photo_failed', error, 'Unable to load speaker photo.');
    }
  });

  app.patch(ORGANIZER_LINEUP_PATH, async (c) => {
    const adminError = await requireAdmin(c, ['owner', 'organizer', 'member']);

    if (adminError) return adminError;
    const yearParam = c.req.param('year') ?? '';
    const sessionId = c.req.param('sessionId') ?? '';

    if (!/^\d{4}$/.test(yearParam)) return c.json({ error: 'Conference year must use four digits.' }, 400);
    if (!UUID_PATTERN.test(sessionId)) return c.json({ error: 'Speaker session not found.' }, 404);
    const year = Number(yearParam);
    const capabilityError = await requireAnnualConferenceCapability(c, year, 'speakers.participation.manage');

    if (capabilityError) return capabilityError;
    const parsed = websiteLineupUpdateSchema.safeParse(await c.req.json().catch(() => null));

    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the website speaker details.' }, 400);
    }

    try {
      const edition = await getAnnualConferenceEditionByYear(year, c);

      if (!edition) return c.json({ error: `Annual conference ${year} was not found.` }, 404);
      const existing = await getAnnualConferenceSession(sessionId);

      if (!existing || existing.edition_id !== edition.id || existing.status !== 'confirmed') {
        return c.json({ error: 'Confirmed speaker session not found.' }, 404);
      }

      const nextRole = parsed.data.role === undefined ? existing.website_role : normalizeOptionalLabel(parsed.data.role);
      const nextOrg = parsed.data.organization === undefined
        ? existing.website_organization
        : normalizeOptionalLabel(parsed.data.organization);
      const updated = await updateAnnualConferenceSessionWebsiteLineup(existing.id, {
        website_featured: parsed.data.featured,
        website_role: nextRole,
        website_organization: nextOrg,
      });

      if (!updated) return c.json({ error: 'Confirmed speaker session not found.' }, 404);

      await recordProtectedMutationAudit(c, {
        action: 'annual_conference.speaker_website_lineup.update',
        targetType: 'annual_conference_session',
        targetId: updated.id,
        metadata: {
          edition_year: year,
          website_featured: updated.website_featured,
          has_role: Boolean(updated.website_role),
          has_organization: Boolean(updated.website_organization),
        },
      }).catch(() => undefined);

      return c.json({
        website_lineup: {
          featured: updated.website_featured,
          role: updated.website_role,
          organization: updated.website_organization,
          featured_at: updated.website_featured_at,
        },
      });
    } catch (error) {
      return internalErrorResponse(
        c,
        'annual_conference_speaker_website_lineup_update_failed',
        error,
        'Unable to update the speaker website lineup.',
      );
    }
  });
}
