export const ANNUAL_CONFERENCE_TASK_CREATOR_EMAIL = 'angelateyvi@gmail.com';
export const ANNUAL_CONFERENCE_2026_EDITION_ID = '20260000-0000-4000-8000-000000000001';

export const ANNUAL_CONFERENCE_TASK_STATUSES = [
  'not_started',
  'in_progress',
  'blocked',
  'done',
] as const;

export const ANNUAL_CONFERENCE_WORKSTREAMS = [
  'programme_speakers',
  'volunteers',
  'website_registration',
  'sponsors_partners',
  'venue_production_logistics',
  'creative_marketing',
  'photo_video_livestream',
  'feedback_reporting',
] as const;

export const ANNUAL_CONFERENCE_TASK_PRIORITIES = ['high', 'medium', 'low'] as const;

export type AnnualConferenceTaskStatus = typeof ANNUAL_CONFERENCE_TASK_STATUSES[number];
export type AnnualConferenceWorkstream = typeof ANNUAL_CONFERENCE_WORKSTREAMS[number];
export type AnnualConferenceTaskPriority = typeof ANNUAL_CONFERENCE_TASK_PRIORITIES[number];

export interface AnnualConferenceEdition {
  id: string;
  year: number;
  name: string;
  label: string;
  provisional_date: string | null;
  date_status: 'provisional' | 'confirmed';
  venue_note: string | null;
  keynote_note: string | null;
  task_creator_email: string;
  created_at: string;
  updated_at: string;
}

