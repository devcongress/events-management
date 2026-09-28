// Executable SQL regression checks for a disposable volunteer outcome database.
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

assert.equal(process.env.PGDATABASE, 'volunteer_outcomes_test');
assert.match(process.env.PGHOST ?? '', /^\/tmp\/volunteer-outcomes-postgres\./);

const sql = (query) => execFileSync('psql', [
  '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At',
], { input: query, encoding: 'utf8' }).trim();
const execFileAsync = promisify(execFile);
const sqlAsync = async (query) => {
  const { stdout } = await execFileAsync('psql', [
    '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query,
  ], { encoding: 'utf8', timeout: 10_000 });

  return stdout.trim();
};
const campaignId = sql("select id from public.volunteer_follow_up_campaigns where edition_year = 2026");

assert.match(campaignId, /^[a-f0-9-]{36}$/);

sql(`
begin;
delete from public.volunteer_follow_up_outcome_deliveries where campaign_id = '${campaignId}';
delete from public.volunteer_follow_up_outcome_previews where campaign_id = '${campaignId}';
delete from public.volunteer_follow_up_recipients where campaign_id = '${campaignId}';
delete from public.volunteer_follow_up_daily_claims where campaign_id = '${campaignId}';
update public.volunteer_follow_up_campaigns set status = 'running', outcome_paused = false,
  application_deadline_at = now() + interval '30 days', drain_lease_token = null, drain_lease_until = null
where id = '${campaignId}';
commit;
`);

const suffix = randomUUID();

sql(`insert into public.volunteer_follow_up_recipients (
  campaign_id, application_id, application_created_at, applicant_name, applicant_email,
  idempotency_key, submitted_at, motivation, can_attend_accra, decision, decision_version
) values ('${campaignId}', '${suffix}-1', now(), 'Ama One', '${suffix}-1@example.test',
  'invite/${suffix}-1', now(), 'I can help.', true, 'accepted', 1) returning id`);

const stalePreview = sql(`select preview_id from public.create_volunteer_follow_up_outcome_preview('${campaignId}', 'accepted', 'owner@example.test')`);

sql(`select public.save_volunteer_follow_up_outcome_preview_payloads('${stalePreview}', 'owner@example.test', (
  select jsonb_object_agg(r->>'recipient_id', jsonb_build_object(
    'from','events@example.test','to',jsonb_build_array(r->>'email'),
    'subject','test','html','<p>test</p>','text','test'
  )) from public.volunteer_follow_up_outcome_previews p,
    jsonb_array_elements(p.recipients) r where p.id='${stalePreview}'
))`);
sql(`insert into public.volunteer_follow_up_recipients (
  campaign_id, application_id, application_created_at, applicant_name, applicant_email,
  idempotency_key, submitted_at, motivation, can_attend_accra, decision, decision_version
) values ('${campaignId}', '${suffix}-2', now(), 'Ama Two', '${suffix}-2@example.test',
  'invite/${suffix}-2', now(), 'I can help.', true, 'accepted', 1);`);

const stale = sql(`do $$ declare payloads jsonb; begin
  begin
    perform * from public.confirm_volunteer_follow_up_outcome_preview('${stalePreview}', 'owner@example.test');
    raise exception using errcode = 'P0001', message = 'stale_preview_was_accepted';
  exception when sqlstate '40001' then null;
  end;
end $$; select 'stale_rejected';`);

assert.equal(stale, 'stale_rejected');
assert.equal(sql(`select count(*) from public.volunteer_follow_up_outcome_deliveries where campaign_id='${campaignId}'`), '0');

const previewId = sql(`select preview_id from public.create_volunteer_follow_up_outcome_preview('${campaignId}', 'accepted', 'owner@example.test')`);
const previewCount = sql(`select eligible_count from public.volunteer_follow_up_outcome_previews where id='${previewId}'`);

