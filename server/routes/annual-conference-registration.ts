import type { Hono, Context } from 'hono';
import crypto from 'node:crypto';
import { z } from 'zod';
import { CONFERENCE_REGISTRATION_ACTION, CONFERENCE_REGISTRATION_PATH, CONFERENCE_REGISTRATION_TURNSTILE_HOSTNAMES, conferenceRegistrationAccepted, conferenceRegistrationOverviewSchema, conferenceRegistrationSchema } from '@/lib/annual-conference-registration';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { getAdminSession, requireAdmin } from '@/lib/supabase/admin-auth';
import { requireAnnualConferenceCapability } from '@/server/annual-conference-request';
import { assessPublicSubmissionEmail, enforcePublicRateLimit, publicClientKey, publicEmailErrorPayload, requirePublicTurnstile } from '@/server/http/public-intake-protection';
import type { AppBindings } from '@/server/http/app-bindings';
import { recordProtectedMutationAudit } from '@/server/protected-mutation';
import { secureSharedSecret } from '@/lib/security/shared-secret';
import { envValue } from '@/server/env';
import { retryAnnualConferenceAdmissionEmails } from '@/server/annual-conference-admission-email-delivery';
import { retryAnnualConferenceAttendeeUpdates } from '@/server/annual-conference-attendee-updates';
import { localRegistrationRequest, registrationTesting, registrationTestingSchema } from '@/server/annual-conference-registration-testing';
import { retryAnnualConferenceSocialCardEmails } from '@/server/annual-conference-social-card-email-delivery';

export async function conferenceRegistrationOverview(c: Context, year: number) {
  const result = await getSupabaseAdminClient(c).rpc('get_annual_conference_registration_overview' as never, { p_year: year } as never);

  if (result.error) throw new Error('Registration settings unavailable.');
  const parsed = conferenceRegistrationOverviewSchema.safeParse(result.data);

  return parsed.success ? parsed.data : null;
}

