import type { Context } from 'hono';
import {
  effectiveAnnualConferenceCapabilities,
  hasAnnualConferenceCapability,
  type AnnualConferenceCapability,
} from '@/lib/annual-conference-capabilities';
import {
  getAnnualConferenceAccessGrants,
} from '@/lib/supabase/annual-conference-access-grants';
import { getAdminSession } from '@/lib/supabase/admin-auth';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { createAnnualConferenceFinanceRepository } from '@/server/annual-conference-finance-repository';
import {
  AnnualConferenceFinanceServiceError,
  createAnnualConferenceFinanceService,
} from '@/server/annual-conference-finance-service';
import { createAnnualConferenceRepository } from '@/server/annual-conference-repository';
import {
  AnnualConferenceServiceError,
  annualConferenceErrorStatus,
  createAnnualConferenceService,
} from '@/server/annual-conference-service';
import { recordProtectedMutationAudit } from '@/server/protected-mutation';

async function getActiveOrganizerEmails(c: Context): Promise<string[] | null> {
  try {
    const { data, error } = await getSupabaseAdminClient(c)
      .from('admin_memberships')
      .select('email')
      .eq('status', 'active');

    if (error) return null;
    return (data ?? []).map((membership) => membership.email);
  } catch {
    return null;
  }
}

async function getActivePlanningOwnerEmails(c: Context): Promise<string[] | null> {
  try {
    const { data, error } = await getSupabaseAdminClient(c)
      .from('admin_memberships')
      .select('email')
      .eq('status', 'active')
      .neq('role', 'volunteer');
    if (error) return null;
    return (data ?? []).map((membership) => membership.email);
  } catch {
    return null;
  }
}

export async function getAnnualConferenceEditionByYear(year: number, c?: Context) {
  const repository = createAnnualConferenceRepository(c);
  const editions = await repository.listEditions();
  return editions.find((edition) => edition.year === year);
}

export async function annualConferenceServiceForRequest(c: Context) {
  const session = c.get('adminSession') ?? await getAdminSession(c);
  if (!session.authenticated) {
    throw new AnnualConferenceServiceError('forbidden', 'Conference access required.');
  }

  return createAnnualConferenceService({
    repository: createAnnualConferenceRepository(c),
    actor: { email: session.email, role: session.role },
    accessGrants: (editionId) => getAnnualConferenceAccessGrants(editionId, session.membership_id, c),
    activeOrganizerEmails: () => getActiveOrganizerEmails(c),
    activePlanningOwnerEmails: () => getActivePlanningOwnerEmails(c),
    audit: (event) => recordProtectedMutationAudit(c, event),
  });
}

export async function annualConferenceFinanceServiceForRequest(c: Context) {
  const session = c.get('adminSession') ?? await getAdminSession(c);
  if (!session.authenticated) {
    throw new AnnualConferenceFinanceServiceError('forbidden', 'Conference finance access required.');
  }

  return createAnnualConferenceFinanceService({
    repository: createAnnualConferenceFinanceRepository(c),
    actor: { email: session.email, role: session.role },
    audit: (event) => recordProtectedMutationAudit(c, event),
  });
}

async function annualConferenceCapabilitiesForRequest(c: Context, year: number): Promise<{
  capabilities: AnnualConferenceCapability[];
  editionId: string;
} | undefined> {
  const session = c.get('adminSession') ?? await getAdminSession(c);
  if (!session.authenticated) return undefined;
  const editionResult = await getSupabaseAdminClient(c)
    .from('annual_conference_editions')
    .select('id, task_creator_email')
    .eq('year', year)
    .maybeSingle();
  if (editionResult.error) throw new Error(editionResult.error.message);
  if (!editionResult.data) return undefined;
  const grants = await getAnnualConferenceAccessGrants(editionResult.data.id, session.membership_id, c);
  return {
    editionId: editionResult.data.id,
    capabilities: effectiveAnnualConferenceCapabilities({
      role: session.role,
      grants,
      isPlanningOwner: Boolean(session.email)
        && session.role !== 'volunteer'
        && session.email?.trim().toLowerCase() === editionResult.data.task_creator_email.trim().toLowerCase(),
    }),
  };
}

export async function requireAnnualConferenceCapability(
  c: Context,
  year: number,
  capability: AnnualConferenceCapability,
): Promise<globalThis.Response | null> {
  const access = await annualConferenceCapabilitiesForRequest(c, year);
  if (!access) return c.json({ error: `Annual conference ${year} was not found.` }, 404);
  if (!hasAnnualConferenceCapability(access.capabilities, capability)) {
    return c.json({ error: 'This account has not been assigned that conference responsibility.' }, 403);
  }
  return null;
}

export function annualConferenceServiceErrorResponse(c: Context, error: unknown) {
  if (error instanceof AnnualConferenceServiceError) {
    return c.json({ error: error.message }, annualConferenceErrorStatus(error));
  }
  throw error;
}