assert.equal(previewCount, '2');
sql(`select public.save_volunteer_follow_up_outcome_preview_payloads('${previewId}', 'owner@example.test', (
  select jsonb_object_agg(r->>'recipient_id', jsonb_build_object(
      'from','events@example.test','to',jsonb_build_array(r->>'email'),
      'subject','test','html','<p>test</p>','text','test'
    )) from public.volunteer_follow_up_outcome_previews p,
      jsonb_array_elements(p.recipients) r where p.id='${previewId}'
))`);
const confirm = (actor = 'owner@example.test') => sql(`select queued_count from public.confirm_volunteer_follow_up_outcome_preview('${previewId}', '${actor}')`);

assert.equal(confirm(), '2');
assert.equal(confirm(), '2', 'repeat confirmation returns the original delivery ids');
assert.equal(sql(`do $$ begin
  begin perform * from public.confirm_volunteer_follow_up_outcome_preview('${previewId}', 'other@example.test');
    raise exception using errcode = 'P0001', message = 'wrong_actor_confirmed_preview';
  exception when sqlstate '42501' then null;
  end;
end $$; select 'actor_rejected';`), 'actor_rejected');
assert.equal(sql(`select count(*) from public.volunteer_follow_up_outcome_deliveries where campaign_id='${campaignId}'`), '2');
assert.equal(sql(`select count(*) from public.claim_volunteer_follow_up_outcome('${campaignId}', 54, gen_random_uuid(), null)`), '0', 'claim fails closed without a drain lease');

const leaseToken = randomUUID();
const claimToken = randomUUID();

sql(`update public.volunteer_follow_up_campaigns set drain_lease_token='${leaseToken}', drain_lease_until=now()+interval '2 minutes' where id='${campaignId}'`);
const claimedId = sql(`select id from public.claim_volunteer_follow_up_outcome('${campaignId}', 54, '${claimToken}', '${leaseToken}')`);

assert.match(claimedId, /^[a-f0-9-]{36}$/);
const claimedRecipientId = sql(`select recipient_id from public.volunteer_follow_up_outcome_deliveries where id='${claimedId}'`);

assert.equal(sql(`select public.validate_volunteer_follow_up_outcome_send('${claimedId}','${claimToken}','${leaseToken}')`), 't');
assert.equal(sql(`select public.validate_volunteer_follow_up_outcome_send('${claimedId}','${claimToken}',gen_random_uuid())`), 'f');

const decisionChange = sql(`do $$ begin
  begin
    perform * from public.save_volunteer_follow_up_decision('${claimedRecipientId}', 1, 'not_selected', 'reviewed', '', 'owner@example.test');
    raise exception using errcode = 'P0001', message = 'decision_changed_after_claim';
  exception when sqlstate '55000' then null;
  end;
end $$; select 'decision_change_blocked';`);

assert.equal(decisionChange, 'decision_change_blocked');
const noteEdit = sql(`select decision_version from public.save_volunteer_follow_up_decision('${claimedRecipientId}', 1, 'accepted', 'reviewed', 'Reviewed by owner.', 'owner@example.test')`);

assert.equal(noteEdit, '1', 'note-only edit retains decision version while sending');

sql(`update public.volunteer_follow_up_outcome_deliveries set status='sending', claimed_until=null,
  first_attempt_at=now()-interval '1 minute', claim_token=null where id='${claimedId}';`);
const retryLeaseToken = randomUUID();

sql(`update public.volunteer_follow_up_campaigns set drain_lease_token='${retryLeaseToken}', drain_lease_until=now()+interval '2 minutes' where id='${campaignId}'`);
const recoveredId = sql(`select id from public.claim_volunteer_follow_up_outcome('${campaignId}', 54, gen_random_uuid(), '${retryLeaseToken}')`);

assert.equal(recoveredId, claimedId, 'an expired sending claim inside 23 hours can be reclaimed');
assert.equal(sql(`select attempt_count from public.volunteer_follow_up_outcome_deliveries where id='${claimedId}'`), '2');

sql(`update public.volunteer_follow_up_outcome_deliveries set status='sending', claimed_until=null,
  first_attempt_at=now()-interval '24 hours', claim_token=null where id='${claimedId}';`);
