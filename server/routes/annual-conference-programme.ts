import type { Context, Hono } from 'hono';
import { requireAdmin, getAdminSession } from '@/lib/supabase/admin-auth';
import { programmeSaveSchema } from '@/lib/annual-conference-programme';
import { createAnnualConferenceRepository } from '@/server/annual-conference-repository';
import { createAnnualConferenceProgrammeRepository } from '@/server/annual-conference-programme-repository';
import { createAnnualConferenceProgrammeService, ProgrammeError } from '@/server/annual-conference-programme-service';
import { recordProtectedMutationAudit } from '@/server/protected-mutation';
import { internalErrorResponse } from '@/server/http/internal-error-response';
import type { AppBindings } from '@/server/http/app-bindings';

async function service(c: Context<AppBindings>) {
  const session = c.get('adminSession') ?? await getAdminSession(c);

  if (!session.authenticated || !session.email) throw new ProgrammeError(403, 'Conference access required.');

  return createAnnualConferenceProgrammeService({
    role: session.role,
    email: session.email,
    edition: async (year) => (await createAnnualConferenceRepository(c).getWorkspace(year))?.edition,
    repository: createAnnualConferenceProgrammeRepository(c),
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
}
