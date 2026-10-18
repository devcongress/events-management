import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';

// Own a disposable socket-only cluster. Never accepts a production URL.
const run = promisify(execFile);
const bindir = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
const directory = mkdtempSync(join(tmpdir(), 'outcome-row-controls-'));
const args = ['-h', directory, '-p', '55479', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'];
let started = false;

async function sql(statement) {
  const { stdout } = await run(join(bindir, 'psql'), [...args, '-c', statement]);

  return stdout.trim();
}

async function migrate(file) {
  await run(join(bindir, 'psql'), [...args, '-f', join(process.cwd(), 'supabase/migrations', file)]);
}

try {
  await run(join(bindir, 'initdb'), ['-D', join(directory, 'data'), '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
  await run(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-k ${directory} -p 55479 -c listen_addresses=''`, 'start']);
  started = true;
  await sql(`create role anon; create role authenticated; create role service_role bypassrls;
    create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;`);

  for (const file of [
    '20260922200000_volunteer_follow_up_campaign.sql',
    '20260923120000_volunteer_outcome_decisions.sql',
    '20260928120000_volunteer_delivery_retry_diagnostics.sql',
    '20261011150000_volunteer_outcome_composer_batches.sql',
    '20261012120000_volunteer_follow_up_outcome_messages.sql',
  ]) await migrate(file);

  const campaign = await sql("select id from public.volunteer_follow_up_campaigns where edition_year=2026");
  const lease = randomUUID();

  await sql(`update public.volunteer_follow_up_campaigns set outcome_paused=false, drain_lease_token='${lease}', drain_lease_until=now()+interval '1 hour' where id='${campaign}'`);

  async function queue(count, prefix) {
    for (let i = 0; i < count; i += 1) {
      await sql(`insert into public.volunteer_follow_up_recipients(campaign_id,application_id,application_created_at,applicant_name,applicant_email,idempotency_key,submitted_at,motivation,can_attend_accra,decision,decision_version)
        values('${campaign}','${prefix}-${i}',now(),'Fixture ${i}','${prefix}-${i}@example.test','${prefix}-${i}',now(),'Fixture',true,'accepted',1)`);
    }
    const preview = await sql(`select preview_id from public.create_volunteer_follow_up_outcome_preview('${campaign}','accepted','owner@example.test')`);

    await sql(`select public.save_volunteer_follow_up_outcome_preview_payloads('${preview}','owner@example.test',(
      select jsonb_object_agg(r->>'recipient_id',jsonb_build_object('from','test@example.test','to',jsonb_build_array(r->>'email'),'subject','Fixture','html','<p>Fixture</p>','text','Fixture'))
      from public.volunteer_follow_up_outcome_previews p,jsonb_array_elements(p.recipients) r where p.id='${preview}'))`);
    const ids = await sql(`select array_to_json(delivery_ids) from public.confirm_volunteer_follow_up_outcome_preview('${preview}','owner@example.test')`);

    assert.equal(await sql(`select array_to_json(delivery_ids) from public.confirm_volunteer_follow_up_outcome_preview('${preview}','owner@example.test')`), ids);

    return JSON.parse(ids);
  }

  const legacy = await queue(2, 'legacy');

  await migrate('20261018210000_volunteer_outcome_row_controls.sql');
  // Check the new migration's catalog promises against this real disposable database.
  const contract = JSON.parse(readFileSync('supabase/migration-verification-contract.json', 'utf8'));
  const checks = contract.verified.find((entry) => entry.file === '20261018210000_volunteer_outcome_row_controls.sql').checks;

  for (const check of checks.filter((item) => item.kind === 'function')) {
    const evidence = JSON.parse(await sql(`select json_build_object('body',p.prosrc,'language',l.lanname,'result',pg_get_function_result(p.oid),'securityDefiner',p.prosecdef,'searchPath',p.proconfig[1],'serviceExecute',has_function_privilege('service_role',p.oid,'EXECUTE'),'private',not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE')) from pg_proc p join pg_language l on l.oid=p.prolang where p.oid='public.${check.name}(${check.argumentTypes})'::regprocedure`));
    const digest = createHash('sha256').update(evidence.body.replace(/\r\n/g, '\n').trim()).digest('hex');

    assert.equal(digest, check.bodySha256, `${check.name} body contract`);
    for (const key of ['language', 'result', 'securityDefiner', 'serviceExecute', 'private'])
      assert.equal(evidence[key], check[key], `${check.name} ${key} contract`);
    assert.equal(evidence.searchPath, `search_path=${check.searchPath}`);
  }

  async function control(id, action) {
    return JSON.parse(await sql(`set role service_role; select row_to_json(r) from public.control_volunteer_outcome_delivery('${campaign}','${id}','${action}','owner@example.test') r`));
  }
  async function claim() {
    return JSON.parse(await sql(`select coalesce(jsonb_agg(id),'[]'::jsonb) from public.claim_volunteer_follow_up_outcome('${campaign}',54,'${randomUUID()}','${lease}')`));
  }

  assert.equal((await control(legacy[0], 'hold')).block_reason, 'legacy_batch');
  assert.equal((await claim()).length, 2, 'legacy batch remains whole');
  await sql(`update public.volunteer_follow_up_outcome_batches set status='accepted',claim_token=null,claimed_until=null;
    update public.volunteer_follow_up_outcome_deliveries set status='accepted',claim_token=null,claimed_until=null;`);
  const ids = await queue(3, 'individual');

  assert.equal(ids.length, 3);
  assert.equal(await sql(`select count(distinct batch_id) from public.volunteer_follow_up_outcome_deliveries where individually_controlled`), '3');
  for (const id of ids) assert.equal((await control(id, 'hold')).changed, true);
  assert.deepEqual(await claim(), []);
  assert.equal((await control(ids[0], 'resume')).changed, true);
  assert.deepEqual(await claim(), [ids[0]]);
  assert.equal((await control(ids[0], 'hold')).block_reason, 'send_in_flight');
  await sql(`update public.volunteer_follow_up_outcome_batches set status='retrying',claim_token=null,claimed_until=null,attempt_count=2 where id=(select batch_id from public.volunteer_follow_up_outcome_deliveries where id='${ids[0]}');
    update public.volunteer_follow_up_outcome_deliveries set status='retrying',claim_token=null,claimed_until=null,attempt_count=2,next_attempt_at=now()+interval '1 hour' where id='${ids[0]}'`);
  const snapshotQuery = `select jsonb_build_array(payload,idempotency_key,batch_id,batch_idempotency_key,attempt_count,first_attempt_at,next_attempt_at)::text from public.volunteer_follow_up_outcome_deliveries where id='${ids[0]}'`;
  const before = await sql(snapshotQuery);

  assert.equal((await control(ids[0], 'hold')).changed, true);
  assert.equal((await control(ids[0], 'resume')).changed, true);
  assert.equal(await sql(snapshotQuery), before, 'resume preserves frozen payload, identity, counters and schedule');
  assert.equal((await control(ids[0], 'hold')).changed, true);
  await sql(`update public.volunteer_follow_up_outcome_deliveries set first_attempt_at=now()-interval '24 hours' where id='${ids[0]}'`);
  assert.equal((await control(ids[0], 'resume')).block_reason, 'idempotency_window_expired');
  assert.equal(await sql(`select held_at is not null from public.volunteer_follow_up_outcome_deliveries where id='${ids[0]}'`), 't');
  await sql(`update public.volunteer_follow_up_outcome_deliveries set status='failed',failure_certainty='definite',next_attempt_at=null where id='${ids[1]}'`);
  assert.equal(await sql(`select block_reason from public.queue_volunteer_follow_up_failed_delivery_retry('${campaign}','outcome','${ids[1]}')`), 'delivery_held');
  await sql(`update public.volunteer_follow_up_outcome_deliveries set attempt_count=4 where id='${ids[1]}'`);
  assert.equal((await control(ids[1], 'resume')).block_reason, 'attempt_limit_reached');
  await sql(`update public.volunteer_follow_up_campaigns set outcome_paused=true where id='${campaign}'`);
  assert.equal((await control(ids[2], 'resume')).changed, true);
  assert.deepEqual(await claim(), [], 'resume does not override global pause');
  await sql(`update public.volunteer_follow_up_campaigns set outcome_paused=false where id='${campaign}'`);
  // Both operations serialize under the campaign lock. Only one can win.
  const race = await Promise.all([control(ids[2], 'hold'), claim()]);

  assert.ok((race[0].changed && race[1].length === 0) || (race[0].block_reason === 'send_in_flight' && race[1][0] === ids[2]));
  await assert.rejects(() => sql(`set role authenticated; select * from public.control_volunteer_outcome_delivery('${campaign}','${ids[0]}','resume','attacker@example.test')`), /permission denied/);
  console.log('Outcome row controls: singleton creation, legacy preservation, holds, resume, retry window, quota pause, claim race and role boundaries passed.');
} finally {
  if (started) await run(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', 'stop']);
  rmSync(directory, { recursive: true, force: true });
}
