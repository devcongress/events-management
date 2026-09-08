import type { Context, Hono } from 'hono';
import { z } from 'zod';
import type { AppBindings } from '@/server/http/app-bindings';
import { requireAdmin, getAdminSession } from '@/lib/supabase/admin-auth';
import { getAnnualConferenceAccessGrants } from '@/lib/supabase/annual-conference-access-grants';
import { createAnnualConferenceRepository } from '@/server/annual-conference-repository';
import { createAnnualConferenceTaskResourceRepository } from '@/server/annual-conference-task-resource-repository';
import {
  AnnualConferenceTaskResourceServiceError,
  annualConferenceTaskResourceErrorStatus,
  createAnnualConferenceTaskResourceService,
} from '@/server/annual-conference-task-resource-service';
import { recordProtectedMutationAudit } from '@/server/protected-mutation';
import { internalErrorResponse } from '@/server/http/internal-error-response';

const yearSchema = z.string().regex(/^\d{4}$/, 'Conference year must use four digits.');
const idSchema = z.string().uuid();
const labelSchema = z.string().trim().max(120, 'Resource label must be 120 characters or fewer.').nullable();
const createResourceSchema = z.object({
  url: z.string().trim().min(1, 'Resource link is required.').max(2048),
  label: labelSchema.optional(),
}).strict();
const updateResourceSchema = z.object({
  url: z.string().trim().min(1, 'Resource link is required.').max(2048).optional(),
  label: labelSchema.optional(),
}).strict().refine((input) => Object.keys(input).length > 0, 'Provide a resource link or label to update.');

async function serviceForRequest(c: Context<AppBindings>) {
  const session = c.get('adminSession') ?? await getAdminSession(c);
  if (!session.authenticated) {
    throw new AnnualConferenceTaskResourceServiceError('forbidden', 'Conference access required.');
  }
  return createAnnualConferenceTaskResourceService({
    workPlanRepository: createAnnualConferenceRepository(c),
    resourceRepository: createAnnualConferenceTaskResourceRepository(c),
    actor: { email: session.email, role: session.role },
    accessGrants: (editionId) => getAnnualConferenceAccessGrants(editionId, session.membership_id, c),
    audit: (event) => recordProtectedMutationAudit(c, event),
  });
}

function errorResponse(c: Context<AppBindings>, error: unknown) {
  if (error instanceof AnnualConferenceTaskResourceServiceError) {
    return c.json({ error: error.message }, annualConferenceTaskResourceErrorStatus(error));
  }
  return internalErrorResponse(
    c,
    'annual_conference_task_resources_failed',
    error,
    'Unable to manage task resource links.',
  );
}

function routeParams(c: Context<AppBindings>) {
  const year = yearSchema.safeParse(c.req.param('year'));
  if (!year.success) return { error: c.json({ error: year.error.issues[0]?.message }, 400) } as const;
  const taskId = idSchema.safeParse(c.req.param('taskId'));
  if (!taskId.success) return { error: c.json({ error: 'Annual conference task was not found.' }, 404) } as const;
  return { year: Number(year.data), taskId: taskId.data } as const;
}

export function registerAnnualConferenceTaskResourceRoutes(app: Hono<AppBindings>): void {
  app.get('/api/annual-conference/:year/work-plan/:taskId/resources', async (c) => {
    const adminError = await requireAdmin(c, ['owner', 'organizer', 'volunteer']);
    if (adminError) return adminError;
    const params = routeParams(c);
    if ('error' in params) return params.error;
    try {
      return c.json(await (await serviceForRequest(c)).list(params.year, params.taskId));
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  app.post('/api/annual-conference/:year/work-plan/:taskId/resources', async (c) => {
    const adminError = await requireAdmin(c, ['owner', 'organizer', 'volunteer']);
    if (adminError) return adminError;
    const params = routeParams(c);
    if ('error' in params) return params.error;
    const parsed = createResourceSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the resource link.' }, 400);
    try {
      return c.json(await (await serviceForRequest(c)).create(params.year, params.taskId, parsed.data), 201);
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  app.patch('/api/annual-conference/:year/work-plan/:taskId/resources/:resourceId', async (c) => {
    const adminError = await requireAdmin(c, ['owner', 'organizer', 'volunteer']);
    if (adminError) return adminError;
    const params = routeParams(c);
    if ('error' in params) return params.error;
    const resourceId = idSchema.safeParse(c.req.param('resourceId'));
    if (!resourceId.success) return c.json({ error: 'Task resource link was not found.' }, 404);
    const parsed = updateResourceSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the resource changes.' }, 400);
    try {
      return c.json(await (await serviceForRequest(c)).update(
        params.year,
        params.taskId,
        resourceId.data,
        parsed.data,
      ));
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  app.delete('/api/annual-conference/:year/work-plan/:taskId/resources/:resourceId', async (c) => {
    const adminError = await requireAdmin(c, ['owner', 'organizer', 'volunteer']);
    if (adminError) return adminError;
    const params = routeParams(c);
    if ('error' in params) return params.error;
    const resourceId = idSchema.safeParse(c.req.param('resourceId'));
    if (!resourceId.success) return c.json({ error: 'Task resource link was not found.' }, 404);
    try {
      return c.json(await (await serviceForRequest(c)).delete(params.year, params.taskId, resourceId.data));
    } catch (error) {
      return errorResponse(c, error);
    }
  });
}
