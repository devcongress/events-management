import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

// Disposable socket-only cluster; this script never accepts a database URL.
const run = promisify(execFile);
const bindir = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
const directory = mkdtempSync(join(tmpdir(), 'speaker-outcome-queue-'));
const args = ['-h', directory, '-p', '55480', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'];
let started = false;

async function sql(statement) {
  const { stdout } = await run(join(bindir, 'psql'), [...args, '-c', statement]);

  return stdout.trim();
}

try {
  await run(join(bindir, 'initdb'), ['-D', join(directory, 'data'), '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
  await run(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-k ${directory} -p 55480 -c listen_addresses=''`, 'start']);
  started = true;
  await sql(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.annual_conference_editions (id uuid primary key, speaker_logistics_deadline timestamptz);
    create table public.annual_conference_speaker_intake_links (
      id uuid primary key, edition_id uuid, speaker_submission_id uuid, workspace_session_id uuid, expires_at timestamptz, revoked_at timestamptz,
      email_status text, email_idempotency_key text, email_attempt_count integer default 0,
      email_last_attempt_at timestamptz, email_last_error text, updated_at timestamptz default now()
    );
    create table public.annual_conference_speaker_submissions (
      id uuid primary key, edition_id uuid, status text, speaker_email text, selected_intake_link_id uuid, selected_session_id uuid,
      decision_email_kind text, decision_email_status text, decision_email_recipient text,
      decision_email_idempotency_key text, decision_email_attempt_count integer default 0,
      decision_email_retryable boolean default true, decision_email_last_attempt_at timestamptz,
      decision_email_last_error text, updated_at timestamptz default now()
    );`);
  await run(join(bindir, 'psql'), [...args, '-f', join(process.cwd(), 'supabase/migrations/20261101180000_speaker_outcome_messages.sql')]);
  const edition = randomUUID();
  const first = randomUUID();
  const second = randomUUID();
  const link = randomUUID();
  const session = randomUUID();
  const deadline = '2100-01-01T00:00:00Z';
  const linkExpiry = '2099-12-01T00:00:00Z';
  const item = (id, key, recipient = `${key}@example.test`) => ({ id, key, recipient, ...(id === first ? { deadline, link_id: link, link_expires_at: linkExpiry } : {}), from: 'sender@example.test', replyTo: 'reply@example.test', subject: 'Frozen subject', html: '<p>Frozen</p>', text: 'Frozen' });
  const sqlJson = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
  const preview = async (items, actor = 'owner', expires = "now()+interval '1 hour'") => {
    const id = randomUUID();

    await sql(`insert into public.annual_conference_speaker_outcome_previews(id,edition_id,actor_id,recipients,expires_at) values ('${id}','${edition}','${actor}',${sqlJson(items)},${expires})`);

    return id;
  };
  const queue = (id, actor = 'owner', year = edition) => sql(`set role service_role; select public.queue_annual_conference_speaker_outcome_preview('${id}','${year}','${actor}')`);

  await sql(`insert into public.annual_conference_editions values ('${edition}','${deadline}');
    insert into public.annual_conference_speaker_intake_links(id,edition_id,speaker_submission_id,workspace_session_id,expires_at,email_status,email_idempotency_key) values ('${link}','${edition}','${first}','${session}','${linkExpiry}','pending','first');
    insert into public.annual_conference_speaker_submissions(id,edition_id,status,speaker_email,selected_intake_link_id,selected_session_id,decision_email_kind,decision_email_status,decision_email_recipient,decision_email_idempotency_key)
      values ('${first}','${edition}','selected','first@example.test','${link}','${session}','acceptance','pending','first@example.test','first'),
      ('${second}','${edition}','not_selected','second@example.test',null,null,'rejection','pending','second@example.test','second');`);
  const valid = await preview([item(first, 'first'), item(second, 'second')]);

  await assert.rejects(() => queue(valid, 'other'), /speaker_preview_unavailable/);
  await assert.rejects(() => queue(valid, 'owner', randomUUID()), /speaker_preview_unavailable/);
  const expired = await preview([item(first, 'first')], 'owner', "now()-interval '1 second'");

  await assert.rejects(() => queue(expired), /speaker_preview_unavailable/);
  await sql(`update public.annual_conference_speaker_submissions set decision_email_recipient='changed@example.test' where id='${second}'`);
  await assert.rejects(() => queue(valid), /speaker_preview_changed/);
  assert.equal(await sql('select count(*) from public.annual_conference_speaker_submissions where decision_email_queued_at is not null'), '0', 'stale batch rolls back completely');
  await sql(`update public.annual_conference_speaker_submissions set decision_email_recipient='second@example.test' where id='${second}'`);
  for (const [name, mutate, restore] of [
    ['changed future deadline', `update public.annual_conference_editions set speaker_logistics_deadline='2101-01-01' where id='${edition}'`, `update public.annual_conference_editions set speaker_logistics_deadline='${deadline}' where id='${edition}'`],
    ['expired deadline', `update public.annual_conference_editions set speaker_logistics_deadline=now()-interval '1 second' where id='${edition}'`, `update public.annual_conference_editions set speaker_logistics_deadline='${deadline}' where id='${edition}'`],
    ['revoked link', `update public.annual_conference_speaker_intake_links set revoked_at=now() where id='${link}'`, `update public.annual_conference_speaker_intake_links set revoked_at=null where id='${link}'`],
    ['expired link', `update public.annual_conference_speaker_intake_links set expires_at=now()-interval '1 second' where id='${link}'`, `update public.annual_conference_speaker_intake_links set expires_at='${linkExpiry}' where id='${link}'`],
    ['replaced link', `update public.annual_conference_speaker_submissions set selected_intake_link_id='${randomUUID()}' where id='${first}'`, `update public.annual_conference_speaker_submissions set selected_intake_link_id='${link}' where id='${first}'`],
    ['replaced session', `update public.annual_conference_speaker_submissions set selected_session_id='${randomUUID()}' where id='${first}'`, `update public.annual_conference_speaker_submissions set selected_session_id='${session}' where id='${first}'`],
  ]) {
    await sql(mutate);
    await assert.rejects(() => queue(valid), /speaker_preview_changed/, name);
    assert.equal(await sql('select count(*) from public.annual_conference_speaker_submissions where decision_email_queued_at is not null'), '0', `${name} leaves all rows untouched`);
    await sql(restore);
  }
  const expiredDate = '2020-01-01T00:00:00Z';

  await sql(`update public.annual_conference_speaker_intake_links set expires_at='${expiredDate}' where id='${link}'`);
  const expiredLinkSnapshot = await preview([{ ...item(first, 'first'), link_expires_at: expiredDate }]);

  await assert.rejects(() => queue(expiredLinkSnapshot), /speaker_preview_changed/, 'matching but expired link is rejected');
  await sql(`update public.annual_conference_speaker_intake_links set expires_at='${linkExpiry}' where id='${link}'; update public.annual_conference_editions set speaker_logistics_deadline='${expiredDate}' where id='${edition}'`);
  const expiredDeadlineSnapshot = await preview([{ ...item(first, 'first'), deadline: expiredDate }]);

  await assert.rejects(() => queue(expiredDeadlineSnapshot), /speaker_preview_changed/, 'matching but expired deadline is rejected');
  await sql(`update public.annual_conference_editions set speaker_logistics_deadline='${deadline}' where id='${edition}'`);
  const duplicate = await preview([item(first, 'first'), item(first, 'first')]);

  await assert.rejects(() => queue(duplicate), /speaker_preview_changed|speaker_preview_unavailable/, 'duplicate recipients must not queue twice');
  const results = await Promise.allSettled([queue(valid), queue(valid)]);

  assert.equal(results.filter((result) => result.status === 'fulfilled' && result.value === '2').length, 1, 'exactly one concurrent confirmation wins');
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  await assert.rejects(() => queue(valid), /speaker_preview_unavailable/, 'confirmation replay denied');
  const frozen = await sql(`select decision_email_payload::text from public.annual_conference_speaker_submissions where id='${first}'`);
  const claim = (payload) => sql(`set role service_role; select public.claim_annual_conference_speaker_email_payload('${first}','first',0,now(),false,${sqlJson(payload)})`);
  const payload = JSON.parse(frozen);

  assert.equal(payload.from, 'sender@example.test');
  assert.equal(payload.replyTo, 'reply@example.test');
  assert.equal(payload.deadline, deadline);
  assert.equal(payload.linkId, link);
  assert.equal(payload.linkExpiresAt, linkExpiry);
  await sql(`update public.annual_conference_editions set speaker_logistics_deadline='2101-01-01' where id='${edition}'`);
  assert.equal(await claim(payload), 'f', 'changed deadline blocks first claim');
  assert.equal(await sql(`select decision_email_attempt_count from public.annual_conference_speaker_submissions where id='${first}'`), '0');
  await sql(`update public.annual_conference_editions set speaker_logistics_deadline='${deadline}' where id='${edition}'`);
  assert.equal(await claim({ ...payload, subject: 'Changed' }), 'f', 'different content cannot claim frozen delivery');
  const claims = await Promise.all([claim(payload), claim(payload)]);

  assert.deepEqual(claims.sort(), ['f', 't'], 'exactly one concurrent claim wins');
  assert.equal(await sql(`select decision_email_attempt_count from public.annual_conference_speaker_submissions where id='${first}'`), '1');
  assert.equal(await sql(`select email_attempt_count from public.annual_conference_speaker_intake_links where id='${link}'`), '1');
  assert.equal(await sql(`select decision_email_payload::text from public.annual_conference_speaker_submissions where id='${first}'`), frozen);
  const oldQueue = JSON.parse(await sql(`select json_build_object('payload',decision_email_payload,'queuedAt',decision_email_queued_at) from public.annual_conference_speaker_submissions where id='${second}'`));
  const stop = (snapshot) => sql(`set role service_role; select public.stop_annual_conference_speaker_email_retry('${second}','second',0,'Workspace unavailable',${sqlJson(snapshot.payload)},'${snapshot.queuedAt}'::timestamptz)`);

  assert.equal(await stop(oldQueue), 't');
  assert.equal(await sql(`select decision_email_status='failed' and decision_email_payload is null and decision_email_queued_at is null from public.annual_conference_speaker_submissions where id='${second}'`), 't', 'pre-send failure releases frozen payload for recovery');
  const recovery = await preview([item(second, 'second')]);

  assert.equal(await queue(recovery), '1', 'failed unattempted delivery can be previewed and queued again');
  assert.equal(await sql(`select decision_email_status='pending' and decision_email_retryable and decision_email_queued_at is not null from public.annual_conference_speaker_submissions where id='${second}'`), 't');
  assert.equal(await stop(oldQueue), 'f', 'stale worker cannot clear newer queued delivery');
  assert.equal(await sql(`select decision_email_status='pending' and decision_email_payload is not null and decision_email_queued_at is not null from public.annual_conference_speaker_submissions where id='${second}'`), 't');
  await assert.rejects(() => sql(`set role authenticated; select public.queue_annual_conference_speaker_outcome_preview('${expired}','${edition}','owner')`), /permission denied/);
  await sql(`update public.annual_conference_speaker_submissions set decision_email_idempotency_key='replacement' where id='${first}'`);
  assert.equal(await sql(`select decision_email_payload is null and decision_email_queued_at is null and decision_email_payload_started_at is null from public.annual_conference_speaker_submissions where id='${first}'`), 't', 'new delivery key clears frozen payload');
  console.log('Speaker outcome queue: actor, expiry, link and deadline snapshots, atomic stale batches, duplicate and replay protection, concurrent confirmation and claim, frozen payload, first-send recovery, role boundary and reset passed.');
} finally {
  if (started) await run(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', 'stop']);
  rmSync(directory, { recursive: true, force: true });
}
