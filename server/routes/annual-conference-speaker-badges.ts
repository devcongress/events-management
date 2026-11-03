import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { getAnnualConferenceSession, getAnnualConferenceSpeakerIntakeLink, getAnnualConferenceSpeakerSubmission } from '@/lib/annual-conference-speakers';
import { DEVCON26_SOCIAL_CARD_BUCKET, normalizeDevcon26SocialCardName, validateDevcon26SocialCardCrop, validateDevcon26SocialCardImage } from '@/lib/annual-conference-social-cards';
import { ensureSpeakerSocialCard, updateSupabaseAnnualConferenceSocialCard, uploadSupabaseAnnualConferenceSocialCardPhoto, type AnnualConferenceSocialCard } from '@/lib/supabase/annual-conference-social-cards';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { getAnnualConferenceEditionByYear, requireAnnualConferenceCapability } from '@/server/annual-conference-request';
import { enforcePublicRateLimit, publicClientKey } from '@/server/http/public-intake-protection';
import type { AppBindings } from '@/server/http/app-bindings';

const workspace = '/api/conferences/:year/speaker-intake/:token/badge';
const admin = '/api/annual-conference/:year/speaker-badges/:sessionId';
const updateSchema = z.object({ display_name: z.string().trim().min(1).max(120), crop: z.object({ x: z.number(), y: z.number(), scale: z.number() }) }).strict();

function response(card: AnnualConferenceSocialCard) {
  return { display_name: card.display_name, role: 'speaker', crop: { x: card.crop_x, y: card.crop_y, scale: card.crop_scale }, photo_available: Boolean(card.photo_path) };
}

async function resolveCard(c: Context<AppBindings>, organizer: boolean) {
  const year = c.req.param('year');

  if (year !== '2026') return null;
  if (organizer) {
    const denied = await requireAnnualConferenceCapability(c, Number(year), 'speakers.view');

    if (denied) return denied;
  }
  const edition = await getAnnualConferenceEditionByYear(Number(year), c);

  if (!edition) return null;
  let sessionId = c.req.param('sessionId');
  let link: Awaited<ReturnType<typeof getAnnualConferenceSpeakerIntakeLink>>;

  if (!organizer) {
    const token = c.req.param('token');

    if (!token || token.length > 200) return null;
    link = await getAnnualConferenceSpeakerIntakeLink(edition.id, token);
    if (!link || link.revoked_at || !link.speaker_submission_id || !link.workspace_session_id) return null;
    sessionId = link.workspace_session_id;
  }
  if (!sessionId) return null;
  const session = await getAnnualConferenceSession(sessionId);

  if (!session || session.edition_id !== edition.id || session.status !== 'confirmed' || !session.speaker_submission_id) return null;
  const submission = await getAnnualConferenceSpeakerSubmission(session.speaker_submission_id);

  if (!submission || submission.edition_id !== edition.id || submission.status !== 'selected' || submission.selected_session_id !== session.id) return null;
  if (!organizer && (!link || link.speaker_submission_id !== submission.id || submission.selected_intake_link_id !== link.id)) return null;

  return ensureSpeakerSocialCard({ editionId: edition.id, sessionId: session.id, name: submission.speaker_name }, c);
}

export function registerAnnualConferenceSpeakerBadgeRoutes(app: Hono<AppBindings>) {
  for (const [path, organizer] of [[workspace, false], [admin, true]] as const) {
    app.get(path, async (c) => {
      c.header('Cache-Control', 'no-store');
      const card = await resolveCard(c, organizer);

      if (card instanceof Response) return card;
      if (!card || card.revoked_at) return c.json({ error: 'This speaker badge is unavailable.' }, 404);

      return c.json({ card: response(card) });
    });
    app.get(`${path}/photo`, async (c) => {
      c.header('Cache-Control', 'no-store');
      const card = await resolveCard(c, organizer);

      if (card instanceof Response) return card;
      if (!card?.photo_path || card.revoked_at) return c.json({ error: 'Badge photo not found.' }, 404);
      const result = await getSupabaseAdminClient(c).storage.from(DEVCON26_SOCIAL_CARD_BUCKET).download(card.photo_path);

      if (result.error) return c.json({ error: 'Badge photo not found.' }, 404);
      c.header('Content-Type', result.data.type || 'application/octet-stream');

      return c.body(await result.data.arrayBuffer());
    });
  }
  app.patch(workspace, async (c) => {
    c.header('Cache-Control', 'no-store');
    const limited = await enforcePublicRateLimit(c, { action: 'speaker_badge_update', clientKey: publicClientKey(c), maxAttempts: 60, windowSeconds: 3600 }, 'Too many attempts. Please try again later.');

    if (limited) return limited;
    const card = await resolveCard(c, false);

    if (card instanceof Response) return card;
    if (!card || card.revoked_at) return c.json({ error: 'This speaker badge is unavailable.' }, 404);
    const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));

    if (!parsed.success || !validateDevcon26SocialCardCrop(parsed.data.crop)) return c.json({ error: 'Check the name and crop settings.' }, 400);
    const name = normalizeDevcon26SocialCardName(parsed.data.display_name);

    if (!name) return c.json({ error: 'Check the display name.' }, 400);
    const updated = await updateSupabaseAnnualConferenceSocialCard(card.id, { displayName: name, crop: parsed.data.crop }, c);

    if (!updated) return c.json({ error: 'Unable to save badge.' }, 503);

    return c.json({ card: response(updated) });
  });
  app.post(`${workspace}/photo`, async (c) => {
    c.header('Cache-Control', 'no-store');
    const limited = await enforcePublicRateLimit(c, { action: 'speaker_badge_photo', clientKey: publicClientKey(c), maxAttempts: 12, windowSeconds: 3600 }, 'Too many attempts. Please try again later.');

    if (limited) return limited;
    const card = await resolveCard(c, false);

    if (card instanceof Response) return card;
    if (!card || card.revoked_at) return c.json({ error: 'This speaker badge is unavailable.' }, 404);
    const file = (await c.req.parseBody()).photo;

    if (!(file instanceof File)) return c.json({ error: 'Choose an image.' }, 400);
    const error = validateDevcon26SocialCardImage(file);

    if (error) return c.json({ error }, 400);
    const photoPath = await uploadSupabaseAnnualConferenceSocialCardPhoto(card.id, file, c);
    const updated = await updateSupabaseAnnualConferenceSocialCard(card.id, { photoPath }, c);

    if (!updated) return c.json({ error: 'Unable to save badge photo.' }, 503);

    return c.json({ card: response(updated) });
  });
}
