import type { Context, Hono } from 'hono';
import { requireAdmin, getAdminSession } from '@/lib/supabase/admin-auth';
import { programmeSaveSchema } from '@/lib/annual-conference-programme';
import { createAnnualConferenceRepository } from '@/server/annual-conference-repository';
import { createAnnualConferenceProgrammeRepository } from '@/server/annual-conference-programme-repository';
import { createAnnualConferenceProgrammeService, ProgrammeError } from '@/server/annual-conference-programme-service';
import { recordProtectedMutationAudit } from '@/server/protected-mutation';
import { internalErrorResponse } from '@/server/http/internal-error-response';
import { ProgrammePhotoConflict, acceptedProgrammeProposals, programmePhotoPaths, programmePhotoUrl, programmeSpeakerId, publicProgrammeEditionId, publicProgrammeRows, publicProgrammeSpeakers, readProgrammePhoto, referencedProposalIds, saveProgrammePhoto } from '@/server/annual-conference-programme-speakers';
import { validateMeetupMediaContent, validateMeetupMediaFile } from '@/lib/supabase/media';
import { publicAppOrigin } from '@/server/http/public-app-origin';
import { envValue } from '@/server/env';
import { requireAnnualConferenceCapability } from '@/server/annual-conference-request';
import type { AppBindings } from '@/server/http/app-bindings';

function programmeOrigin(c: Context<AppBindings>): string {
  if (envValue('NODE_ENV', c) !== 'production') return publicAppOrigin(c);
  const configured = envValue('PUBLIC_APP_URL', c);

  if (!configured) throw new Error('PUBLIC_APP_URL is required for the public programme.');
  const url = new URL(configured);

  if (url.protocol !== 'https:' || url.origin !== configured || url.username || url.password) throw new Error('PUBLIC_APP_URL must be an HTTPS origin.');

  return url.origin;
}

async function service(c: Context<AppBindings>) {
  const session = c.get('adminSession') ?? await getAdminSession(c);

  if (!session.authenticated || !session.email) throw new ProgrammeError(403, 'Conference access required.');

  return createAnnualConferenceProgrammeService({
    role: session.role,
    email: session.email,
    edition: async (year) => (await createAnnualConferenceRepository(c).getWorkspace(year))?.edition,
    repository: createAnnualConferenceProgrammeRepository(c),
    canManageSpeakers: async (year) => !await requireAnnualConferenceCapability(c, year, 'speakers.manage'),
    acceptedProposalIds: async (id) => new Set((await acceptedProgrammeProposals(id, c)).map((proposal) => proposal.id)),
    audit: (id, revision) => recordProtectedMutationAudit(c, { action: 'annual_conference_programme_updated', targetType: 'annual_conference_edition', targetId: id, metadata: { revision } }),
  });
}

