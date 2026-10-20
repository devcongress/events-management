-- Run ONLY against a disposable database after the sandbox session table and
-- 20261013180000 and 20261020120000 migrations exist. Fixtures and assertions
-- roll back together.
begin;

do $$
declare
  v_session uuid;
  v_claim uuid := gen_random_uuid();
  v_other_claim uuid := gen_random_uuid();
  v_delivery public.devcon26_test_checkout_email_outbox;
  v_payload jsonb;
  v_result jsonb;
  v_count integer;
begin
  if exists (select 1 from public.devcon26_test_checkout_email_outbox) then
    raise exception 'Use a disposable empty test database';
  end if;

  insert into public.devcon26_test_checkout_sessions
    (id, checkout_request_key, payment_reference, status, purchaser_email, purchaser_name,
      tier_key, quantity, amount_minor, base_amount_minor)
  values (gen_random_uuid(), gen_random_uuid(), 'devcon26-test-' || replace(gen_random_uuid()::text, '-', ''),
    'initialized', 'fixture@example.test', 'Fixture', 'regular', 1, 19999, 19999)
  returning id into v_session;

  update public.devcon26_test_checkout_sessions set status = 'rejected' where id = v_session;
  assert not exists (select 1 from public.devcon26_test_checkout_email_outbox), 'rejected payment queued';
  update public.devcon26_test_checkout_sessions set status = 'refund_required' where id = v_session;
  assert not exists (select 1 from public.devcon26_test_checkout_email_outbox), 'refund queued';
  update public.devcon26_test_checkout_sessions set status = 'verified' where id = v_session;
  update public.devcon26_test_checkout_sessions set status = 'verified' where id = v_session;
  select count(*) into v_count from public.devcon26_test_checkout_email_outbox;
  assert v_count = 1, 'verification replay duplicated email';

  select * into strict v_delivery from public.claim_devcon26_test_checkout_emails(v_claim);
  assert v_delivery.attempt_count = 1 and v_delivery.status = 'sending', 'claim failed';
  select count(*) into v_count from public.claim_devcon26_test_checkout_emails(v_other_claim);
  assert v_count = 0, 'active lease was stolen';
  assert not public.finish_devcon26_test_checkout_email(v_delivery.id, v_other_claim, 'suppressed'), 'wrong token finalized';

  v_payload := jsonb_build_object('from', 'test@example.test', 'to', jsonb_build_array('fixture@example.test'),
    'reply_to', 'reply@example.test', 'subject', '[TEST] Fixture', 'text', 'TEST ONLY', 'html', '<p>TEST ONLY</p>');
  v_result := public.freeze_devcon26_test_checkout_email(v_delivery.id, v_claim, v_payload);
  assert v_result = v_payload, 'payload not frozen';
  v_result := public.freeze_devcon26_test_checkout_email(v_delivery.id, v_claim, v_payload || '{"subject":"[TEST] Changed"}');
  assert v_result = v_payload, 'frozen payload mutated';
  assert public.finish_devcon26_test_checkout_email(v_delivery.id, v_claim, 'failed'), 'failure not recorded';
  select count(*) into v_count from public.claim_devcon26_test_checkout_emails(v_other_claim);
  assert v_count = 0, 'retry delay ignored';

  update public.devcon26_test_checkout_email_outbox set next_attempt_at = now() - interval '1 minute';
  select * into strict v_delivery from public.claim_devcon26_test_checkout_emails(v_other_claim);
  assert v_delivery.attempt_count = 2 and v_delivery.provider_payload = v_payload, 'retry payload changed';
  assert not public.finish_devcon26_test_checkout_email(v_delivery.id, v_claim, 'accepted', 'stale'), 'old claim finalized';
  assert public.finish_devcon26_test_checkout_email(v_delivery.id, v_other_claim, 'accepted', 'provider-fixture'), 'acceptance failed';
  select count(*) into v_count from public.claim_devcon26_test_checkout_emails(v_claim);
  assert v_count = 0, 'accepted message reclaimed';

  -- Simulate expired attempts/leases directly only inside this synthetic fixture.
  update public.devcon26_test_checkout_email_outbox set status = 'sending', attempt_count = 5,
    lease_until = now() - interval '1 minute', next_attempt_at = now() - interval '1 minute';
  perform public.claim_devcon26_test_checkout_emails(v_claim);
  assert (select status = 'needs_attention' from public.devcon26_test_checkout_email_outbox), 'attempt limit ignored';
  update public.devcon26_test_checkout_email_outbox set status = 'failed', attempt_count = 1,
    first_attempt_at = now() - interval '61 minutes';
  perform public.claim_devcon26_test_checkout_emails(v_claim);
  assert (select status = 'needs_attention' from public.devcon26_test_checkout_email_outbox), 'retry window ignored';

  assert not has_table_privilege('anon', 'public.devcon26_test_checkout_email_outbox', 'SELECT'), 'anon reads outbox';
  assert not has_table_privilege('authenticated', 'public.devcon26_test_checkout_email_outbox', 'SELECT'), 'authenticated reads outbox';
  assert not has_function_privilege('anon', 'public.claim_devcon26_test_checkout_emails(uuid)', 'EXECUTE'), 'anon claims';
  assert not has_function_privilege('authenticated', 'public.finish_devcon26_test_checkout_email(uuid,uuid,text,text)', 'EXECUTE'), 'authenticated finalizes';
  assert has_function_privilege('service_role', 'public.claim_devcon26_test_checkout_emails(uuid)', 'EXECUTE'), 'service cannot claim';
