-- Run only against a disposable database after the speaker-update migrations.
begin;
do $$
declare
  edition uuid := gen_random_uuid(); proposal uuid := gen_random_uuid(); session_id uuid := gen_random_uuid();
  link_id uuid := gen_random_uuid(); campaign uuid := gen_random_uuid(); preview uuid := gen_random_uuid();
  expiry timestamptz := now() - interval '2 days'; items jsonb; prior jsonb; after_queue jsonb; n integer;
  rejected boolean;
begin
  insert into public.annual_conference_editions(id, year, name, label, task_creator_email)
    values (edition, 2198, 'Regression', 'Regression', 'test@example.test');
  insert into public.annual_conference_speaker_submissions(id, edition_id, speaker_name, speaker_email, title, topic, status, session_type, proposal_schema_version,
    decision_email_kind, decision_email_status, decision_email_sent_at, decision_email_recipient, decision_email_provider_id)
    values (proposal, edition, 'Test', 'queue@example.test', 'Test', 'Test', 'selected', '25-minute short talk', 1, 'acceptance', 'accepted', now(), 'queue@example.test', 'original-provider');
  insert into public.annual_conference_sessions(id, edition_id, speaker_submission_id, speaker_name, speaker_email, title, topic, session_type)
    values (session_id, edition, proposal, 'Test', 'queue@example.test', 'Test', 'Test', '25-minute short talk');
  insert into public.annual_conference_speaker_intake_links(id, edition_id, speaker_submission_id, token_hash, expires_at, workspace_session_id)
    values (link_id, edition, proposal, repeat('a', 64), expiry, session_id);
  update public.annual_conference_speaker_submissions set selected_intake_link_id = link_id, selected_session_id = session_id where id = proposal;
  select to_jsonb(s) into prior from public.annual_conference_speaker_submissions s where id = proposal;
  insert into public.annual_conference_speaker_updates(id, edition_id, subject, message) values (campaign, edition, 'Subject', 'Message');
  items := jsonb_build_array(jsonb_build_object('id', proposal, 'name', 'Test', 'recipient', 'queue@example.test', 'speaker_email', 'queue@example.test',
    'link_id', link_id, 'link_expires_at', expiry, 'key', 'queue-regression-key', 'provider_payload', jsonb_build_object('subject', 'frozen')));
  insert into public.annual_conference_speaker_update_previews(id, update_id, edition_id, actor_id, version, recipients, expires_at)
    values (preview, campaign, edition, 'owner', 1, items, now() + interval '10 minutes');

  rejected := false;
  begin perform public.queue_annual_conference_speaker_update(preview, campaign, edition, 'other'); exception when others then rejected := true; end;
  if not rejected then raise exception 'different actor accepted'; end if;

  update public.annual_conference_speaker_updates set version = 2 where id = campaign;
  rejected := false;
  begin perform public.queue_annual_conference_speaker_update(preview, campaign, edition, 'owner'); exception when others then rejected := true; end;
  if not rejected then raise exception 'changed draft accepted'; end if;
  update public.annual_conference_speaker_updates set version = 1 where id = campaign;

  update public.annual_conference_speaker_submissions set speaker_email = 'changed@example.test' where id = proposal;
  rejected := false;
  begin perform public.queue_annual_conference_speaker_update(preview, campaign, edition, 'owner'); exception when others then rejected := true; end;
  if not rejected then raise exception 'changed recipient accepted'; end if;
  update public.annual_conference_speaker_submissions set speaker_email = 'queue@example.test' where id = proposal;

  update public.annual_conference_speaker_intake_links set revoked_at = now() where id = link_id;
  rejected := false;
  begin perform public.queue_annual_conference_speaker_update(preview, campaign, edition, 'owner'); exception when others then rejected := true; end;
  if not rejected then raise exception 'revoked workspace accepted'; end if;
  update public.annual_conference_speaker_intake_links set revoked_at = null where id = link_id;
  update public.annual_conference_speaker_intake_links set expires_at = expiry + interval '1 day' where id = link_id;
  rejected := false;
  begin perform public.queue_annual_conference_speaker_update(preview, campaign, edition, 'owner'); exception when others then rejected := true; end;
  if not rejected then raise exception 'changed workspace accepted'; end if;
  update public.annual_conference_speaker_intake_links set expires_at = expiry where id = link_id;

  insert into public.annual_conference_email_suppressions(email, reason) values ('queue@example.test', 'test');
  rejected := false;
  begin perform public.queue_annual_conference_speaker_update(preview, campaign, edition, 'owner'); exception when others then rejected := true; end;
  if not rejected then raise exception 'suppressed address accepted'; end if;
  delete from public.annual_conference_email_suppressions where email = 'queue@example.test';

  n := public.queue_annual_conference_speaker_update(preview, campaign, edition, 'owner');
  if n <> 1 or public.queue_annual_conference_speaker_update(preview, campaign, edition, 'owner') <> 1 then raise exception 'queue or replay failed'; end if;
  if (select count(*) from public.annual_conference_speaker_update_deliveries where update_id = campaign) <> 1 then raise exception 'duplicate delivery'; end if;
  if (select recipients from public.annual_conference_speaker_update_previews where id = preview) <> '[]'::jsonb then raise exception 'used preview retained private payload'; end if;
  select to_jsonb(s) into after_queue from public.annual_conference_speaker_submissions s where id = proposal;
  -- Restoring the address above may update generic updated_at through existing triggers.
  if (prior - 'updated_at') is distinct from (after_queue - 'updated_at') then raise exception 'original acceptance changed'; end if;
end; $$;
rollback;
