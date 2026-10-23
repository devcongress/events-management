import { completeTestDispatchOrigin } from '@/server/complete-test-dispatch';
import { registrationTesting } from '@/server/annual-conference-registration-testing';
import crypto from 'crypto';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { annualConferenceSocialCardEmailConfigurationForRequest, retryAnnualConferenceSocialCardEmails } from '@/server/annual-conference-social-card-email-delivery';
import { DEVCON26_SOCIAL_CARD_BUCKET, normalizeDevcon26SocialCardName, validateDevcon26SocialCardCrop, validateDevcon26SocialCardImage } from '@/lib/annual-conference-social-cards';
import {
  getSupabaseAnnualConferenceSocialCardByCapability,
  getSupabaseAnnualConferenceSocialCardByCollectionCapability,
  getSupabaseAnnualConferenceSocialCardByOrderSeat,
  getSupabaseAnnualConferenceSocialCardCollectionByOrder,
  getSupabaseAnnualConferenceSocialCardCollection,
  getSupabasePublicAnnualConferenceSocialCard,
  issueSupabaseAnnualConferenceSocialCardDelivery,
  updateSupabaseAnnualConferenceSocialCard,
  uploadSupabaseAnnualConferenceSocialCardPhoto,
} from '@/lib/supabase/annual-conference-social-cards';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/supabase/admin-auth';
import { getAnnualConferenceEditionByYear } from '@/server/annual-conference-request';
import { envValue } from '@/server/env';
import type { AppBindings } from '@/server/http/app-bindings';
import { recordProtectedMutationAudit } from '@/server/protected-mutation';
import { secureSharedSecret } from '@/lib/security/shared-secret';
import { verifyAnnualConferenceSocialCardBuyerGrant } from '@/lib/annual-conference-social-card-buyer-grant';
import { enforcePublicRateLimit, publicClientKey } from '@/server/http/public-intake-protection';

const yearSchema = z.string().regex(/^\d{4}$/);
const issueSchema = z.object({ subject_type: z.enum(['attendee', 'speaker']), subject_id: z.string().uuid() }).strict();
const managementUpdateSchema = z.object({ display_name: z.string().trim().min(1).max(120).optional(), crop: z.object({ x: z.number(), y: z.number(), scale: z.number() }).optional(), public_enabled: z.boolean().optional() }).strict();
const managementPath = '/api/public/annual-conference/2026/social-cards/manage';
const publicPath = '/api/public/annual-conference/2026/social-cards';
const collectionPath = '/api/public/annual-conference/2026/social-cards/collection';
const buyerCollectionPath = '/api/public/annual-conference/2026/social-cards/buyer/collection';

function unavailable(c: Context<AppBindings>) {
  c.header('Cache-Control', 'no-store');

  return c.json({ error: 'Social-card storage is not configured for this environment.' }, 503);
}