export function registerAnnualConferenceRegistrationRoutes(app: Hono<AppBindings>) {
  app.post('/api/internal/annual-conference-admission-emails/retry', async (c) => {
    const expected = secureSharedSecret(envValue('SLACK_EVENTS_RETRY_SECRET', c));
    const received = c.req.header('x-scheduled-job-secret')?.trim();

    if (!expected || !received || Buffer.byteLength(expected) !== Buffer.byteLength(received)
      || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))) return c.json({ error: 'Not found.' }, 404);

    try {
      const admissions = await retryAnnualConferenceAdmissionEmails(c);
      const updates = await retryAnnualConferenceAttendeeUpdates(c);

      return c.json({ admissions, updates });
    } catch {
      return c.json({ error: 'Admission email retry could not complete.' }, 503);
    }
  });

  app.get(CONFERENCE_REGISTRATION_PATH, async (c) => {
    c.header('Cache-Control', 'no-store');

    try {
      const overview = await conferenceRegistrationOverview(c, 2026);

      if (!overview || overview.status !== 'open') return c.json({ mode: 'closed' });
      if (localRegistrationRequest(c)) {
        const testing = await registrationTesting(c, overview.edition_id);

        if (!testing.enabled) return c.json({ mode: 'closed' });
      }

      return c.json({ mode: overview.mode, waitlist: overview.reserved >= overview.capacity });
    } catch {
      return c.json({ error: 'Registration is temporarily unavailable.' }, 503);
    }
  });

  app.post(CONFERENCE_REGISTRATION_PATH, async (c) => {
    c.header('Cache-Control', 'no-store');
    const parsed = conferenceRegistrationSchema.safeParse(await c.req.json().catch(() => null));

    if (!parsed.success) return c.json({ error: 'Enter your name and a valid email address.' }, 400);
    const limit = await enforcePublicRateLimit(c, {
      action: CONFERENCE_REGISTRATION_ACTION, clientKey: publicClientKey(c), maxAttempts: 10, windowSeconds: 3600,
    }, 'Please wait before trying again.');

    if (limit) return limit;
    const local = localRegistrationRequest(c);
    const challenge = local ? null : await requirePublicTurnstile(c, {
      token: parsed.data.turnstile_token,
      submittedAction: parsed.data.turnstile_action,
      expectedAction: CONFERENCE_REGISTRATION_ACTION,
      expectedHostname: CONFERENCE_REGISTRATION_TURNSTILE_HOSTNAMES,
    });

    if (challenge) return challenge;
    const assessment = await assessPublicSubmissionEmail(c, parsed.data.email);

    if (assessment.status === 'invalid') return c.json(publicEmailErrorPayload(assessment), 422);
    const emailLimit = await enforcePublicRateLimit(c, {
      action: `${CONFERENCE_REGISTRATION_ACTION}:email`, clientKey: parsed.data.email.toLowerCase(), maxAttempts: 5, windowSeconds: 3600,
    }, 'Please wait before trying again.');

    if (emailLimit) return emailLimit;

    try {
      const overview = await conferenceRegistrationOverview(c, 2026);

      if (!overview || overview.mode !== 'free' || overview.status !== 'open') return c.json({ error: 'Free registration is not open.' }, 409);
      const testing = await registrationTesting(c, overview.edition_id);

      if ((local && !testing.enabled) || (testing.enabled && !testing.tester_emails.includes(parsed.data.email.toLowerCase()))) {
        return c.json({ error: 'Registration is not available for these details. Please contact the event team.' }, 403);
      }
      const result = await getSupabaseAdminClient(c).rpc((local ? 'register_for_annual_conference_test' : 'register_for_annual_conference') as never, {
        p_edition_id: overview.edition_id, p_name: parsed.data.name, p_email: parsed.data.email,
      } as never);

      if (result.error) throw new Error('Registration was not saved.');

      return c.json(conferenceRegistrationAccepted, 202);
    } catch {
      return c.json({ error: 'Unable to complete registration. Please try again.' }, 503);
    }
  });

  const privatePath = '/api/annual-conference/:year/registrations';

  app.use(`${privatePath}*`, async (c, next) => {
    const authError = await requireAdmin(c, ['owner', 'organizer']);

    if (authError) return authError;
    const year = z.coerce.number().int().min(2000).max(2200).safeParse(c.req.param('year'));

    if (!year.success) return c.json({ error: 'Invalid conference year.' }, 400);
    const accessError = await requireAnnualConferenceCapability(c, year.data, 'ticketing.manage');

    if (accessError) return accessError;
    await next();
  });

  app.get(privatePath, async (c) => {
    const page = z.coerce.number().int().min(0).max(5000).safeParse(c.req.query('offset') ?? 0);

    if (!page.success) return c.json({ error: 'Invalid page.' }, 400);
    const overview = await conferenceRegistrationOverview(c, Number(c.req.param('year')));

    if (!overview) return c.json({ error: 'Conference not found.' }, 404);
    const result = await getSupabaseAdminClient(c).rpc('list_annual_conference_registrations' as never, {
      p_edition_id: overview.edition_id, p_offset: page.data,
    } as never);

    if (result.error) return c.json({ error: 'Unable to load registrations.' }, 503);

    return c.json({ overview, registrations: result.data });
  });

  app.get(`${privatePath}/testing`, async (c) => {
    const denied = await requireAdmin(c, ['owner']);

    if (denied) return denied;
    const overview = await conferenceRegistrationOverview(c, Number(c.req.param('year')));

    if (!overview) return c.json({ error: 'Conference not found.' }, 404);

    try {
      const localPage = c.req.header('Origin') || c.req.header('Referer');
      const localDelivery = envValue('NODE_ENV', c) === 'development'
        && /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/.test(c.req.url)
        && Boolean(localPage && /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/.test(localPage));

      return c.json({ ...await registrationTesting(c, overview.edition_id), local_delivery: localDelivery });
    } catch {
      return c.json({ error: 'Testing settings are unavailable. Check the registration testing migration.' }, 503);
    }
  });

  app.patch(`${privatePath}/testing`, async (c) => {
    const denied = await requireAdmin(c, ['owner']);

    if (denied) return denied;
    const input = registrationTestingSchema.safeParse(await c.req.json().catch(() => null));

    if (!input.success) return c.json({ error: 'Use up to 200 valid tester email addresses.' }, 400);
    const overview = await conferenceRegistrationOverview(c, Number(c.req.param('year')));
    const session = await getAdminSession(c);

    if (!overview || !session.authenticated) return c.json({ error: 'Conference not found.' }, 404);
    const result = await getSupabaseAdminClient(c).rpc('configure_annual_conference_registration_testing' as never, {
      p_edition_id: overview.edition_id, p_enabled: input.data.enabled,
      p_emails: input.data.tester_emails, p_actor: session.email,
    } as never);

    if (result.error) return c.json({ error: 'Testing settings could not be saved.' }, 503);
    await recordProtectedMutationAudit(c, {
      action: 'annual_conference.registration.testing', targetType: 'annual_conference_edition', targetId: overview.edition_id,
      metadata: { enabled: input.data.enabled, tester_count: input.data.tester_emails.length },
    });

    return c.json({ ok: true });
  });

  app.post(`${privatePath}/testing/deliver`, async (c) => {
    const denied = await requireAdmin(c, ['owner']);

    if (denied) return denied;
    if (!localRegistrationRequest(c)) return c.json({ error: 'Not found.' }, 404);
    const overview = await conferenceRegistrationOverview(c, Number(c.req.param('year')));

    if (!overview || !(await registrationTesting(c, overview.edition_id)).enabled) return c.json({ error: 'Enable testing before processing local email.' }, 409);
    await recordProtectedMutationAudit(c, {
      action: 'annual_conference.registration.testing.deliver', targetType: 'annual_conference_edition', targetId: overview.edition_id,
    });
    const admissions = await retryAnnualConferenceAdmissionEmails(c);
    const social = await retryAnnualConferenceSocialCardEmails(c);
    const updates = await retryAnnualConferenceAttendeeUpdates(c);

    return c.json({ admissions, social, updates });
  });

  app.patch(`${privatePath}/settings`, async (c) => {
    const ownerError = await requireAdmin(c, ['owner']);

    if (ownerError) return ownerError;
    const parsed = z.object({ mode: z.enum(['free', 'paid']), status: z.enum(['draft', 'open', 'closed']) }).strict().safeParse(await c.req.json().catch(() => null));

    if (!parsed.success) return c.json({ error: 'Choose a mode and registration status.' }, 400);
    const overview = await conferenceRegistrationOverview(c, Number(c.req.param('year')));
    const session = await getAdminSession(c);

    if (!overview || !session.authenticated) return c.json({ error: 'Conference not found.' }, 404);
    const result = await getSupabaseAdminClient(c).rpc('configure_annual_conference_registration' as never, {
      p_edition_id: overview.edition_id, p_mode: parsed.data.mode, p_status: parsed.data.status, p_actor_email: session.email,
    } as never);

    if (result.error) return c.json({ error: 'Unable to change mode. Resolve the waitlist and active checkout holds before switching to paid.' }, 409);
    await recordProtectedMutationAudit(c, {
      action: 'annual_conference.registration.configure', targetType: 'annual_conference_edition', targetId: overview.edition_id,
      metadata: parsed.data,
    });

    return c.json({ ok: true });
  });

  app.post(`${privatePath}/:id/cancel`, async (c) => {
    const id = z.string().uuid().safeParse(c.req.param('id'));

    if (!id.success) return c.json({ error: 'Invalid registration.' }, 400);
    const overview = await conferenceRegistrationOverview(c, Number(c.req.param('year')));

    if (!overview) return c.json({ error: 'Conference not found.' }, 404);
    const result = await getSupabaseAdminClient(c).rpc('cancel_annual_conference_registration' as never, {
      p_edition_id: overview.edition_id, p_registration_id: id.data,
    } as never);

    if (result.error) return c.json({ error: 'Unable to cancel this registration.' }, 409);
    await recordProtectedMutationAudit(c, {
      action: 'annual_conference.registration.cancel', targetType: 'annual_conference_registration', targetId: id.data,
      metadata: { edition_id: overview.edition_id },
    });

    return c.json({ ok: true });
  });

  app.get(`${privatePath}/blasts`, async (c) => {
    const overview = await conferenceRegistrationOverview(c, Number(c.req.param('year')));

    if (!overview) return c.json({ error: 'Conference not found.' }, 404);
    const result = await getSupabaseAdminClient(c).rpc('list_annual_conference_attendee_blasts' as never, { p_edition_id: overview.edition_id } as never);

    if (result.error) return c.json({ error: 'Unable to load attendee updates.' }, 503);

    return c.json({ blasts: result.data });
  });

  app.post(`${privatePath}/blasts`, async (c) => {
    const input = z.object({ subject: z.string().trim().min(1).max(160), body: z.string().trim().min(1).max(12000) }).strict().safeParse(await c.req.json().catch(() => null));

    if (!input.success) return c.json({ error: 'Add a subject and message.' }, 400);
    const overview = await conferenceRegistrationOverview(c, Number(c.req.param('year')));
    const session = await getAdminSession(c);

    if (!overview || !session.authenticated) return c.json({ error: 'Conference not found.' }, 404);
    const result = await getSupabaseAdminClient(c).rpc('create_annual_conference_attendee_blast' as never, {
      p_edition_id: overview.edition_id, p_subject: input.data.subject, p_body: input.data.body, p_actor: session.email,
    } as never);

    if (result.error) return c.json({ error: 'Unable to prepare attendee update.' }, 503);
    await recordProtectedMutationAudit(c, { action: 'annual_conference.attendee_update.draft', targetType: 'annual_conference_edition', targetId: overview.edition_id });

    return c.json({ id: result.data }, 201);
  });

  app.post(`${privatePath}/blasts/:id/send`, async (c) => {
    const id = z.string().uuid().safeParse(c.req.param('id'));
    const input = z.object({ confirmed: z.literal(true) }).strict().safeParse(await c.req.json().catch(() => null));

    if (!id.success || !input.success) return c.json({ error: 'Confirm the reviewed update.' }, 400);
    const overview = await conferenceRegistrationOverview(c, Number(c.req.param('year')));

    if (!overview) return c.json({ error: 'Conference not found.' }, 404);
    const result = await getSupabaseAdminClient(c).rpc('queue_annual_conference_attendee_blast' as never, { p_edition_id: overview.edition_id, p_blast_id: id.data } as never);

    if (result.error) return c.json({ error: 'This update could not be queued.' }, 409);
    await recordProtectedMutationAudit(c, { action: 'annual_conference.attendee_update.queue', targetType: 'annual_conference_attendee_blast', targetId: id.data });

    return c.json({ queued: true });
  });
}
