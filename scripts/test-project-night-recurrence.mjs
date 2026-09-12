// Run against a disposable local database named project_night_test, never production.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

assert.equal(process.env.PGDATABASE, 'project_night_test');
assert.match(process.env.PGHOST ?? '', /^\/tmp\/project-night-postgres\./);
const read = (name) => readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
const sql = (query) => execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At'], { input: query, encoding: 'utf8' }).trim();
const base = read('20260615000000_community_events').split('drop trigger')[0];
const ownership = read('20260801020000_community_event_submissions').split('create table if not exists public.event_submissions')[0].replace('begin;', '');
const lifecycle = read('20260812210500_event_archive_lifecycle').split('create or replace function')[0];

sql(`do $$ begin
if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
${base}
${read('20260620032000_event_series_type')}
${ownership}
${lifecycle}
create table public.event_slack_announcements(event_id uuid, status text, sent_at timestamptz);
create table public.admin_audit_log(action text, target_type text, target_id text, metadata jsonb);
${read('20260912020000_project_night_recurrence')}`);
// Apply the exact migration first, then replace only its clock in this disposable DB.
sql(`create function public.project_night_test_now() returns timestamptz language sql as $$ select current_setting('test.clock')::timestamptz $$;
do $$ declare definition text; signature text; begin
foreach signature in array array['public.configure_project_night(uuid,text)', 'public.advance_project_night()'] loop
select pg_get_functiondef(signature::regprocedure) into definition;
execute replace(definition, 'now()', 'public.project_night_test_now()');
end loop; end $$;`);
const sourceId = '00000000-0000-4000-8000-000000000001';
const run = (query, clock = '2026-09-14 08:00:00+00') => sql(`set test.clock = '${clock}'; ${query}`).replace(/^SET\n/, '');

run(`insert into community_events(id,slug,name,starts_at,ends_at,cover_url,location_name,publication_status,publish_to_website)
values ('${sourceId}','project-night-source','Project Night','2026-09-10 18:30Z','2026-09-10 21:00Z','/latest-post.jpg','Accra','published',true);
insert into event_slack_announcements values('${sourceId}','sent',now());`);
run(`update community_events set schedule='[{"title":"Old session"}]', photos='[{"url":"/old-photo.jpg"}]' where id='${sourceId}'`);
assert.equal(run('select count(*) from project_night_recurrence'), '0', 'migration does not enable recurrence');
assert.match(run(`select configure_project_night('${sourceId}','enable')`), /2026-09-17/);
run('select advance_project_night()');
assert.equal(run("select publication_status from community_events where slug='project-night-2026-09-17'"), 'draft');
assert.equal(run("select cover_url from community_events where slug='project-night-2026-09-17'"), '/latest-post.jpg');
assert.equal(run("select schedule::text || '|' || photos::text from community_events where slug='project-night-2026-09-17'"), '[]|[]', 'old occurrence content is not copied');
assert.equal(run("select starts_at::time || '|' || (ends_at-starts_at) from community_events where slug='project-night-2026-09-17'"), '18:30:00|02:30:00');
run('select advance_project_night()');
assert.equal(run('select count(*) from project_night_occurrences'), '1', 'repeat scheduler call is idempotent');
const publishedId = run('select advance_project_night()', '2026-09-14 09:00Z');

assert.match(publishedId, /^[a-f0-9-]{36}$/);
assert.equal(run(`select publication_status from community_events where id='${publishedId}'`), 'published');
run('select advance_project_night()', '2026-09-14 09:15Z');
assert.equal(run("select count(*) from community_events where publication_status='published'"), '2', 'only current week is published');
assert.equal(run("select publication_status from community_events where slug='project-night-2026-09-24'"), 'draft');
run(`update community_events set cover_url='/replacement.jpg' where id='${sourceId}'`);
assert.equal(run("select cover_url from community_events where slug='project-night-2026-09-24'"), '/replacement.jpg');
assert.equal(run(`select cover_url from community_events where id='${publishedId}'`), '/latest-post.jpg', 'past occurrence retains its image');
run(`select configure_project_night('${sourceId}','skip')`);
run('select advance_project_night()', '2026-09-21 09:00Z');
assert.equal(run("select publication_status from community_events where slug='project-night-2026-09-24'"), 'draft', 'skipped event stays unpublished');
run(`select configure_project_night('${sourceId}','pause')`);
assert.equal(run('select advance_project_night()', '2026-10-05 09:00Z'), '', 'pause prevents advancement');
run(`select configure_project_night('${sourceId}','enable')`, '2026-10-07 12:00Z');
assert.equal(run('select next_date from project_night_recurrence'), '2026-10-15', 'resume waits for the next Monday');
run('select advance_project_night()', '2026-11-09 09:00Z');
assert.equal(run("select count(*) from community_events where publication_status='published'"), '3', 'missed weeks do not create a published backlog');
assert.equal(run("select has_function_privilege('authenticated','configure_project_night(uuid,text)','execute')"), 'f');
assert.equal(run("select has_table_privilege('authenticated','project_night_recurrence','select')"), 'f');
assert.equal(run('select count(*) from admin_audit_log'), '2', 'each automatic publication is audited once');
run(`insert into community_events(slug,name,starts_at,ends_at,cover_url,location_name,publication_status,publish_to_website,deleted_at)
values ('removed-project-night','Project Night','2026-11-19 18:30Z','2026-11-19 21:00Z','/cover.jpg','Accra','archived',false,now());`);
assert.equal(run('select advance_project_night()', '2026-11-16 09:00Z'), '', 'removed event is not resurrected or announced');
assert.equal(run("select count(*) from community_events where starts_at::date='2026-11-19'"), '1', 'removed same-week event is not duplicated');
console.log('Project Night database regression checks passed.');
