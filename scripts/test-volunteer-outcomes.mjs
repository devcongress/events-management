// Executable SQL regression checks for a disposable volunteer outcome database.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

assert.equal(process.env.PGDATABASE, 'volunteer_outcomes_test');
assert.match(process.env.PGHOST ?? '', /^\/tmp\/volunteer-outcomes-postgres\./);

const sql = (query) => execFileSync('psql', [
  '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At',
], { input: query, encoding: 'utf8' }).trim();
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

console.log('Volunteer outcome database regressions passed (snapshot staleness, idempotent confirmation, actor and lease guards, decision locking, note edits, expired claim recovery, and 23-hour ambiguity cutoff).');