export function registerAnnualConferenceProgrammeRoutes(app: Hono<AppBindings>) {
  const path = '/api/annual-conference/:year/programme';

  async function handle(c: Context<AppBindings>, save: boolean) {
    const denied = await requireAdmin(c, ['owner', 'organizer']);

    if (denied) return denied;
    const year = c.req.param('year') ?? '';

    if (!/^\d{4}$/.test(year)) return c.json({ error: 'Conference year must use four digits.' }, 400);
    const input = save ? programmeSaveSchema.safeParse(await c.req.json().catch(() => null)) : null;

    if (input && !input.success) return c.json({ error: input.error.issues[0]?.message ?? 'Invalid programme.' }, 400);
    try {
      const instance = await service(c);

      return c.json(input?.success ? await instance.save(Number(year), input.data) : await instance.get(Number(year)));
    } catch (error) {
      if (error instanceof ProgrammeError) return c.json({ error: error.message }, error.status);

      return internalErrorResponse(c, 'annual_conference_programme_failed', error, 'Unable to manage the programme.');
    }
  }

  app.get(path, (c) => handle(c, false));
  app.put(path, (c) => handle(c, true));

  app.get(`${path}/speakers`, async (c) => {
    const denied = await requireAdmin(c, ['owner', 'organizer']);

    if (denied) return denied;
    try {
      const year = c.req.param('year');
      const edition = /^\d{4}$/.test(year) ? (await createAnnualConferenceRepository(c).getWorkspace(Number(year)))?.edition : null;

      if (!edition) return c.json({ error: 'Conference edition not found.' }, 404);
      const deniedCapability = await requireAnnualConferenceCapability(c, Number(year), 'speakers.view');

      if (deniedCapability) return deniedCapability;
      const canManagePhotos = !await requireAnnualConferenceCapability(c, Number(year), 'speakers.manage');
      const proposals = await acceptedProgrammeProposals(edition.id, c);
      const photos = await programmePhotoPaths(proposals.flatMap((item) => item.speaker_profile_id ? [item.speaker_profile_id] : []), c);
      const origin = programmeOrigin(c);

      return c.json({ canManagePhotos, proposals: proposals.map((item) => ({ id: item.id, speakerId: programmeSpeakerId(item), name: item.speaker_name, title: item.title, description: item.abstract ?? '', photoUrl: Boolean(item.speaker_profile_id && photos.has(item.speaker_profile_id)) ? `${origin}/api/annual-conference/${year}/programme/speakers/${item.speaker_profile_id!}/photo` : null })) });
    } catch (error) {
      return internalErrorResponse(c, 'annual_conference_programme_speakers_failed', error, 'Unable to load speakers.');
    }
  });

  const photoPath = `${path}/speakers/:speakerId/photo`;

  async function managePhoto(c: Context<AppBindings>, remove: boolean) {
    const denied = await requireAdmin(c, ['owner', 'organizer']);

    if (denied) return denied;
    try {
      const year = c.req.param('year') ?? '';
      const id = c.req.param('speakerId') ?? '';
      const edition = /^\d{4}$/.test(year) ? (await createAnnualConferenceRepository(c).getWorkspace(Number(year)))?.edition : null;

      if (!edition) return c.json({ error: 'Speaker not found.' }, 404);
      const deniedCapability = await requireAnnualConferenceCapability(c, Number(year), 'speakers.manage');

      if (deniedCapability) return deniedCapability;
      if (!(await acceptedProgrammeProposals(edition.id, c)).some((item) => item.speaker_profile_id === id)) return c.json({ error: 'Speaker not found.' }, 404);
      let file: File | null = null;

      if (!remove) {
        const form = await c.req.formData().catch(() => null);
        const candidate = form?.get('file');

        if (!(candidate instanceof File)) return c.json({ error: 'Choose an image file.' }, 400);
        const problem = validateMeetupMediaFile(candidate) ?? await validateMeetupMediaContent(candidate);

        if (problem) return c.json({ error: problem }, 400);
        file = candidate;
      }
      await saveProgrammePhoto(id, file, c);

      return c.json({ photoUrl: file ? `${programmeOrigin(c)}/api/annual-conference/${year}/programme/speakers/${id}/photo` : null });
    } catch (error) {
      if (error instanceof ProgrammePhotoConflict) return c.json({ error: error.message }, 409);

      return internalErrorResponse(c, 'annual_conference_programme_photo_failed', error, 'Unable to update speaker photo.');
    }
  }

  app.get(photoPath, async (c) => {
    const denied = await requireAdmin(c, ['owner', 'organizer']);

    if (denied) return denied;
    try {
      const year = c.req.param('year') ?? '';
      const id = c.req.param('speakerId') ?? '';
      const edition = /^\d{4}$/.test(year) ? (await createAnnualConferenceRepository(c).getWorkspace(Number(year)))?.edition : null;

      if (!edition) return c.json({ error: 'Speaker not found.' }, 404);
      const deniedCapability = await requireAnnualConferenceCapability(c, Number(year), 'speakers.view');

      if (deniedCapability) return deniedCapability;
      if (!(await acceptedProgrammeProposals(edition.id, c)).some((item) => item.speaker_profile_id === id)) return c.json({ error: 'Speaker not found.' }, 404);
      const path = (await programmePhotoPaths([id], c)).get(id);
      const photo = path ? await readProgrammePhoto(id, path, c) : null;

      if (!photo) return c.json({ error: 'Photo not found.' }, 404);
      c.header('Cache-Control', 'no-store');
      c.header('X-Content-Type-Options', 'nosniff');

      return c.body(await photo.arrayBuffer(), 200, { 'Content-Type': photo.type });
    } catch (error) {
      return internalErrorResponse(c, 'annual_conference_programme_photo_failed', error, 'Unable to load speaker photo.');
    }
  });

  app.put(photoPath, (c) => managePhoto(c, false));
  app.delete(photoPath, (c) => managePhoto(c, true));

  const publicPath = '/api/public/annual-conference/2026/programme';

  async function publicRows(c: Context<AppBindings>) {
    const editionId = await publicProgrammeEditionId(2026, c);

    if (!editionId) return null;
    const rows = await publicProgrammeRows(editionId, c);

    return { editionId, rows, ids: [...referencedProposalIds(rows)] };
  }

  app.get(publicPath, async (c) => {
    try {
      const data = await publicRows(c);

      if (!data) return c.json({ error: 'Conference edition not found.' }, 404);
      const visible = await publicProgrammeSpeakers(data.editionId, data.ids, c);
      const photos = await programmePhotoPaths(visible.flatMap((item) => item.speaker_profile_id ? [item.speaker_profile_id] : []), c);
      const byId = new Map(visible.map((item) => [item.id, item]));
      const origin = programmeOrigin(c);
      const rows = data.rows.map((row) => {
        const seen = new Set<string>();
        const speakers = (row.speakerProposalIds ?? []).flatMap((id) => {
          const item = byId.get(id);
          const speakerId = item ? programmeSpeakerId(item) : undefined;

          if (!item || !speakerId || seen.has(speakerId)) return [];
          seen.add(speakerId);

          return [{ id: speakerId, name: item.speaker_name, photoUrl: item.speaker_profile_id && photos.has(speakerId) ? programmePhotoUrl(origin, speakerId) : null }];
        });

        return { id: row.id, time: row.time, title: row.title, description: row.description, type: row.type, speakers };
      });

      return c.json({ year: 2026, rows });
    } catch (error) {
      return internalErrorResponse(c, 'public_annual_conference_programme_failed', error, 'Unable to load programme.');
    }
  });

  app.get(`${publicPath}/speakers/:speakerId/photo`, async (c) => {
    try {
      const data = await publicRows(c);
      const id = c.req.param('speakerId');

      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return c.json({ error: 'Photo not found.' }, 404);
      const visible = data ? await publicProgrammeSpeakers(data.editionId, data.ids, c, id) : [];
      const path = visible.length ? (await programmePhotoPaths([id], c)).get(id) : undefined;
      const photo = path ? await readProgrammePhoto(id, path, c) : null;

      if (!photo) return c.json({ error: 'Photo not found.' }, 404);
      c.header('Cache-Control', 'no-store');
      c.header('X-Content-Type-Options', 'nosniff');

      return c.body(await photo.arrayBuffer(), 200, { 'Content-Type': photo.type });
    } catch (error) {
      return internalErrorResponse(c, 'public_annual_conference_programme_photo_failed', error, 'Unable to load photo.');
    }
  });

}
