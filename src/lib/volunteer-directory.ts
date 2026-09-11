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

export type VolunteerDirectoryTask = {
  id: string;
  title: string;
  status: string;
  accountable_owner: string | null;
  collaborators: string[];
};

export type VolunteerDirectoryAction = {
  href: string;
  label: string;
  description: string;
  primary?: boolean;
};

type VolunteerDirectoryActionOptions = {
  role: 'owner' | 'organizer' | 'volunteer' | null;
  year: string;
  canViewAllTasks: boolean;
  canAssignTasks: boolean;
  workPlanPath: string;
  accessPath: string;
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

function normalizedIdentity(value: string | null): string {
  return searchableValue(value);
}

export function volunteerDirectoryAssignments<T extends VolunteerDirectoryTask>(
  row: VolunteerDirectoryRow | null,
  tasks: T[],
): T[] {
  if (!row) return [];

  const identities = new Set(
    [row.email, row.name]
      .map(normalizedIdentity)
      .filter(Boolean),
  );

  return tasks.filter((task) => [task.accountable_owner, ...task.collaborators]
    .some((value) => identities.has(normalizedIdentity(value))));
}

export function volunteerDirectoryActions(
  person: VolunteerDirectoryRow | null,
  options: VolunteerDirectoryActionOptions,
): VolunteerDirectoryAction[] {
  if (!person || (options.role !== 'owner' && options.role !== 'organizer')) return [];

  const actions: VolunteerDirectoryAction[] = [];

  if (options.canViewAllTasks) {
    const query = new URLSearchParams({ owner: person.email ?? person.name, phase: 'all' });

    actions.push({
      href: `${options.workPlanPath}?${query}`,
      label: options.canAssignTasks ? 'Review or assign work' : 'View assigned work',
      description: 'Open Work Plan filtered to this person.',
      primary: true,
    });
  }

  const applicationId = person.id.startsWith('application:') ? person.id.slice('application:'.length) : null;

  if (person.status === 'applicant' && applicationId) {
    const query = new URLSearchParams({ volunteer_application: applicationId, edition: options.year });

    actions.push({
      href: `${options.accessPath}?${query}`,
      label: 'Set up workspace access',
      description: 'Review and confirm access separately; this does not approve automatically.',
    });
  } else if (options.role === 'owner' && person.membershipId) {
    const query = new URLSearchParams({ member: person.membershipId, edition: options.year });

    actions.push({
      href: `${options.accessPath}?${query}`,
      label: 'Manage responsibilities',
      description: 'Review edition access without changing team membership.',
    });
  }

  return actions;
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
