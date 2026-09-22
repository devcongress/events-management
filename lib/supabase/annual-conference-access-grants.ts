import type { Context } from 'hono';
import type { AnnualConferenceCapability, AnnualConferenceCapabilityOverride } from '@/lib/annual-conference-capabilities';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';
import type { AdminRole, Database } from '@/types/supabase';
import {
  canDelegateAnnualConferenceCapability,
  effectiveAnnualConferenceCapabilities,
} from '@/lib/annual-conference-capabilities';

type GrantInsert = Database['public']['Tables']['annual_conference_access_grants']['Insert'];

export interface AnnualConferenceAccessMember {
  id: string;
  display_name: string | null;
  role: AdminRole;
  status: 'active' | 'disabled';
  capabilities: AnnualConferenceCapability[];
  overrides: AnnualConferenceCapabilityOverride[];
  inherited_capabilities: AnnualConferenceCapability[];
}

async function editionIdForYear(year: number, c?: Context): Promise<string | undefined> {
  const result = await getSupabaseAdminClient(c)
    .from('annual_conference_editions')
    .select('id')
    .eq('year', year)
    .maybeSingle();

  if (result.error) throw new Error(result.error.message);

  return result.data?.id;
}

export async function getAnnualConferenceAccessGrants(
  editionId: string,
  membershipId: string | null,
  c?: Context,
): Promise<AnnualConferenceCapabilityOverride[]> {
  if (!membershipId || !isSupabaseRuntimeEnabled(c)) return [];
  const result = await getSupabaseAdminClient(c)
    .from('annual_conference_access_grants')
    .select('capability, enabled')
    .eq('edition_id', editionId)
    .eq('membership_id', membershipId);

  if (result.error) throw new Error(result.error.message);

  return result.data.map((row) => ({ capability: row.capability, enabled: row.enabled }));
}

export async function listAnnualConferenceAccessMembers(year: number, c?: Context): Promise<{
  edition_id: string;
  members: AnnualConferenceAccessMember[];
} | undefined> {
  if (!isSupabaseRuntimeEnabled(c)) return undefined;
  const editionResult = await getSupabaseAdminClient(c)
    .from('annual_conference_editions')
    .select('id, task_creator_email')
    .eq('year', year)
    .maybeSingle();

  if (editionResult.error) throw new Error(editionResult.error.message);
  if (!editionResult.data) return undefined;
  const edition = editionResult.data;
  const editionId = edition.id;

  const client = getSupabaseAdminClient(c);
  const [membersResult, grantsResult] = await Promise.all([
    client
      .from('admin_memberships')
      .select('id, email, display_name, role, status')
      .order('display_name', { ascending: true }),
    client
      .from('annual_conference_access_grants')
      .select('membership_id, capability, enabled')
      .eq('edition_id', editionId),
  ]);

  if (membersResult.error) throw new Error(membersResult.error.message);
  if (grantsResult.error) throw new Error(grantsResult.error.message);

  const grantsByMember = new Map<string, AnnualConferenceCapabilityOverride[]>();

  for (const grant of grantsResult.data) {
    const capabilities = grantsByMember.get(grant.membership_id) ?? [];

    capabilities.push({ capability: grant.capability, enabled: grant.enabled });
    grantsByMember.set(grant.membership_id, capabilities);
  }

  return {
    edition_id: editionId,
    members: membersResult.data.map((member) => {
      const planningOwner = member.email.trim().toLowerCase() === edition.task_creator_email.trim().toLowerCase();

      return {
        id: member.id,
        display_name: member.display_name,
        role: member.role,
        status: member.status,
        capabilities: effectiveAnnualConferenceCapabilities({
          role: member.role,
          overrides: grantsByMember.get(member.id) ?? [],
          isPlanningOwner: member.role !== 'volunteer' && planningOwner,
        }),
        overrides: grantsByMember.get(member.id) ?? [],
        inherited_capabilities: effectiveAnnualConferenceCapabilities({
          role: member.role,
          isPlanningOwner: member.role !== 'volunteer' && planningOwner,
        }),
      };
    }),
  };
}

export async function setAnnualConferenceAccessGrant(input: {
  year: number;
  membershipId: string;
  capability: AnnualConferenceCapability;
  enabled: boolean;
  grantedByMembershipId: string;
}, c?: Context): Promise<'updated' | 'not_found' | 'inactive' | 'not_eligible' | undefined> {
  if (!isSupabaseRuntimeEnabled(c)) return undefined;
  const editionId = await editionIdForYear(input.year, c);

  if (!editionId) return undefined;

  const client = getSupabaseAdminClient(c);
  const membershipResult = await client
    .from('admin_memberships')
    .select('id, role, status')
    .eq('id', input.membershipId)
    .maybeSingle();

  if (membershipResult.error) throw new Error(membershipResult.error.message);
  if (!membershipResult.data) return 'not_found';
  if (membershipResult.data.status !== 'active') return 'inactive';
  if (!canDelegateAnnualConferenceCapability(input.capability, membershipResult.data.role)) {
    return 'not_eligible';
  }

  const row: GrantInsert = {
    edition_id: editionId,
    membership_id: input.membershipId,
    capability: input.capability,
    enabled: input.enabled,
    granted_by_membership_id: input.grantedByMembershipId,
  };
  const rows: GrantInsert[] = [row];

  if (input.capability === 'work_plan.view_all' && !input.enabled) {
    rows.push({ ...row, capability: 'work_plan.manage', enabled: false });
  }
  if (input.capability === 'work_plan.manage' && input.enabled) {
    rows.push({ ...row, capability: 'work_plan.view_all', enabled: true });
  }

  const result = await client
    .from('annual_conference_access_grants')
    .upsert(rows, { onConflict: 'edition_id,membership_id,capability' });

  if (result.error) throw new Error(result.error.message);

  return 'updated';
}

export async function clearAnnualConferenceAccessGrantsForMembership(
  membershipId: string,
  c?: Context,
): Promise<void> {
  if (!isSupabaseRuntimeEnabled(c)) return;
  const result = await getSupabaseAdminClient(c)
    .from('annual_conference_access_grants')
    .delete()
    .eq('membership_id', membershipId);

  if (result.error) throw new Error(result.error.message);
}

export async function listAnnualConferenceVolunteerTeam(year: number, c?: Context): Promise<Array<{
  id: string;
  email: string;
  display_name: string;
  role: 'volunteer';
}>> {
  if (!isSupabaseRuntimeEnabled(c)) return [];
  const editionId = await editionIdForYear(year, c);

  if (!editionId) return [];

  const volunteersResult = await getSupabaseAdminClient(c)
    .from('admin_memberships')
    .select('id, email, display_name, role')
    .eq('status', 'active')
    .eq('role', 'volunteer')
    .order('display_name', { ascending: true });

  if (volunteersResult.error) throw new Error(volunteersResult.error.message);

  return volunteersResult.data
    .map((member) => ({
      id: member.id,
      email: member.email,
      display_name: member.display_name?.trim() || 'Volunteer',
      role: 'volunteer' as const,
    }));
}
