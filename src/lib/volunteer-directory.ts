export type VolunteerDirectoryStatusFilter = 'all' | 'active' | 'applicant';

export type VolunteerDirectorySearchRow = {
  name: string;
  email: string | null;
  xHandle: string | null;
  slackName: string | null;
  status: 'active' | 'applicant';
};

export type VolunteerDirectoryRow = VolunteerDirectorySearchRow & {
  id: string;
  membershipId: string | null;
  signedUpAt: string | null;
};

type VolunteerApplicationDirectoryRecord = {
  id: string;
  membership_id: string | null;
  name: string;
  email: string;
  x_handle: string | null;
  slack_name: string | null;
  created_at: string;
  status: 'active' | 'applicant';
};

type VolunteerTeamDirectoryRecord = {
  id: string;
  display_name: string;
};

export function buildVolunteerDirectoryRows(
  applications: VolunteerApplicationDirectoryRecord[],
  team: VolunteerTeamDirectoryRecord[],
): VolunteerDirectoryRow[] {
  const applicationRows: VolunteerDirectoryRow[] = applications.map((application) => ({
    id: `application:${application.id}`,
    membershipId: application.membership_id,
    name: application.name,
    email: application.email,
    xHandle: application.x_handle,
    slackName: application.slack_name,
    signedUpAt: application.created_at,
    status: application.status,
  }));
  const activeMembershipIds = new Set(applicationRows.flatMap((row) => row.membershipId ? [row.membershipId] : []));
  const teamRows: VolunteerDirectoryRow[] = team
    .filter((member) => !activeMembershipIds.has(member.id))
    .map((member) => ({
      id: `member:${member.id}`,
      membershipId: member.id,
      name: member.display_name,
      email: null,
      xHandle: null,
      slackName: null,
      signedUpAt: null,
      status: 'active',
    }));

  return [...applicationRows, ...teamRows].sort((left, right) => {
    if (left.status !== right.status) return left.status === 'active' ? -1 : 1;
    if (left.status === 'applicant' && left.signedUpAt && right.signedUpAt) {
      return new Date(right.signedUpAt).getTime() - new Date(left.signedUpAt).getTime();
    }
    return left.name.localeCompare(right.name);
  });
}

function searchableValue(value: string | null): string {
  return value?.trim().toLocaleLowerCase() ?? '';
}

export function filterVolunteerDirectory<T extends VolunteerDirectorySearchRow>(
  rows: T[],
  input: { search: string; status: VolunteerDirectoryStatusFilter },
): T[] {
  const search = searchableValue(input.search);

  return rows.filter((row) => {
    if (input.status !== 'all' && row.status !== input.status) return false;
    if (!search) return true;

    return [row.name, row.email, row.xHandle, row.slackName]
      .some((value) => searchableValue(value).includes(search));
  });
}
