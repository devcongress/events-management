import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isTestEventTitle, TEST_EVENT_PREFIX } from '../lib/event-test-mode';
import type { Database } from '../types/supabase';

export const DELETE_CONFIRMATION = 'DELETE_TEST_EVENT_DATA';

type AppSupabaseClient = SupabaseClient<Database, 'public'>;

type TestSubmission = Pick<
  Database['public']['Tables']['event_submissions']['Row'],
  'id' | 'title' | 'review_status' | 'approved_event_id' | 'created_at'
>;

type TestEvent = Pick<
  Database['public']['Tables']['community_events']['Row'],
  'id' | 'name' | 'publication_status' | 'publish_to_website' | 'source_submission_id' | 'created_at'
>;

type CleanupArguments = {
  execute: boolean;
  confirmation: string | null;
  help: boolean;
};

type CleanupCandidates = {
  submissions: TestSubmission[];
  events: TestEvent[];
};

export function parseCleanupArguments(args: string[]): CleanupArguments {
  let execute = false;
  let confirmation: string | null = null;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--execute') {
      execute = true;
      continue;
    }

    if (argument === '--help' || argument === '-h') {
      help = true;
      continue;
    }

    if (argument === '--confirm') {
      confirmation = args[index + 1] ?? null;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return { execute, confirmation, help };
}

export function isTestEventLabel(value: string): boolean {
  return isTestEventTitle(value);
}

export function mergeTestEvents(...groups: TestEvent[][]): TestEvent[] {
  return [...new Map(groups.flat().map((event) => [event.id, event])).values()]
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
}

function printHelp() {
  console.log(`Cleanup manually-created acceptance-test event data.

Before testing, deploy with EVENT_TEST_MODE=true. The server will prefix every
new submission and directly-created event title with ${TEST_EVENT_PREFIX}.

Dry run (default):
  pnpm cleanup:test-events

Delete the displayed records:
  pnpm cleanup:test-events -- --execute --confirm ${DELETE_CONFIRMATION}

Required environment variables:
  VITE_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

The command deletes matching community events first, then matching submissions.
Submission email-outbox rows are removed by database cascade. Admin audit records
and email already delivered by the provider are intentionally retained.`);
}

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function createAdminClient(): { client: AppSupabaseClient; projectHost: string } {
  const supabaseUrl = requireEnvironment('VITE_SUPABASE_URL');
  const serviceRoleKey = requireEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  const parsedUrl = new URL(supabaseUrl);

  if (parsedUrl.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsedUrl.hostname)) {
    throw new Error('VITE_SUPABASE_URL must use HTTPS unless it points to localhost.');
  }

  return {
    client: createClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }),
    projectHost: parsedUrl.host,
  };
}

async function loadCandidates(client: AppSupabaseClient): Promise<CleanupCandidates> {
  const submissionsResult = await client
    .from('event_submissions')
    .select('id,title,review_status,approved_event_id,created_at')
    .ilike('title', `${TEST_EVENT_PREFIX}%`)
    .order('created_at', { ascending: true });

  if (submissionsResult.error) {
    throw new Error(`Unable to load test submissions: ${submissionsResult.error.message}`);
  }

  const submissions = submissionsResult.data as TestSubmission[];
  const submissionIds = submissions.map((submission) => submission.id);
  const approvedEventIds = submissions
    .map((submission) => submission.approved_event_id)
    .filter((id): id is string => Boolean(id));

  const prefixedEventsResult = await client
    .from('community_events')
    .select('id,name,publication_status,publish_to_website,source_submission_id,created_at')
    .ilike('name', `${TEST_EVENT_PREFIX}%`)
    .order('created_at', { ascending: true });

  if (prefixedEventsResult.error) {
    throw new Error(`Unable to load test events: ${prefixedEventsResult.error.message}`);
  }

  let linkedEvents: TestEvent[] = [];
  if (submissionIds.length > 0 || approvedEventIds.length > 0) {
    const filters: string[] = [];
    if (submissionIds.length > 0) filters.push(`source_submission_id.in.(${submissionIds.join(',')})`);
    if (approvedEventIds.length > 0) filters.push(`id.in.(${approvedEventIds.join(',')})`);

    const linkedEventsResult = await client
      .from('community_events')
      .select('id,name,publication_status,publish_to_website,source_submission_id,created_at')
      .or(filters.join(','));

    if (linkedEventsResult.error) {
      throw new Error(`Unable to load events promoted from test submissions: ${linkedEventsResult.error.message}`);
    }

    linkedEvents = linkedEventsResult.data as TestEvent[];
  }

  return {
    submissions,
    events: mergeTestEvents(prefixedEventsResult.data as TestEvent[], linkedEvents),
  };
}