function scheduledJobAuthorized(c: Context<AppBindings>): boolean {
  const expected = secureSharedSecret(envValue('SLACK_EVENTS_RETRY_SECRET', c));
  const received = c.req.header('x-scheduled-job-secret')?.trim();

  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

async function managedCard(c: Context<AppBindings>) {
  const capability = c.req.header('x-social-card-capability')?.trim();

  if (!capability || capability.length > 200) return null;

  return getSupabaseAnnualConferenceSocialCardByCapability(capability, c);
}

async function managedCollectionCard(c: Context<AppBindings>, seatNumber: number) {
  const capability = c.req.header('x-social-card-collection-capability')?.trim();

  if (!capability || capability.length > 200 || !Number.isSafeInteger(seatNumber) || seatNumber < 1) return null;

  return getSupabaseAnnualConferenceSocialCardByCollectionCapability(capability, seatNumber, c);
}

function buyerClaims(c: Context<AppBindings>) {
  const grant = c.req.header('x-social-card-buyer-grant')?.trim();
  const origin = c.req.header('origin');
  const previewOrigin = completeTestDispatchOrigin(c);
  const secretKey = (previewOrigin ? envValue('PAYSTACK_TEST_SECRET_KEY', c) || envValue('PAYSTACK_SECRET_KEY', c)
    : envValue('PAYSTACK_SECRET_KEY', c))?.trim();

  if (!grant || !origin || !secretKey?.startsWith(previewOrigin ? 'sk_test_' : 'sk_live_')
    || (previewOrigin && origin !== previewOrigin)) return null;

  const claims = verifyAnnualConferenceSocialCardBuyerGrant({ grant, origin, secretKey });

  if (previewOrigin && !claims?.seat_numbers) return null;

  return claims;
}

function buyerOrderId(c: Context<AppBindings>): string | null {
  return buyerClaims(c)?.order_id ?? null;
}

function managementCardResponse(card: NonNullable<Awaited<ReturnType<typeof getSupabaseAnnualConferenceSocialCardByCapability>>>) {
  return {
    is_test: Boolean(card.is_test),
    display_name: card.display_name,
    role: card.role,
    crop: { x: card.crop_x, y: card.crop_y, scale: card.crop_scale },
    public_enabled: card.public_enabled,
    public_slug: card.public_slug,
    photo_available: Boolean(card.photo_path),
  };
}

function publicCardResponse(card: NonNullable<Awaited<ReturnType<typeof getSupabasePublicAnnualConferenceSocialCard>>>) {
  return {
    is_test: Boolean(card.is_test),
    display_name: card.display_name,
    role: card.role,
    event_name: 'DevCon26',
    event_date: '19 December 2026',
    location: 'Accra, Ghana',
    photo_available: Boolean(card.photo_path),
  };
}

export function registerAnnualConferenceSocialCardRoutes(app: Hono<AppBindings>): void {
  app.use(`${buyerCollectionPath}*`, async (c, next) => {
    const claims = buyerClaims(c);

    if (!claims) return c.json({ error: 'This ticket-card session is invalid or has expired.' }, 401);

    const seatMatch = c.req.path.match(/\/seats\/(\d+)(?:\/photo)?$/);

    if (claims.seat_numbers && seatMatch && !claims.seat_numbers.includes(Number(seatMatch[1]))) {
      return c.json({ error: 'This ticket card is not part of your session.' }, 403);
    }

    const previewOrigin = completeTestDispatchOrigin(c);

    if (previewOrigin) {
      const order = await getSupabaseAdminClient(c).from('annual_conference_ticket_orders' as never)
        .select('payment_mode,checkout_origin,edition_id,status').eq('id', claims.order_id).single() as unknown as {
          data: { payment_mode: string; checkout_origin: string; edition_id: string; status: string } | null; error: unknown;
        };

      if (order.error || order.data?.payment_mode !== 'test' || order.data.checkout_origin !== previewOrigin
        || order.data.status !== 'paid' || !(await registrationTesting(c, order.data.edition_id)).enabled) {
        return c.json({ error: 'This preview badge is unavailable.' }, 403);
      }
    }
    const limited = await enforcePublicRateLimit(c, {
      action: 'devcon26-buyer-social-card', clientKey: publicClientKey(c), maxAttempts: 80, windowSeconds: 300,
    }, 'Please wait before editing more ticket cards.');

    if (limited) return limited;

    await next();
  });

  app.use(`${buyerCollectionPath}/seats/:seatNumber/photo`, async (c, next) => {
    const limited = await enforcePublicRateLimit(c, {
      action: 'devcon26-buyer-social-card-upload', clientKey: publicClientKey(c), maxAttempts: 8, windowSeconds: 300,
    }, 'Please wait before uploading another photo.');

    if (limited) return limited;

    await next();
  });

  app.get(buyerCollectionPath, async (c) => {
    c.header('Cache-Control', 'no-store');
    const orderId = buyerOrderId(c);

    if (!orderId) return c.json({ error: 'This ticket-card session is invalid or has expired.' }, 401);
    const collection = await getSupabaseAnnualConferenceSocialCardCollectionByOrder(orderId, c);

    if (collection === undefined) return unavailable(c);
    if (!collection?.length) return c.json({ error: 'Ticket cards are available after payment is confirmed.' }, 409);

    const scope = buyerClaims(c)?.seat_numbers;
    const visibleSeats = scope ? collection.filter((seat) => scope.includes(seat.seat_number ?? 0)) : collection;

    return c.json({ seats: visibleSeats.map((seat) => ({ seat_number: seat.seat_number, card: managementCardResponse(seat.card) })) });
  });

  app.get(`${buyerCollectionPath}/seats/:seatNumber`, async (c) => {
    c.header('Cache-Control', 'no-store');
    const orderId = buyerOrderId(c);
    const seatNumber = Number(c.req.param('seatNumber'));

    if (!orderId) return c.json({ error: 'This ticket-card session is invalid or has expired.' }, 401);
    const card = await getSupabaseAnnualConferenceSocialCardByOrderSeat(orderId, seatNumber, c);

    if (card === undefined) return unavailable(c);
    if (!card) return c.json({ error: 'This ticket card is no longer available.' }, 404);

    return c.json({ card: managementCardResponse(card) });
  });

  app.patch(`${buyerCollectionPath}/seats/:seatNumber`, async (c) => {
    c.header('Cache-Control', 'no-store');
    const orderId = buyerOrderId(c);
    const seatNumber = Number(c.req.param('seatNumber'));

    if (!orderId) return c.json({ error: 'This ticket-card session is invalid or has expired.' }, 401);
    const card = await getSupabaseAnnualConferenceSocialCardByOrderSeat(orderId, seatNumber, c);

    if (card === undefined) return unavailable(c);
    if (!card) return c.json({ error: 'This ticket card is no longer available.' }, 404);
    const body = managementUpdateSchema.safeParse(await c.req.json().catch(() => null));

    if (!body.success || body.data.public_enabled !== undefined || (body.data.crop && !validateDevcon26SocialCardCrop(body.data.crop))) {
      return c.json({ error: 'Check the display name or crop settings.' }, 400);
    }
    const name = body.data.display_name === undefined ? undefined : normalizeDevcon26SocialCardName(body.data.display_name);

    if (body.data.display_name !== undefined && !name) return c.json({ error: 'Check the display name.' }, 400);
    const updated = await updateSupabaseAnnualConferenceSocialCard(card.id, { displayName: name ?? undefined, crop: body.data.crop }, c);

    if (!updated) return unavailable(c);

    return c.json({ card: managementCardResponse(updated) });
  });

  app.post(`${buyerCollectionPath}/seats/:seatNumber/photo`, async (c) => {
    c.header('Cache-Control', 'no-store');
    const orderId = buyerOrderId(c);
    const seatNumber = Number(c.req.param('seatNumber'));

    if (!orderId) return c.json({ error: 'This ticket-card session is invalid or has expired.' }, 401);
    const card = await getSupabaseAnnualConferenceSocialCardByOrderSeat(orderId, seatNumber, c);

    if (card === undefined) return unavailable(c);
    if (!card) return c.json({ error: 'This ticket card is no longer available.' }, 404);
    const body = await c.req.parseBody();
    const file = body.photo;

    if (!(file instanceof File)) return c.json({ error: 'Choose an image to upload.' }, 400);
    const fileError = validateDevcon26SocialCardImage(file);

    if (fileError) return c.json({ error: fileError }, 400);

    try {
      const photoPath = await uploadSupabaseAnnualConferenceSocialCardPhoto(card.id, file, c);
      const updated = await updateSupabaseAnnualConferenceSocialCard(card.id, { photoPath }, c);

      if (!updated) return unavailable(c);

      return c.json({ card: managementCardResponse(updated) });
    } catch {
      return c.json({ error: 'Unable to save the social-card photo.' }, 500);
    }
  });

  app.get(`${buyerCollectionPath}/seats/:seatNumber/photo`, async (c) => {
    c.header('Cache-Control', 'no-store');
    const orderId = buyerOrderId(c);
    const seatNumber = Number(c.req.param('seatNumber'));

    if (!orderId) return c.json({ error: 'This ticket-card session is invalid or has expired.' }, 401);
    const card = await getSupabaseAnnualConferenceSocialCardByOrderSeat(orderId, seatNumber, c);

    if (card === undefined) return unavailable(c);
    if (!card?.photo_path) return c.json({ error: 'Social-card image not found.' }, 404);
    const result = await getSupabaseAdminClient(c).storage.from(DEVCON26_SOCIAL_CARD_BUCKET).download(card.photo_path);

    if (result.error) return c.json({ error: 'Social-card image not found.' }, 404);
    c.header('Content-Type', result.data.type || 'application/octet-stream');

    return c.body(await result.data.arrayBuffer());
  });

  app.post('/api/annual-conference/:year/social-cards/deliveries', async (c) => {
    const access = await requireAdmin(c, ['owner']);

    if (access) return access;
    const year = yearSchema.safeParse(c.req.param('year'));
    const body = issueSchema.safeParse(await c.req.json().catch(() => null));

    if (!year.success || !body.success) return c.json({ error: body.error?.issues[0]?.message ?? 'Check the social-card delivery details.' }, 400);
    if (!annualConferenceSocialCardEmailConfigurationForRequest(c).enabled) {
      return c.json({ error: 'Social-card email delivery is not configured.' }, 503);
    }
    const edition = await getAnnualConferenceEditionByYear(Number(year.data), c);

    if (!edition) return c.json({ error: `Annual conference ${year.data} was not found.` }, 404);
    try {
      const issued = await issueSupabaseAnnualConferenceSocialCardDelivery({ editionId: edition.id, subjectType: body.data.subject_type, subjectId: body.data.subject_id }, c);

      if (issued === null) return unavailable(c);
      if (!issued) return c.json({ error: 'This attendee or confirmed speaker is not eligible for a social card.' }, 409);
      await recordProtectedMutationAudit(c, { action: 'annual_conference.social_card.delivery_issue', targetType: 'annual_conference_social_card', targetId: issued.social_card_id, metadata: { edition_year: Number(year.data), subject_type: body.data.subject_type } });

      return c.json({ social_card_id: issued.social_card_id, delivery: 'queued' }, 202);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';

      return c.json({ error: message.includes('ineligible') ? 'This attendee or confirmed speaker is not eligible for a social card.' : 'Unable to issue the social-card delivery.' }, message.includes('ineligible') ? 409 : 500);
    }
  });

  app.get(managementPath, async (c) => {
    c.header('Cache-Control', 'no-store');
    const card = await managedCard(c);

    if (card === undefined) return unavailable(c);
    if (card === null) return c.json({ error: 'This social-card link is invalid or has been replaced.' }, 401);

    return c.json({ card: managementCardResponse(card) });
  });

  app.get(collectionPath, async (c) => {
    c.header('Cache-Control', 'no-store');
    const capability = c.req.header('x-social-card-collection-capability')?.trim();

    if (!capability || capability.length > 200) return c.json({ error: 'This collection link is invalid or has been replaced.' }, 401);
    const collection = await getSupabaseAnnualConferenceSocialCardCollection(capability, c);

    if (collection === undefined) return unavailable(c);
    if (!collection.length) return c.json({ error: 'This collection link is invalid or has been replaced.' }, 401);

    return c.json({ seats: collection.map((seat) => ({
      seat_number: seat.seat_number,
      card: {
        display_name: seat.display_name,
        role: 'attendee',
        crop: { x: Number(seat.crop_x), y: Number(seat.crop_y), scale: Number(seat.crop_scale) },
        public_enabled: seat.public_enabled,
        public_slug: seat.public_slug,
        photo_available: seat.photo_available,
      },
    })) });
  });

  app.get(`${collectionPath}/seats/:seatNumber`, async (c) => {
    c.header('Cache-Control', 'no-store');
    const card = await managedCollectionCard(c, Number(c.req.param('seatNumber')));

    if (card === undefined) return unavailable(c);
    if (!card) return c.json({ error: 'This ticket card is no longer available.' }, 404);

    return c.json({ card: managementCardResponse(card) });
  });

  app.patch(`${collectionPath}/seats/:seatNumber`, async (c) => {
    c.header('Cache-Control', 'no-store');
    const seatNumber = Number(c.req.param('seatNumber'));
    const card = await managedCollectionCard(c, seatNumber);

    if (card === undefined) return unavailable(c);
    if (!card) return c.json({ error: 'This ticket card is no longer available.' }, 404);
    const body = managementUpdateSchema.safeParse(await c.req.json().catch(() => null));

    if (!body.success || (body.data.crop && !validateDevcon26SocialCardCrop(body.data.crop))) return c.json({ error: 'Check the display name or crop settings.' }, 400);
    const name = body.data.display_name === undefined ? undefined : normalizeDevcon26SocialCardName(body.data.display_name);

    if (body.data.display_name !== undefined && !name) return c.json({ error: 'Check the display name.' }, 400);
    const updated = await updateSupabaseAnnualConferenceSocialCard(card.id, { displayName: name ?? undefined, crop: body.data.crop, publicEnabled: body.data.public_enabled }, c);

    if (!updated) return unavailable(c);

    return c.json({ card: managementCardResponse(updated) });
  });

  app.post(`${collectionPath}/seats/:seatNumber/photo`, async (c) => {
    c.header('Cache-Control', 'no-store');
    const seatNumber = Number(c.req.param('seatNumber'));
    const card = await managedCollectionCard(c, seatNumber);

    if (card === undefined) return unavailable(c);
    if (!card) return c.json({ error: 'This ticket card is no longer available.' }, 404);
    const body = await c.req.parseBody();
    const file = body.photo;

    if (!(file instanceof File)) return c.json({ error: 'Choose an image to upload.' }, 400);
    const fileError = validateDevcon26SocialCardImage(file);

    if (fileError) return c.json({ error: fileError }, 400);
    try {
      const photoPath = await uploadSupabaseAnnualConferenceSocialCardPhoto(card.id, file, c);
      const updated = await updateSupabaseAnnualConferenceSocialCard(card.id, { photoPath }, c);

      if (!updated) return unavailable(c);

      return c.json({ card: managementCardResponse(updated) });
    } catch {
      return c.json({ error: 'Unable to save the social-card photo.' }, 500);
    }
  });

  app.get(`${collectionPath}/seats/:seatNumber/photo`, async (c) => {
    c.header('Cache-Control', 'no-store');
    const card = await managedCollectionCard(c, Number(c.req.param('seatNumber')));

    if (card === undefined) return unavailable(c);
    if (!card) return c.json({ error: 'This ticket card is no longer available.' }, 404);
    if (!card.photo_path) return c.json({ error: 'Social-card image not found.' }, 404);
    const result = await getSupabaseAdminClient(c).storage.from(DEVCON26_SOCIAL_CARD_BUCKET).download(card.photo_path);

    if (result.error) return c.json({ error: 'Social-card image not found.' }, 404);

    c.header('Content-Type', result.data.type || 'application/octet-stream');

    return c.body(await result.data.arrayBuffer());
  });

  for (const action of ['publish', 'revoke'] as const) {
    app.patch(`${collectionPath}/seats/:seatNumber/${action}`, async (c) => {
      c.header('Cache-Control', 'no-store');
      const card = await managedCollectionCard(c, Number(c.req.param('seatNumber')));

      if (card === undefined) return unavailable(c);
      if (!card) return c.json({ error: 'This ticket card is no longer available.' }, 404);
      const updated = await updateSupabaseAnnualConferenceSocialCard(card.id, { publicEnabled: action === 'publish' }, c);

      if (!updated) return unavailable(c);

      return c.json({ card: managementCardResponse(updated) });
    });
  }

  app.patch(managementPath, async (c) => {
    c.header('Cache-Control', 'no-store');
    const card = await managedCard(c);

    if (card === undefined) return unavailable(c);
    if (card === null) return c.json({ error: 'This social-card link is invalid or has been replaced.' }, 401);
    const body = managementUpdateSchema.safeParse(await c.req.json().catch(() => null));

    if (!body.success || (body.data.crop && !validateDevcon26SocialCardCrop(body.data.crop))) return c.json({ error: 'Check the display name or crop settings.' }, 400);
    const name = body.data.display_name === undefined ? undefined : normalizeDevcon26SocialCardName(body.data.display_name);

    if (body.data.display_name !== undefined && !name) return c.json({ error: 'Check the display name.' }, 400);
    const updated = await updateSupabaseAnnualConferenceSocialCard(card.id, { displayName: name ?? undefined, crop: body.data.crop, publicEnabled: body.data.public_enabled }, c);

    if (!updated) return unavailable(c);

    return c.json({ card: managementCardResponse(updated) });
  });

  app.post(`${managementPath}/photo`, async (c) => {
    c.header('Cache-Control', 'no-store');
    const card = await managedCard(c);

    if (card === undefined) return unavailable(c);
    if (card === null) return c.json({ error: 'This social-card link is invalid or has been replaced.' }, 401);
    const body = await c.req.parseBody();
    const file = body.photo;

    if (!(file instanceof File)) return c.json({ error: 'Choose an image to upload.' }, 400);
    const fileError = validateDevcon26SocialCardImage(file);

    if (fileError) return c.json({ error: fileError }, 400);
    try {
      const photoPath = await uploadSupabaseAnnualConferenceSocialCardPhoto(card.id, file, c);
      const updated = await updateSupabaseAnnualConferenceSocialCard(card.id, { photoPath }, c);

      if (!updated) return unavailable(c);

      return c.json({ card: managementCardResponse(updated) });
    } catch {
      return c.json({ error: 'Unable to save the social-card photo.' }, 500);
    }
  });

  app.get(`${managementPath}/photo`, async (c) => {
    c.header('Cache-Control', 'no-store');
    const card = await managedCard(c);

    if (card === undefined) return unavailable(c);
    if (card === null) return c.json({ error: 'This social-card link is invalid or has been replaced.' }, 401);
    if (!card.photo_path) return c.json({ error: 'Social-card image not found.' }, 404);
    const result = await getSupabaseAdminClient(c).storage.from(DEVCON26_SOCIAL_CARD_BUCKET).download(card.photo_path);

    if (result.error) return c.json({ error: 'Social-card image not found.' }, 404);

    c.header('Content-Type', result.data.type || 'application/octet-stream');

    return c.body(await result.data.arrayBuffer());
  });

  app.patch(`${managementPath}/publish`, async (c) => {
    c.header('Cache-Control', 'no-store');
    const card = await managedCard(c);

    if (card === undefined) return unavailable(c);
    if (card === null) return c.json({ error: 'This social-card link is invalid or has been replaced.' }, 401);
    const updated = await updateSupabaseAnnualConferenceSocialCard(card.id, { publicEnabled: true }, c);

    if (!updated) return unavailable(c);

    return c.json({ card: managementCardResponse(updated) });
  });

  app.patch(`${managementPath}/revoke`, async (c) => {
    c.header('Cache-Control', 'no-store');
    const card = await managedCard(c);

    if (card === undefined) return unavailable(c);
    if (card === null) return c.json({ error: 'This social-card link is invalid or has been replaced.' }, 401);
    const updated = await updateSupabaseAnnualConferenceSocialCard(card.id, { publicEnabled: false }, c);

    if (!updated) return unavailable(c);

    return c.json({ card: managementCardResponse(updated) });
  });

  app.get(`${publicPath}/:slug`, async (c) => {
    const slug = c.req.param('slug');

    if (!/^[A-Za-z0-9_-]{22,80}$/.test(slug)) {
      c.header('Cache-Control', 'no-store');

      return c.json({ error: 'Social card not found.' }, 404);
    }
    const card = await getSupabasePublicAnnualConferenceSocialCard(slug, c);

    if (card === undefined) return unavailable(c);
    if (card === null) {
      c.header('Cache-Control', 'no-store');

      return c.json({ error: 'Social card not found.' }, 404);
    }
    if (!card) {
      c.header('Cache-Control', 'no-store');

      return c.json({ error: 'Social card not found.' }, 404);
    }
    c.header('Cache-Control', 'public, max-age=300');

    return c.json({ card: publicCardResponse(card) });
  });

  app.get(`${publicPath}/:slug/image`, async (c) => {
    const slug = c.req.param('slug');

    if (!/^[A-Za-z0-9_-]{22,80}$/.test(slug)) {
      c.header('Cache-Control', 'no-store');

      return c.json({ error: 'Social card not found.' }, 404);
    }
    const card = await getSupabasePublicAnnualConferenceSocialCard(slug, c);

    if (card === undefined) return unavailable(c);
    if (!card?.photo_path) {
      c.header('Cache-Control', 'no-store');

      return c.json({ error: 'Social-card image not found.' }, 404);
    }
    const result = await getSupabaseAdminClient(c).storage.from(DEVCON26_SOCIAL_CARD_BUCKET).download(card.photo_path);

    if (result.error) return c.json({ error: 'Social-card image not found.' }, 404);

    c.header('Cache-Control', 'public, max-age=300');
    c.header('Content-Type', result.data.type || 'application/octet-stream');

    return c.body(await result.data.arrayBuffer());
  });

  app.post('/api/internal/annual-conference-social-card-emails/retry', async (c) => {
    if (!scheduledJobAuthorized(c)) return c.json({ error: 'Not found' }, 404);

    try {
      return c.json(await retryAnnualConferenceSocialCardEmails(c));
    } catch {
      return c.json({ error: 'Unable to retry social-card emails.' }, 500);
    }
  });
}