export interface AnnualConferenceTask {
  id: string;
  edition_id: string;
  title: string;
  details: string | null;
  internal_note: string | null;
  workstream: AnnualConferenceWorkstream;
  accountable_owner: string | null;
  collaborators: string[];
  priority: AnnualConferenceTaskPriority | null;
  target_date: string | null;
  status: AnnualConferenceTaskStatus;
  dependency_note: string | null;
  source: 'excel_seed' | 'manual';
  source_row: number | null;
  sort_order: number;
  created_by_email: string | null;
  updated_by_email: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnnualConferenceTaskCreateInput {
  title: string;
  details?: string | null;
  internal_note?: string | null;
  workstream: AnnualConferenceWorkstream;
  accountable_owner: string;
  collaborators?: string[];
  priority?: AnnualConferenceTaskPriority | null;
  target_date?: string | null;
  status?: AnnualConferenceTaskStatus;
  dependency_note?: string | null;
}

export type AnnualConferenceTaskUpdateInput = Partial<
  Pick<
    AnnualConferenceTask,
    | 'title'
    | 'details'
    | 'internal_note'
    | 'workstream'
    | 'accountable_owner'
    | 'collaborators'
    | 'priority'
    | 'target_date'
    | 'status'
    | 'dependency_note'
  >
>;

export interface AnnualConferenceWorkPlanSummary {
  total: number;
  done: number;
  in_progress: number;
  blocked: number;
  not_started: number;
  unassigned: number;
  completion_percent: number;
}

type AnnualConferenceTaskOwnershipInput = {
  accountable_owner?: string | null;
  collaborators?: string[];
};

type AnnualConferenceTaskOwnership = Pick<
  AnnualConferenceTask,
  'accountable_owner' | 'collaborators'
>;

export type AnnualConferenceTaskOwnershipValidationResult<
  Input extends AnnualConferenceTaskOwnershipInput,
> =
  | { ok: true; value: Input }
  | { ok: false; error: string };

export const ANNUAL_CONFERENCE_STATUS_LABELS: Record<AnnualConferenceTaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

export const ANNUAL_CONFERENCE_WORKSTREAM_LABELS: Record<AnnualConferenceWorkstream, string> = {
  programme_speakers: 'Programme and speakers',
  volunteers: 'Volunteers',
  website_registration: 'Website and registration',
  sponsors_partners: 'Sponsors and partners',
  venue_production_logistics: 'Venue, production, and logistics',
  creative_marketing: 'Creative and marketing',
  photo_video_livestream: 'Photography, video, and livestream',
  feedback_reporting: 'Feedback and reporting',
};

const SEEDED_AT = '2026-07-26T00:00:00.000Z';

export const ANNUAL_CONFERENCE_2026_EDITION: AnnualConferenceEdition = {
  id: ANNUAL_CONFERENCE_2026_EDITION_ID,
  year: 2026,
  name: 'DevCongress Annual Conference',
  label: 'December 2026',
  provisional_date: '2026-12-19',
  date_status: 'provisional',
  venue_note: 'Current venue candidates: UPSA or Accra Digital Centre.',
  keynote_note: 'Patrick G. Awuah is the preferred keynote candidate.',
  task_creator_email: ANNUAL_CONFERENCE_TASK_CREATOR_EMAIL,
  created_at: SEEDED_AT,
  updated_at: SEEDED_AT,
};

type SeedTask = Omit<
  AnnualConferenceTask,
  'id' | 'edition_id' | 'source' | 'source_row' | 'sort_order' | 'created_by_email' | 'updated_by_email' | 'completed_at' | 'created_at' | 'updated_at'
> & {
  source_row: number;
};

const seedTasks: SeedTask[] = [
  {
    source_row: 2,
    title: 'Date',
    details: 'Set the conference date. The current starting point is 19 December 2026.',
    internal_note: 'The date remains provisional until the organizers confirm it.',
    workstream: 'venue_production_logistics',
    accountable_owner: null,
    collaborators: [],
    priority: 'high',
    target_date: null,
    status: 'done',
    dependency_note: null,
  },
  {
    source_row: 3,
    title: 'Theme',
    details: 'Agree the event theme.',
    internal_note: null,
    workstream: 'creative_marketing',
    accountable_owner: null,
    collaborators: [],
    priority: null,
    target_date: null,
    status: 'not_started',
    dependency_note: null,
  },
  {
    source_row: 4,
    title: 'Venue',
    details: 'Confirm the location, capacity, and breakout rooms.',
    internal_note: 'Current candidates: UPSA or Accra Digital Centre.',
    workstream: 'venue_production_logistics',
    accountable_owner: 'Angela',
    collaborators: ['Elijah', 'Elvis'],
    priority: null,
    target_date: null,
    status: 'not_started',
    dependency_note: null,
  },
  {
    source_row: 5,
    title: 'Keynote speaker(s)',
    details: 'Invite the keynote speaker. The original shortlist also mentioned the NSMQ quiz mistress.',
    internal_note: 'Patrick G. Awuah is the preferred candidate.',
    workstream: 'programme_speakers',
    accountable_owner: 'Elijah',
    collaborators: [],
    priority: null,
    target_date: null,
    status: 'not_started',
    dependency_note: null,
  },
  {
    source_row: 6,
    title: 'Call for Speakers (announce)',
    details: 'Define the submission criteria, deadline, and review committee, then announce the call.',
    internal_note: null,
    workstream: 'programme_speakers',
    accountable_owner: null,
    collaborators: [],
    priority: null,
    target_date: null,
    status: 'not_started',
    dependency_note: null,
  },
  {
    source_row: 7,
    title: 'Speaker Submission Form (Website)',
    details: 'Publish the speaker form for name, bio, topic, abstract, format, and technical requirements.',
    internal_note: null,
    workstream: 'programme_speakers',
    accountable_owner: 'Elvis',
    collaborators: ['Ernest'],
    priority: null,
    target_date: null,
    status: 'not_started',
    dependency_note: null,
  },
  {
    source_row: 8,
    title: 'Call for Volunteers',
    details: 'Announce volunteer recruitment.',
    internal_note: null,
    workstream: 'volunteers',
    accountable_owner: 'Elvis',
    collaborators: ['Ernest'],
    priority: null,
    target_date: null,
    status: 'not_started',
    dependency_note: null,
  },
  {
    source_row: 9,
    title: 'Volunteer Submission Form (Website)',
    details: 'The volunteer submission form is live. Volunteer review, assignment, briefing, and communications will be itemized as separate later-stage tasks.',
    internal_note: 'Done means the public form is live; it does not mean the volunteer workflow is complete.',
    workstream: 'volunteers',
    accountable_owner: 'Elvis',
    collaborators: ['Ernest'],
    priority: null,
    target_date: null,
    status: 'done',
    dependency_note: null,
  },
  {
    source_row: 10,
    title: 'Workshops/Breakout Sessions planning',
    details: 'Confirm facilitators, room assignments, and required materials or equipment.',
    internal_note: null,
    workstream: 'programme_speakers',
    accountable_owner: null,
    collaborators: [],
    priority: null,
    target_date: null,
    status: 'not_started',
    dependency_note: 'Depends on the venue and breakout-room setup.',
  },
  {
    source_row: 11,
    title: 'Panel Discussions',
    details: 'Confirm topics, moderator, panelists, and format.',
    internal_note: null,
    workstream: 'programme_speakers',
    accountable_owner: null,
    collaborators: [],
    priority: null,
    target_date: null,
    status: 'not_started',
    dependency_note: null,
  },
  {
    source_row: 12,
    title: 'Demo Sessions',
    details: 'Confirm presenters, time slots, and power or AV needs.',
    internal_note: null,
    workstream: 'programme_speakers',
    accountable_owner: null,
    collaborators: [],
    priority: null,
    target_date: null,
    status: 'not_started',
    dependency_note: null,
  },
  {
    source_row: 13,
    title: 'Flyer Designs',
    details: 'Prepare digital and print versions in the required social and email sizes.',
    internal_note: null,
    workstream: 'creative_marketing',
    accountable_owner: 'Emmanuel',
    collaborators: [],
    priority: null,
    target_date: null,
    status: 'not_started',
    dependency_note: null,
  },
  {
    source_row: 14,
    title: 'Backdrop/Stage Designs',
    details: 'Design the main stage, photo wall, and other branding elements.',
    internal_note: null,
    workstream: 'creative_marketing',
    accountable_owner: 'Emmanuel',
    collaborators: [],
    priority: null,
    target_date: null,
    status: 'not_started',
    dependency_note: null,
  },
  {
    source_row: 15,
    title: 'Website/Registration Page',
    details: 'Publish the conference page with ticketing, agenda, and embedded forms.',
    internal_note: null,
    workstream: 'website_registration',
    accountable_owner: 'Elvis',
    collaborators: [],
    priority: null,
    target_date: null,
    status: 'not_started',
    dependency_note: null,
  },
  {
    source_row: 16,
    title: 'Sponsorship Packages',
    details: 'Define sponsorship tiers, prepare the deck, and build the outreach list.',
    internal_note: null,
    workstream: 'sponsors_partners',
    accountable_owner: 'Dede',
    collaborators: ['Angela', 'Philipa'],
    priority: null,
    target_date: null,
    status: 'not_started',
    dependency_note: null,
  },
  {
    source_row: 17,
    title: 'Call for sponsors and partners',
    details: 'Run partner outreach and follow-ups.',
    internal_note: null,
    workstream: 'sponsors_partners',
    accountable_owner: null,
    collaborators: [],
    priority: null,
    target_date: null,
    status: 'not_started',
    dependency_note: null,
  },
  {
    source_row: 18,
    title: 'Catering',
    details: 'Plan breakfast and lunch.',
    internal_note: null,
    workstream: 'venue_production_logistics',
    accountable_owner: 'Dede',
    collaborators: ['Ernest'],
    priority: null,
    target_date: null,
    status: 'not_started',
    dependency_note: null,
  },
  {
    source_row: 19,
    title: 'Photography',
    details: 'Book the photographer and agree the shot list and deliverables timeline.',
    internal_note: null,
    workstream: 'photo_video_livestream',
    accountable_owner: 'Dede',
    collaborators: [],
    priority: null,
    target_date: null,
    status: 'not_started',
    dependency_note: null,
  },
  {
    source_row: 20,
    title: 'Videography/Livestream',
    details: 'Confirm the videographer, recording setup, and streaming platform.',
    internal_note: 'Talk to Kweku Tech about sponsorship.',
    workstream: 'photo_video_livestream',
    accountable_owner: 'Dede',
    collaborators: [],
    priority: null,
    target_date: null,
    status: 'not_started',
    dependency_note: null,
  },
  {
    source_row: 21,
    title: 'AV Equipment',
    details: 'Confirm microphones, projectors, screens, and breakout-room technology.',
    internal_note: null,
    workstream: 'venue_production_logistics',
    accountable_owner: null,
    collaborators: [],
    priority: null,
    target_date: null,
    status: 'not_started',
    dependency_note: null,
  },
  {
    source_row: 22,
    title: 'Wifi/Connectivity',
    details: 'Confirm sufficient bandwidth for high-density use.',
    internal_note: null,
    workstream: 'venue_production_logistics',
    accountable_owner: 'Elijah',
    collaborators: [],
    priority: null,
    target_date: null,
    status: 'not_started',
    dependency_note: null,
  },
  {
    source_row: 23,
    title: 'Badges/Lanyards',
    details: 'Plan design, printing, and the check-in or registration process.',
    internal_note: null,
    workstream: 'venue_production_logistics',
    accountable_owner: null,
    collaborators: [],
    priority: null,
    target_date: null,
    status: 'not_started',
    dependency_note: null,
  },
  {
    source_row: 24,
    title: 'Swag/Merchandise',
    details: 'Confirm items, sponsor branding, and quantities.',
    internal_note: null,
    workstream: 'venue_production_logistics',
    accountable_owner: null,
    collaborators: [],
    priority: null,
    target_date: null,
    status: 'not_started',
    dependency_note: null,
  },
  {
    source_row: 25,
    title: 'Signage/Wayfinding',
    details: 'Prepare room labels, directional signs, and schedule boards.',
    internal_note: null,
    workstream: 'venue_production_logistics',
    accountable_owner: null,
    collaborators: [],
    priority: null,
    target_date: null,
    status: 'not_started',
    dependency_note: null,
  },
  {
    source_row: 26,
    title: 'Feedback Survey',
    details: 'Prepare the post-event form and QR code.',
    internal_note: null,
    workstream: 'feedback_reporting',
    accountable_owner: 'Elvis',
    collaborators: [],
    priority: null,
    target_date: null,
    status: 'not_started',
    dependency_note: null,
  },
  {
    source_row: 27,
    title: 'Create Program outline',
    details: 'Define the agenda structure, session blocks, and timings.',
    internal_note: null,
    workstream: 'programme_speakers',
    accountable_owner: 'Angela',
    collaborators: [],
    priority: null,
    target_date: null,
    status: 'not_started',
    dependency_note: null,
  },
];

export const ANNUAL_CONFERENCE_2026_SEED_TASKS: AnnualConferenceTask[] = seedTasks.map((task, index) => ({
  ...task,
  id: `20260000-0000-4000-8000-${String(index + 2).padStart(12, '0')}`,
  edition_id: ANNUAL_CONFERENCE_2026_EDITION_ID,
  source: 'excel_seed',
  sort_order: index + 1,
  created_by_email: null,
  updated_by_email: null,
  completed_at: task.status === 'done' ? SEEDED_AT : null,
  created_at: SEEDED_AT,
  updated_at: SEEDED_AT,
}));

export function canCreateAnnualConferenceTask(email: string | null | undefined): boolean {
  return String(email ?? '').trim().toLowerCase() === ANNUAL_CONFERENCE_TASK_CREATOR_EMAIL;
}

function ownershipKey(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueOwnershipValues(values: readonly string[]): string[] {
  const seen = new Set<string>();

  return values.reduce<string[]>((result, value) => {
    const trimmed = value.trim();
    const key = ownershipKey(trimmed);
    if (seen.has(key)) return result;

    seen.add(key);
    result.push(trimmed);
    return result;
  }, []);
}

function sameOwner(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  if (left == null || right == null) return left == null && right == null;
  return ownershipKey(left) === ownershipKey(right);
}

function sameCollaborators(left: readonly string[], right: readonly string[]): boolean {
  const leftKeys = new Set(uniqueOwnershipValues(left).map(ownershipKey));
  const rightKeys = new Set(uniqueOwnershipValues(right).map(ownershipKey));

  return leftKeys.size === rightKeys.size
    && [...leftKeys].every((key) => rightKeys.has(key));
}

export function annualConferenceOwnershipNeedsActiveOrganizerLookup(
  input: AnnualConferenceTaskOwnershipInput,
  existing?: AnnualConferenceTaskOwnership,
): boolean {
  if (
    'accountable_owner' in input
    && input.accountable_owner != null
    && (!existing || !sameOwner(input.accountable_owner, existing.accountable_owner))
  ) {
    return true;
  }

  if (
    'collaborators' in input
    && input.collaborators !== undefined
  ) {
    const existingCollaboratorKeys = new Set(
      (existing?.collaborators ?? []).map(ownershipKey),
    );
    const hasNewCollaborator = uniqueOwnershipValues(input.collaborators)
      .some((collaborator) => !existingCollaboratorKeys.has(ownershipKey(collaborator)));

    if (hasNewCollaborator) return true;
  }

  return false;
}

export function validateAnnualConferenceTaskOwnership<
  Input extends AnnualConferenceTaskOwnershipInput,
>(
  input: Input,
  activeOrganizerEmails: readonly string[],
  existing?: AnnualConferenceTaskOwnership,
): AnnualConferenceTaskOwnershipValidationResult<Input> {
  const activeEmails = new Map(
    uniqueOwnershipValues(activeOrganizerEmails).map((email) => {
      const normalizedEmail = ownershipKey(email);
      return [normalizedEmail, normalizedEmail] as const;
    }),
  );

  let accountableOwner = input.accountable_owner;
  if ('accountable_owner' in input && accountableOwner != null) {
    if (existing && sameOwner(accountableOwner, existing.accountable_owner)) {
      accountableOwner = existing.accountable_owner;
    } else {
      const activeEmail = activeEmails.get(ownershipKey(accountableOwner));
      if (!activeEmail) {
        return {
          ok: false,
          error: `"${accountableOwner}" is not an active organizer and cannot be the accountable owner.`,
        };
      }
      accountableOwner = activeEmail;
    }
  }

  let collaborators = input.collaborators;
  if ('collaborators' in input && collaborators !== undefined) {
    const uniqueCollaborators = uniqueOwnershipValues(collaborators);
    if (existing && sameCollaborators(uniqueCollaborators, existing.collaborators)) {
      collaborators = uniqueOwnershipValues(existing.collaborators);
    } else {
      const existingCollaborators = new Map(
        uniqueOwnershipValues(existing?.collaborators ?? [])
          .map((collaborator) => [ownershipKey(collaborator), collaborator] as const),
      );
      const invalidCollaborators: string[] = [];
      collaborators = uniqueCollaborators.flatMap((collaborator) => {
        const collaboratorKey = ownershipKey(collaborator);
        const existingCollaborator = existingCollaborators.get(collaboratorKey);
        if (existingCollaborator) return [existingCollaborator];

        const activeEmail = activeEmails.get(collaboratorKey);
        if (!activeEmail) {
          invalidCollaborators.push(collaborator);
          return [];
        }
        return [activeEmail];
      });

      if (invalidCollaborators.length > 0) {
        return {
          ok: false,
          error: `These collaborators are not active organizers: ${invalidCollaborators.join(', ')}.`,
        };
      }
    }
  }

  const effectiveOwner = 'accountable_owner' in input
    ? accountableOwner ?? null
    : existing?.accountable_owner ?? null;
  const effectiveCollaborators = 'collaborators' in input
    ? collaborators ?? []
    : existing?.collaborators ?? [];

  if (
    effectiveOwner
    && effectiveCollaborators.some(
      (collaborator) => ownershipKey(collaborator) === ownershipKey(effectiveOwner),
    )
  ) {
    return {
      ok: false,
      error: 'The accountable owner cannot also be a collaborator.',
    };
  }

  return {
    ok: true,
    value: {
      ...input,
      ...('accountable_owner' in input ? { accountable_owner: accountableOwner } : {}),
      ...('collaborators' in input ? { collaborators } : {}),
    },
  };
}

export function summarizeAnnualConferenceWorkPlan(
  tasks: AnnualConferenceTask[],
): AnnualConferenceWorkPlanSummary {
  const done = tasks.filter((task) => task.status === 'done').length;
  const inProgress = tasks.filter((task) => task.status === 'in_progress').length;
  const blocked = tasks.filter((task) => task.status === 'blocked').length;
  const notStarted = tasks.filter((task) => task.status === 'not_started').length;

  return {
    total: tasks.length,
    done,
    in_progress: inProgress,
    blocked,
    not_started: notStarted,
    unassigned: tasks.filter((task) => !task.accountable_owner).length,
    completion_percent: tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100),
  };
}

export function annualConferenceWorkstreamCounts(
  tasks: AnnualConferenceTask[],
): Record<AnnualConferenceWorkstream, { total: number; done: number }> {
  return ANNUAL_CONFERENCE_WORKSTREAMS.reduce((result, workstream) => {
    const workstreamTasks = tasks.filter((task) => task.workstream === workstream);
    result[workstream] = {
      total: workstreamTasks.length,
      done: workstreamTasks.filter((task) => task.status === 'done').length,
    };
    return result;
  }, {} as Record<AnnualConferenceWorkstream, { total: number; done: number }>);
}
