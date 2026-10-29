import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { compile, computed, createSSRApp, ref } from 'vue';
import { parse } from 'vue/compiler-sfc';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';
import { conferenceSections } from './sections/conference';
import { generalSections } from './sections/general';

type TemplateProp = {
  type: number;
  name: string;
  value?: { content: string };
  exp?: { content: string };
  arg?: { content: string };
  loc: { source: string };
};

type TemplateNode = {
  type: number;
  tag?: string;
  props?: TemplateProp[];
  children?: TemplateNode[];
  loc: { source: string };
};

type Boundary = { file: string; node: TemplateNode; siblings: TemplateNode[] };
type VariantCase = { state: Record<string, unknown>; name: string };

const root = process.cwd();
const sections = [...generalSections, ...conferenceSections];
const sectionById = new Map(sections.map(section => [section.id, section]));
const variants: Record<string, VariantCase[]> = {
  'src/views/SpeakerTalkIntakeView.vue': [
    { state: { isConferenceIntake: false }, name: 'speaker-talk-intake' },
    { state: { isConferenceIntake: true }, name: 'speaker-talk-intake-conference' },
  ],
  'src/views/admin/AdminAnnualConferenceView.vue': [
    { state: { loadingAssignedAccess: false }, name: 'annual-conference-overview' },
    { state: { loadingAssignedAccess: true }, name: 'annual-conference-overview-assigned' },
  ],
  'src/views/admin/AdminAnnualConferenceWorkPlanView.vue': [
    { state: { usesKanbanBoard: false }, name: 'annual-conference-work-plan' },
    { state: { usesKanbanBoard: true }, name: 'annual-conference-work-plan-board' },
  ],
  'src/views/admin/AdminAnnualConferenceRegistrationsView.vue': ['summary', 'guests', 'form', 'emails', 'blasts', 'community'].map(activeSection => ({
    state: { activeSection },
    name: activeSection === 'summary' ? 'annual-conference-registrations' : `annual-conference-registrations-${activeSection}`,
  })),
  'src/views/admin/AdminAnnualConferenceTicketingView.vue': ['overview', 'orders', 'delivery', 'sponsors', 'testing'].map(activeSection => ({
    state: { activeSection },
    name: activeSection === 'overview' ? 'annual-conference-ticketing' : `annual-conference-ticketing-${activeSection}`,
  })),
  'src/views/admin/AdminFeedbackView.vue': [
    { state: { responsesMode: false }, name: 'admin-feedback' },
    { state: { responsesMode: true }, name: 'admin-feedback-responses' },
  ],
  'src/views/admin/AdminFormBoardDisplayView.vue': [1, 2, 3].map(loadingCardCount => ({
    state: { loadingCardCount },
    name: `admin-present-forms-board-${loadingCardCount}`,
  })),
  'src/views/admin/AdminMobileAnnualConferenceView.vue': [
    { state: { activeTab: ref('overview'), isVolunteer: ref(false) }, name: 'mobile-conference-workspace' },
    { state: { activeTab: ref('overview'), isVolunteer: ref(true) }, name: 'mobile-conference-workspace-assigned' },
    { state: { activeTab: ref('tasks'), isVolunteer: ref(false) }, name: 'mobile-conference-workspace-tasks' },
    { state: { activeTab: ref('tasks'), isVolunteer: ref(true) }, name: 'mobile-conference-workspace-my-tasks' },
    { state: { activeTab: ref('volunteers'), isVolunteer: ref(false) }, name: 'mobile-conference-workspace-volunteers' },
  ],
  'src/views/admin/AdminMobileEventView.vue': ['overview', 'guests', 'submissions'].map(activeSection => ({
    state: { activeSection },
    name: activeSection === 'overview' ? 'mobile-event-detail' : `mobile-event-detail-${activeSection}`,
  })),
  'src/views/admin/AdminRegistrationsView.vue': ['summary', 'guests', 'form', 'emails', 'blasts'].map(activeWorkspaceTab => ({
    state: { activeWorkspaceTab },
    name: activeWorkspaceTab === 'summary' ? 'admin-registration-workspace' : `admin-registration-workspace-${activeWorkspaceTab}`,
  })),
  'src/views/admin/AdminOrganizersView.vue': [
    { state: { currentUserRole: 'owner' }, name: 'admin-organizers-owner' },
    { state: { currentUserRole: 'organizer' }, name: 'admin-organizers' },
  ],
  'src/views/admin/AdminTalksView.vue': ['cfp', 'proposals', 'program', 'backfill'].map(activeTalkSection => ({
    state: { activeTalkSection },
    name: activeTalkSection === 'cfp' ? 'admin-talks' : `admin-talks-${activeTalkSection}`,
  })),
  'src/components/AnnualConferenceRegistrationEmails.vue': [
    { state: { registrationId: undefined }, name: 'annual-conference-registration-emails' },
    { state: { registrationId: 'guest-id' }, name: 'annual-conference-guest-emails' },
  ],
};

function vueFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) return vueFiles(path);

    return entry.name.endsWith('.vue') ? [path] : [];
  });
}

function template(file: string): TemplateNode {
  const block = parse(readFileSync(join(root, file), 'utf8')).descriptor.template;

  return block?.ast as unknown as TemplateNode ?? { type: 0, children: [], loc: { source: '' } };
}

function findBoundaries(node: TemplateNode, file: string): Boundary[] {
  return (node.children ?? []).flatMap(child => [
    ...(child.tag === 'BoneyardPageSkeleton' ? [{ file, node: child, siblings: node.children! }] : []),
    ...findBoundaries(child, file),
  ]);
}

const boundaries = ['src/views', 'src/components'].flatMap(directory => vueFiles(join(root, directory)))
  .flatMap(file => {
    const path = relative(root, file);

    return findBoundaries(template(path), path);
  });

function evaluate(expression: string, state: Record<string, unknown>): unknown {
  return new Function(...Object.keys(state), `return (${expression});`)(...Object.values(state));
}

function scriptBinding(file: string, name: string, state: Record<string, unknown>): unknown {
  const script = parse(readFileSync(join(root, file), 'utf8')).descriptor.scriptSetup!.content;
  const source = ts.createSourceFile(file, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let initializer = '';

  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) {
      initializer = node.initializer?.getText(source) ?? '';
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  expect(initializer, `${file}: ${name} binding`).not.toBe('');

  return evaluate(initializer, { computed, ...state });
}

function boundaryNames(boundary: Boundary): string[] {
  const literal = boundary.node.props?.find(prop => prop.type === 6 && prop.name === 'name');

  if (literal) return [literal.value!.content];

  const expression = boundary.node.props?.find(prop => prop.name === 'bind' && prop.arg?.content === 'name')?.exp?.content;
  const cases = variants[boundary.file];

  expect(expression, `${boundary.file}: named skeleton`).toBeTruthy();
  expect(cases, `${boundary.file}: dynamic name cases`).toBeDefined();

  return cases.map(({ state, name }) => {
    const actual = expression === 'mobileLoadingSection'
      ? (scriptBinding(boundary.file, expression, state) as { value: unknown }).value
      : evaluate(expression!, state);

    expect(actual, `${boundary.file}: ${JSON.stringify(state)}`).toBe(name);

    return name;
  });
}

function branchDirective(node: TemplateNode): TemplateProp | undefined {
  return node.props?.find(prop => prop.type === 7 && ['if', 'else-if', 'else'].includes(prop.name));
}

async function renderedBranch(file: string, name: string, state: Record<string, unknown>): Promise<string> {
  const boundary = boundaries.find(item => item.file === file && item.node.loc.source.includes(`name="${name}"`))!;
  const siblings = boundary.siblings.filter(node => node.type === 1);
  let start = siblings.indexOf(boundary.node);

  while (start > 0 && branchDirective(siblings[start])?.name !== 'if') start -= 1;

  let end = start + 1;

  while (end < siblings.length && ['else-if', 'else'].includes(branchDirective(siblings[end])?.name ?? '')) end += 1;

  const branches = siblings.slice(start, end);
  const source = branches.map((node, index) => `<p ${branchDirective(node)?.loc.source ?? ''} data-branch="${index}"></p>`).join('');
  const html = await renderToString(createSSRApp({
    setup: () => state,
    render: compile(source),
  }));
  const selected = html.match(/data-branch="(\d+)"/);

  return selected ? branches[Number(selected[1])].loc.source : '';
}

describe('initial loading section catalog', () => {
  it('previews accepted conference logistics instead of a proposal-edit form', () => {
    const section = sectionById.get('speaker-talk-intake-conference')!;
    const fixture = readFileSync(join(root, 'src/components/ui/BoneyardConferenceIntakeFixture.vue'), 'utf8');

    expect(section.blocks).toEqual([{ kind: 'speaker-conference-intake' }]);
    expect(section.capture.publicFormFrame).toBe('art');
    expect(fixture).toContain('/brand/dev-con-logo.png');

    for (const label of [
      'Accepted proposal',
      'Availability confirmation',
      'Do participants need laptops?',
      'Slides or supporting-resource link',
      'Technical and setup requirements',
      'Required software or equipment',
    ]) {
      expect(fixture).toContain(label);
    }

    expect(fixture).not.toContain('label="Duration"');
    expect(fixture).not.toContain('label="Speaker bio"');
  });

  it('keeps the participant loader in the same centered room frame', () => {
    const source = readFileSync(join(root, 'src/views/SystemDesignParticipantView.vue'), 'utf8');
    const section = sectionById.get('system-design-participant')!;

    expect(source).toMatch(/<section v-else-if="joining \|\| !state" class="flex h-svh items-center justify-center overflow-hidden p-6">/);
    expect(source).toContain('<BoneyardPageSkeleton class="max-w-md" name="system-design-participant"');
    expect(section.capture.maxWidth - 2 * ((section.capture.padding ?? 0) + (section.capture.innerPadding ?? 0))).toBe(448);
    expect(section.capture.align).toBe('center');
    expect(section.blocks).toEqual([{ kind: 'learning-lobby' }]);
  });

  it('has unique source-backed capture targets and resolves every static and dynamic callsite', () => {
    expect(sectionById.size).toBe(sections.length);
    const used = new Set<string>();

    for (const boundary of boundaries) {
      for (const name of boundaryNames(boundary)) {
        const section = sectionById.get(name);

        expect(section, `${boundary.file}: ${name}`).toBeDefined();
        expect(section!.sourcePaths, name).toContain(boundary.file);
        used.add(name);
      }
    }

    expect([...sectionById.keys()].filter(id => !used.has(id))).toEqual([]);

    for (const section of sections) {
      expect(section.blocks.length, section.id).toBeGreaterThan(0);
      expect(section.capture.maxWidth, section.id).toBeGreaterThan(0);
      expect(section.sourcePaths.every(path => existsSync(join(root, path))), section.id).toBe(true);
    }
  });

  it('keeps summaries, rosters, forms, boards and guest drawers structurally distinct', () => {
    const kinds = (name: string) => sectionById.get(name)!.blocks.map(block => block.kind);

    expect(kinds('admin-registration-workspace')).toEqual(['registration-summary']);
    expect(kinds('admin-registration-workspace-guests')).toContain('table');
    expect(kinds('admin-registration-workspace-form')).toEqual(['form']);
    expect(kinds('admin-talks-proposals')).toContain('table');
    expect(kinds('admin-talks-program')).toContain('cards');
    expect(sectionById.get('annual-conference-work-plan-board')!.blocks).toEqual([
      expect.objectContaining({ kind: 'work-plan', view: 'board' }),
    ]);
    expect(sectionById.get('annual-conference-work-plan')!.blocks).toEqual([
      expect.objectContaining({ kind: 'work-plan', view: 'ledger' }),
    ]);
    expect(kinds('annual-conference-registration-emails')).toContain('stats');
    expect(kinds('annual-conference-guest-emails')).not.toContain('stats');
    expect(sectionById.get('annual-conference-guest-emails')!.capture.context).toBe('drawer');
    expect(sectionById.get('annual-conference-guest-emails')!.blocks).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'toolbar', search: expect.any(String) })]),
    );
  });

  it('uses the session role only as the overview loading hint until permissions arrive', () => {
    const file = 'src/views/admin/AdminAnnualConferenceView.vue';
    const hint = (role: string, scope?: string) => {
      const workPlanQuery = { data: { value: scope ? { permissions: { access_scope: scope } } : undefined } };
      const assignedAccess = scriptBinding(file, 'assignedAccess', { workPlanQuery });

      return (scriptBinding(file, 'loadingAssignedAccess', {
        assignedAccess,
        workPlanQuery,
        sessionQuery: { data: { value: { user: { role } } } },
      }) as { value: boolean }).value;
    };

    expect(hint('volunteer')).toBe(true);
    expect(hint('owner')).toBe(false);
    expect(hint('volunteer', 'conference')).toBe(false);
    expect(hint('organizer', 'assigned')).toBe(true);
  });
});