end;
$$;

rollback;

begin;

-- Preview authorization is immutable session evidence and is copied to the
-- outbox only after a verified sandbox payment.
do $$
declare
  v_legacy public.devcon26_test_checkout_sessions;
  v_preview public.devcon26_test_checkout_sessions;
  v_request_key uuid := gen_random_uuid();
  v_preview_origin text := 'https://feature-checkout.example.test';
  v_rejected boolean := false;
begin
  select * into v_legacy from public.prepare_devcon26_test_checkout(
    gen_random_uuid(), 'regular', 'Legacy Fixture', 'legacy@example.test', null, null
  );
  assert v_legacy.preview_email_authorized_origin is null, 'legacy session gained preview authorization';
  assert v_legacy.preview_email_authorized_until is null, 'legacy session gained preview deadline';

  select * into v_preview from public.prepare_devcon26_test_checkout(
    v_request_key, 'regular', 'Preview Fixture', 'unknown-tester@example.test', null, v_preview_origin
  );
  assert v_preview.preview_email_authorized_origin = v_preview_origin, 'preview authorization was not stored';
  assert v_preview.preview_email_authorized_until > now()
    and v_preview.preview_email_authorized_until <= now() + interval '1 hour',
    'preview authorization deadline was not bounded';

  begin
    perform public.prepare_devcon26_test_checkout(
      v_request_key, 'regular', 'Preview Fixture', 'unknown-tester@example.test', null,
      'https://other.example.test'
    );
  exception when others then
    v_rejected := sqlerrm like '%test_checkout_cart_conflict%';
  end;
  assert v_rejected, 'retry changed preview authorization';

  v_rejected := false;
  begin
    perform public.prepare_devcon26_test_checkout(
      gen_random_uuid(), 'regular', 'Invalid Fixture', 'invalid@example.test', null,
      'https://*.example.test'
    );
  exception when others then
    v_rejected := sqlerrm like '%test_checkout_invalid_preview_email_origin%';
  end;
  assert v_rejected, 'unsafe preview origin was accepted';

  v_rejected := false;
  begin
    update public.devcon26_test_checkout_sessions
      set preview_email_authorized_origin = 'https://other.example.test'
      where id = v_preview.id;
  exception when others then
    v_rejected := sqlerrm like '%test_checkout_terms_immutable%';
  end;
  assert v_rejected, 'preview authorization was mutable';

  v_rejected := false;
  begin
    update public.devcon26_test_checkout_sessions
      set preview_email_authorized_until = now() + interval '2 hours'
      where id = v_preview.id;
  exception when others then
    v_rejected := sqlerrm like '%test_checkout_terms_immutable%';
  end;
  assert v_rejected, 'preview authorization deadline was mutable';

  update public.devcon26_test_checkout_sessions set status = 'verified'
    where id in (v_legacy.id, v_preview.id);
  assert (select preview_email_authorized_origin is null
      and preview_email_authorized_until is null
    from public.devcon26_test_checkout_email_outbox where session_id = v_legacy.id),
    'legacy outbox gained preview authorization';
  assert (select preview_email_authorized_origin = v_preview_origin
      and preview_email_authorized_until = v_preview.preview_email_authorized_until
    from public.devcon26_test_checkout_email_outbox where session_id = v_preview.id),
    'preview authorization was not copied to outbox';

  -- Simulate a scheduler backlog only inside this synthetic fixture.
  update public.devcon26_test_checkout_email_outbox
    set preview_email_authorized_until = now() - interval '1 minute'
    where session_id = v_preview.id;
  perform public.claim_devcon26_test_checkout_emails(gen_random_uuid());
  assert (select status = 'suppressed'
    from public.devcon26_test_checkout_email_outbox where session_id = v_preview.id),
    'expired preview email was claimed instead of suppressed';
end;
$$;

rollback;

begin;

-- Exercise the existing durable payment confirmation RPC as well as the trigger.
do $$
declare
  v_id uuid := gen_random_uuid();
  v_ref text := 'devcon26-test-' || replace(v_id::text, '-', '');
  v_count integer;
begin
  insert into public.devcon26_test_checkout_sessions
    (id, checkout_request_key, payment_reference, status, purchaser_email, purchaser_name,
      tier_key, quantity, amount_minor, base_amount_minor)
  values (v_id, gen_random_uuid(), v_ref, 'initialized', 'fixture@example.test', 'Fixture',
    'regular', 1, 19999, 19999);

  perform public.confirm_devcon26_test_checkout(v_ref, 'fixture-event', 19999, 'GHS', 'test', 'success', repeat('a', 64));
  perform public.confirm_devcon26_test_checkout(v_ref, 'fixture-event', 19999, 'GHS', 'test', 'success', repeat('a', 64));
  select count(*) into v_count from public.devcon26_test_checkout_email_outbox where session_id = v_id;
  assert v_count = 1, 'confirmed payment did not queue exactly once';
end;
$$;

rollback;