sql(`select * from public.claim_volunteer_follow_up_outcome('${campaignId}', 54, gen_random_uuid(), '${retryLeaseToken}')`);
assert.equal(sql(`select status from public.volunteer_follow_up_outcome_deliveries where id='${claimedId}'`), 'needs_attention', 'expired ambiguous provider result is not automatically retried');

// A manual Owner retry is only a queue transition for a definite, recent
// provider rejection. It preserves the frozen payload/key and is idempotent.
sql(`update public.volunteer_follow_up_outcome_deliveries set
  status='failed', provider_email_id=null, provider_event_at=null,
  first_attempt_at=now()-interval '1 hour', last_attempt_at=now()-interval '1 hour',
  next_attempt_at=null, claimed_until=null, claim_token=null, attempt_count=2,
  delivery_stage='provider_response', provider_http_status=422,
  failure_certainty='definite', diagnostic_at=now()
where id='${claimedId}';`);
const outcomeBeforeRetry = sql(`select idempotency_key || ':' || attempt_count || ':' || first_attempt_at::text
  from public.volunteer_follow_up_outcome_deliveries where id='${claimedId}'`);
const queuedOutcomeRetry = sql(`select queued::text || ':' || coalesce(block_reason, '')
  from public.queue_volunteer_follow_up_failed_delivery_retry('${campaignId}', 'outcome', '${claimedId}')`);

assert.equal(queuedOutcomeRetry, 'true:', 'a definite recent outcome rejection queues without sending');
assert.equal(
  sql(`select idempotency_key || ':' || attempt_count || ':' || first_attempt_at::text
    from public.volunteer_follow_up_outcome_deliveries where id='${claimedId}'`),
  outcomeBeforeRetry,
  'manual retry preserves the frozen outcome key and attempt history',
);
assert.equal(
  sql(`select queued::text || ':' || block_reason
    from public.queue_volunteer_follow_up_failed_delivery_retry('${campaignId}', 'outcome', '${claimedId}')`),
  'false:retry_already_scheduled',
  'a repeated click cannot queue a duplicate outcome retry',
);

const invitationId = sql(`insert into public.volunteer_follow_up_recipients (
  campaign_id, application_id, application_created_at, applicant_name, applicant_email,
  idempotency_key, status, attempt_count, first_attempt_at, last_attempt_at,
  delivery_stage, provider_http_status, failure_certainty
) values ('${campaignId}', '${suffix}-retry-invitation', now(), 'Ama Retry', '${suffix}-retry@example.test',
  'invite/${suffix}-retry', 'failed', 1, now()-interval '1 hour', now()-interval '1 hour',
  'provider_response', 422, 'definite') returning id`);
const invitationBeforeRetry = sql(`select idempotency_key || ':' || attempt_count || ':' || first_attempt_at::text
  from public.volunteer_follow_up_recipients where id='${invitationId}'`);

assert.equal(
  sql(`select queued::text || ':' || coalesce(block_reason, '')
    from public.queue_volunteer_follow_up_failed_delivery_retry('${campaignId}', 'invitation', '${invitationId}')`),
  'true:',
  'a definite recent invitation rejection queues with the original recipient record',
);
assert.equal(
  sql(`select idempotency_key || ':' || attempt_count || ':' || first_attempt_at::text
    from public.volunteer_follow_up_recipients where id='${invitationId}'`),
  invitationBeforeRetry,
  'manual invitation retry preserves its stable key and attempt history',
);
sql(`update public.volunteer_follow_up_recipients set provider_email_id='accepted-${suffix}',
  next_attempt_at=null where id='${invitationId}';`);
assert.equal(
  sql(`select queued::text || ':' || block_reason
    from public.queue_volunteer_follow_up_failed_delivery_retry('${campaignId}', 'invitation', '${invitationId}')`),
  'false:provider_acceptance_or_event',
  'provider acceptance blocks manual invitation resend',
);