function printCandidates(projectHost: string, candidates: CleanupCandidates) {
  console.log(`\nSupabase project: ${projectHost}`);
  console.log(`Selection rule: titles beginning with ${TEST_EVENT_PREFIX}\n`);

  console.log(`Submissions (${candidates.submissions.length})`);
  if (candidates.submissions.length > 0) {
    console.table(candidates.submissions.map((submission) => ({
      id: submission.id,
      status: submission.review_status,
      title: submission.title,
      created_at: submission.created_at,
    })));
  } else {
    console.log('  None');
  }

  console.log(`\nCommunity events (${candidates.events.length})`);
  if (candidates.events.length > 0) {
    console.table(candidates.events.map((event) => ({
      id: event.id,
      published: event.publish_to_website,
      status: event.publication_status,
      name: event.name,
      created_at: event.created_at,
    })));
  } else {
    console.log('  None');
  }
}

async function deleteByIds(
  client: AppSupabaseClient,
  table: 'community_events' | 'event_submissions',
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;

  const result = await client.from(table).delete().in('id', ids).select('id');
  if (result.error) throw new Error(`Unable to delete from ${table}: ${result.error.message}`);
  return result.data.length;
}

async function run() {
  const args = parseCleanupArguments(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (args.execute && args.confirmation !== DELETE_CONFIRMATION) {
    throw new Error(`Deletion requires --confirm ${DELETE_CONFIRMATION}`);
  }

  if (!args.execute && args.confirmation !== null) {
    throw new Error('--confirm can only be used together with --execute.');
  }

  const { client, projectHost } = createAdminClient();
  const candidates = await loadCandidates(client);
  printCandidates(projectHost, candidates);

  if (candidates.events.length === 0 && candidates.submissions.length === 0) {
    console.log('\nNothing to clean up.');
    return;
  }

  if (!args.execute) {
    console.log(`\nDry run only. Review every row above, then run:\n`);
    console.log(`pnpm cleanup:test-events -- --execute --confirm ${DELETE_CONFIRMATION}`);
    return;
  }

  const deletedEvents = await deleteByIds(client, 'community_events', candidates.events.map((event) => event.id));
  const deletedSubmissions = await deleteByIds(client, 'event_submissions', candidates.submissions.map((submission) => submission.id));
  const remaining = await loadCandidates(client);

  if (remaining.events.length > 0 || remaining.submissions.length > 0) {
    throw new Error(
      `Cleanup incomplete: ${remaining.events.length} event(s) and ${remaining.submissions.length} submission(s) remain. Re-run the dry run.`,
    );
  }

  console.log(`\nCleanup complete: deleted ${deletedEvents} event(s) and ${deletedSubmissions} submission(s).`);
  console.log('Related submission email-outbox rows were removed by database cascade.');
  console.log('Admin audit history and already-delivered provider email remain intact.');
}

if (import.meta.main) {
  run().catch((error) => {
    console.error(error instanceof Error ? `Cleanup failed: ${error.message}` : 'Cleanup failed.');
    process.exitCode = 1;
  });
}