describe('first loading and refresh state contracts', () => {
  it('keeps the live-room controls visible after a session has loaded', async () => {
    const file = 'src/components/SystemDesignLearningRoomPanel.vue';
    const state = { loading: true, session: { questions: [] } };
    const source = readFileSync(join(root, file), 'utf8');
    const controlsGuard = source.match(/<div v-if="([^"]+)" class="mt-5 flex flex-wrap gap-3">/)?.[1];

    expect(await renderedBranch(file, 'system-design-learning-room-questions', state)).toBe('');
    expect(controlsGuard).toBeDefined();
    expect(evaluate(controlsGuard!, state)).toBeTruthy();
  });

  it('retains recurrence controls during reload and save operations', async () => {
    const file = 'src/components/ProjectNightRecurrencePanel.vue';

    expect(await renderedBranch(file, 'project-night-recurrence', { loading: true, ready: false })).toContain('<BoneyardPageSkeleton');
    expect(await renderedBranch(file, 'project-night-recurrence', { loading: true, ready: true, saving: true })).toContain('ENABLE RECURRENCE');
    const source = readFileSync(join(root, file), 'utf8');
    const load = source.slice(source.indexOf('async function load()'), source.indexOf('async function save('));

    expect(load).not.toContain('ready.value = false');
  });

  it('keeps fetched resource rows, empty state, error recovery and add/save feedback separate', async () => {
    const file = 'src/components/AnnualConferenceTaskResources.vue';
    const state = { query: { isPending: { value: true }, isFetching: { value: true }, isError: { value: false }, data: { value: undefined as unknown } }, resources: [] as unknown[], adding: false };

    expect(await renderedBranch(file, 'annual-conference-task-resources', state)).toContain('<BoneyardPageSkeleton');
    state.query.isPending.value = false;
    state.query.data.value = { resources: [] };
    expect(await renderedBranch(file, 'annual-conference-task-resources', state)).toContain('No resources yet.');
    state.resources = [{ id: 'resource' }];
    state.query.data.value = { resources: state.resources };
    expect(await renderedBranch(file, 'annual-conference-task-resources', state)).toBe('');
    state.query.isError.value = true;
    expect(await renderedBranch(file, 'annual-conference-task-resources', state)).toContain('Unable to load task resources.');
    state.query.isError.value = false;
    state.resources = [];
    state.adding = true;
    expect(await renderedBranch(file, 'annual-conference-task-resources', state)).toBe('');
  });

  it('retains loaded volunteer recipients during refetch and exposes an initial failure', async () => {
    const file = 'src/components/VolunteerBroadcastPanel.vue';
    const state = { query: { isPending: { value: true }, isFetching: { value: true }, isError: { value: false }, data: { value: undefined as unknown } }, accepted: [{ id: 'volunteer' }] };

    expect(await renderedBranch(file, 'volunteer-broadcast', state)).toContain('<BoneyardPageSkeleton');
    state.query.isPending.value = false;
    state.query.data.value = { accepted_volunteers: state.accepted };
    expect(await renderedBranch(file, 'volunteer-broadcast', state)).toContain('volunteer-blasts__composer');
    state.query.isError.value = true;
    expect(await renderedBranch(file, 'volunteer-broadcast', state)).toContain('volunteer-blasts__composer');
    state.query.data.value = undefined;
    expect(await renderedBranch(file, 'volunteer-broadcast', state)).toContain('Unable to load volunteer Broadcasts.');
  });

  it('keeps unavailable conference years and purchase failures separate from the initial wait', async () => {
    const file = 'src/components/AnnualConferenceCommunityTickets.vue';
    const state = { year: '2027', pool: { isPending: { value: true }, isError: { value: false }, data: { value: undefined as unknown } } };

    expect(await renderedBranch(file, 'annual-conference-community-purchases', state)).toContain('DevCon26 only.');
    state.year = '2026';
    expect(await renderedBranch(file, 'annual-conference-community-purchases', state)).toContain('<BoneyardPageSkeleton');
    state.pool.isPending.value = false;
    state.pool.isError.value = true;
    expect(await renderedBranch(file, 'annual-conference-community-purchases', state)).toContain('Unable to load community purchases.');
    state.pool.isError.value = false;
    state.pool.data.value = { purchases: [] };
    expect(await renderedBranch(file, 'annual-conference-community-purchases', state)).toContain('No paid community purchases yet.');
  });
});