const concurrentInvitationId = sql(`insert into public.volunteer_follow_up_recipients (
  campaign_id, application_id, application_created_at, applicant_name, applicant_email,
  idempotency_key, status, attempt_count, first_attempt_at, last_attempt_at,
  delivery_stage, provider_http_status, failure_certainty
) values ('${campaignId}', '${suffix}-concurrent-invitation', now(), 'Ama Concurrent', '${suffix}-concurrent@example.test',
  'invite/${suffix}-concurrent', 'failed', 1, now()-interval '1 hour', now()-interval '1 hour',
  'provider_response', 422, 'definite') returning id`);
const concurrentRetrySql = `select queued::text || ':' || coalesce(block_reason, '')
  from public.queue_volunteer_follow_up_failed_delivery_retry('${campaignId}', 'invitation', '${concurrentInvitationId}')`;
const concurrentResults = await Promise.all([
  sqlAsync(concurrentRetrySql),
  sqlAsync(concurrentRetrySql),
]);

assert.deepEqual(
  concurrentResults.sort(),
  ['false:retry_already_scheduled', 'true:'],
  'concurrent Owner clicks serialize to one queued invitation retry',
);

// Reclaiming or expiring an outcome claim must discard an older definite
// rejection: the provider may have accepted the reclaimed attempt before a
// worker crash, so manual retry must see an ambiguous result instead.
sql(`update public.volunteer_follow_up_outcome_deliveries set
  status='failed', provider_email_id=null, provider_event_at=null,
  first_attempt_at=now()-interval '1 hour', next_attempt_at=now(), claimed_until=null,
  attempt_count=2, delivery_stage='provider_response', provider_http_status=422,
  failure_certainty='definite', diagnostic_at=now()
where id='${claimedId}';`);
const reclaimedToken = randomUUID();
const reclaimedId = sql(`select id from public.claim_volunteer_follow_up_outcome(
  '${campaignId}', 54, '${reclaimedToken}', '${retryLeaseToken}')`);

assert.equal(reclaimedId, claimedId);
assert.equal(
  sql(`select coalesce(provider_http_status::text, 'null') || ':' || coalesce(failure_certainty, 'null')
    from public.volunteer_follow_up_outcome_deliveries where id='${claimedId}'`),
  'null:null',
  'a reclaimed outcome clears stale definite rejection evidence before its new provider attempt',
);
sql(`update public.volunteer_follow_up_outcome_deliveries set
  status='sending', first_attempt_at=now()-interval '24 hours', claimed_until=null, claim_token=null,
  delivery_stage='provider_response', provider_http_status=422, failure_certainty='definite'
where id='${claimedId}';`);
sql(`select * from public.claim_volunteer_follow_up_outcome('${campaignId}', 54, gen_random_uuid(), '${retryLeaseToken}')`);
assert.equal(
  sql(`select status || ':' || delivery_stage || ':' || coalesce(provider_http_status::text, 'null') || ':' || failure_certainty
    from public.volunteer_follow_up_outcome_deliveries where id='${claimedId}'`),
  'needs_attention:provider_request:null:ambiguous',
  'an expired outcome claim becomes ambiguous before any manual retry check',
);

sql(`update public.volunteer_follow_up_outcome_deliveries set
  status='failed', first_attempt_at=now()-interval '1 hour', next_attempt_at=null,
  claimed_until=null, provider_email_id=null, provider_event_at=null,
  failure_certainty='definite', payload=jsonb_build_object(
    'from','events@example.test','subject','test','html','<p>test</p>','text','test'
  )
where id='${claimedId}';`);
assert.equal(
  sql(`select queued::text || ':' || block_reason
    from public.queue_volunteer_follow_up_failed_delivery_retry('${campaignId}', 'outcome', '${claimedId}')`),
  'false:frozen_payload_invalid',
  'a frozen outcome payload without a recipient array fails closed',
);

console.log('Volunteer outcome database regressions passed (snapshot staleness, idempotent confirmation, actor and lease guards, decision locking, note edits, expired claim recovery, 23-hour ambiguity cutoff, and bounded manual retry guards).');
