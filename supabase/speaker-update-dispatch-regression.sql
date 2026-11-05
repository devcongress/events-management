-- Run only against a disposable database after the speaker-update migrations.
begin;
do $$
declare
  edition uuid := gen_random_uuid(); proposal uuid := gen_random_uuid(); session_id uuid := gen_random_uuid();
  link_id uuid := gen_random_uuid(); campaign uuid := gen_random_uuid(); delivery uuid := gen_random_uuid();
  claim1 uuid := gen_random_uuid(); claim2 uuid := gen_random_uuid(); expiry timestamptz := now() - interval '2 days';
  state text; n integer;
begin
  insert into public.annual_conference_editions(id, year, name, label, task_creator_email)
    values (edition, 2199, 'Regression', 'Regression', 'test@example.test');
  insert into public.annual_conference_speaker_submissions(id, edition_id, speaker_name, speaker_email, title, topic, status, session_type, proposal_schema_version,
    decision_email_kind, decision_email_status, decision_email_sent_at)
    values (proposal, edition, 'Test', 'test@example.test', 'Test', 'Test', 'selected', '25-minute short talk', 1, 'acceptance', 'accepted', now());
  insert into public.annual_conference_sessions(id, edition_id, speaker_submission_id, speaker_name, speaker_email, title, topic, session_type)
    values (session_id, edition, proposal, 'Test', 'test@example.test', 'Test', 'Test', '25-minute short talk');
  insert into public.annual_conference_speaker_intake_links(id, edition_id, speaker_submission_id, token_hash, expires_at, workspace_session_id)
    values (link_id, edition, proposal, repeat('a', 64), expiry, session_id);
  update public.annual_conference_speaker_submissions set selected_intake_link_id = link_id, selected_session_id = session_id where id = proposal;
  insert into public.annual_conference_speaker_updates(id, edition_id, subject, message, state) values (campaign, edition, 'Subject', 'Message', 'queued');
  insert into public.annual_conference_speaker_update_deliveries(id, update_id, submission_id, name, recipient, speaker_email, link_id, link_expires_at, provider_payload, idempotency_key)
    values (delivery, campaign, proposal, 'Test', 'test@example.test', 'test@example.test', link_id, expiry, '{}', 'regression-key');
  select count(*) into n from public.claim_annual_conference_speaker_updates(claim1, 1);
  if n <> 1 or not public.valid_annual_conference_speaker_update(delivery, claim1) then raise exception 'claim or validation failed'; end if;
  if (select u.state from public.annual_conference_speaker_updates u where u.id = campaign) <> 'queued' then raise exception 'sending update prematurely completed'; end if;
  select count(*) into n from public.claim_annual_conference_speaker_updates(claim2, 1);
  if n <> 0 or public.finish_annual_conference_speaker_update(delivery, claim2, 'provider-1') then raise exception 'lease ownership failed'; end if;
  update public.annual_conference_speaker_intake_links set revoked_at = now() where id = link_id;
  if public.valid_annual_conference_speaker_update(delivery, claim1) then raise exception 'revoked link accepted'; end if;
  update public.annual_conference_speaker_intake_links set revoked_at = null where id = link_id;
  update public.annual_conference_speaker_update_deliveries set claimed_until = now() - interval '1 minute' where id = delivery;
  select count(*) into n from public.claim_annual_conference_speaker_updates(claim2, 1);
  if n <> 1 or public.finish_annual_conference_speaker_update(delivery, claim1, 'provider-1') then raise exception 'expired lease reclaimed incorrectly'; end if;
  perform public.apply_annual_conference_speaker_update_event('early', 'provider-1', 'email.delivered', now());
  if not public.finish_annual_conference_speaker_update(delivery, claim2, 'provider-1') then raise exception 'finish failed'; end if;
  select status into state from public.annual_conference_speaker_update_deliveries where id = delivery;
  if state <> 'delivered' then raise exception 'early webhook reconciliation failed: %', state; end if;
  if (select u.state from public.annual_conference_speaker_updates u where u.id = campaign) <> 'complete' then raise exception 'terminal update did not complete'; end if;
  update public.annual_conference_speaker_updates set state = 'queued' where id = campaign;
  update public.annual_conference_speaker_update_deliveries set status = 'failed', next_attempt_at = now() where id = delivery;
  perform public.reconcile_annual_conference_speaker_updates(campaign);
  if (select u.state from public.annual_conference_speaker_updates u where u.id = campaign) <> 'queued' then raise exception 'retryable failure prematurely completed'; end if;
  update public.annual_conference_speaker_update_deliveries set next_attempt_at = 'infinity'::timestamptz where id = delivery;
  perform public.reconcile_annual_conference_speaker_updates(campaign);
  if (select u.state from public.annual_conference_speaker_updates u where u.id = campaign) <> 'complete' then raise exception 'terminal failure did not complete'; end if;
  perform public.apply_annual_conference_speaker_update_event('bounce', 'provider-1', 'email.bounced', now());
  perform public.apply_annual_conference_speaker_update_event('early', 'provider-1', 'email.delivered', now());
  select status into state from public.annual_conference_speaker_update_deliveries where id = delivery;
  if state <> 'bounced' or public.retry_annual_conference_speaker_update(campaign, delivery) then raise exception 'terminal state regressed'; end if;
  if not exists (select 1 from public.annual_conference_email_suppressions where email = 'test@example.test') then raise exception 'suppression missing'; end if;
end; $$;
rollback;
