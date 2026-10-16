-- Shared-database rehearsal: real capacity, tickets and queues, restricted recipients.
-- No data is deleted and no edition is automatically opened or put into testing.
create table public.annual_conference_registration_test_settings (
  edition_id uuid primary key references public.annual_conference_editions(id),
  enabled boolean not null default false,
  tester_emails text[] not null default '{}',
  updated_by_email text not null,
  updated_at timestamptz not null default now(),
  check (cardinality(tester_emails) <= 200)
);
alter table public.annual_conference_registration_test_settings enable row level security;
revoke all on public.annual_conference_registration_test_settings from public, anon, authenticated;
grant select on public.annual_conference_registration_test_settings to service_role;

alter table public.annual_conference_registrations add column is_test boolean not null default false;

create function public.get_annual_conference_registration_testing(p_edition_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('enabled', enabled, 'tester_emails', tester_emails)
    from public.annual_conference_registration_test_settings where edition_id = p_edition_id),
    '{"enabled":false,"tester_emails":[]}'::jsonb);
$$;

create function public.configure_annual_conference_registration_testing(
  p_edition_id uuid, p_enabled boolean, p_emails text[], p_actor text
)
returns void language plpgsql security definer set search_path = public as $$
declare normalized text[];
begin
  -- Same lock as allocation and mode changes; no partially applied allowlist.
  perform 1 from public.annual_conference_ticketing_settings where edition_id = p_edition_id for update;
  if not found then raise exception 'conference_settings_not_found'; end if;
  if p_enabled is null or p_emails is null or cardinality(p_emails) > 200
    or exists (select 1 from unnest(p_emails) e where e is null or position('*' in e) > 0 or length(btrim(e)) > 254
      or btrim(e) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'invalid_tester_emails';
  end if;
  select coalesce(array_agg(distinct lower(btrim(e)) order by lower(btrim(e))), '{}') into normalized from unnest(p_emails) e;
  insert into public.annual_conference_registration_test_settings(edition_id, enabled, tester_emails, updated_by_email)
    values (p_edition_id, p_enabled, normalized, lower(btrim(p_actor)))
    on conflict (edition_id) do update set enabled = excluded.enabled, tester_emails = excluded.tester_emails,
      updated_by_email = excluded.updated_by_email, updated_at = now();
end;
$$;

create function public.guard_annual_conference_registration_testing()
returns trigger language plpgsql security definer set search_path = public as $$
declare settings jsonb;
begin
  perform 1 from public.annual_conference_ticketing_settings where edition_id = new.edition_id for update;
  settings := public.get_annual_conference_registration_testing(new.edition_id);
  new.is_test := (settings->>'enabled')::boolean;
  if new.is_test and not (settings->'tester_emails' ? lower(btrim(new.email))) then
    raise exception 'conference_registration_not_available';
  end if;
  return new;
end;
$$;
create trigger guard_annual_conference_registration_testing before insert on public.annual_conference_registrations
  for each row execute function public.guard_annual_conference_registration_testing();

create function public.register_for_annual_conference_test(p_edition_id uuid, p_name text, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare settings jsonb;
begin
  perform 1 from public.annual_conference_ticketing_settings where edition_id = p_edition_id for update;
  settings := public.get_annual_conference_registration_testing(p_edition_id);
  if not (settings->>'enabled')::boolean or not (settings->'tester_emails' ? lower(btrim(p_email))) then
    raise exception 'conference_registration_not_available';
  end if;
  perform public.register_for_annual_conference(p_edition_id, p_name, p_email);
end;
$$;

create function public.annual_conference_email_allowed(p_kind text, p_id uuid, p_email text, p_testing_only boolean default false)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare edition uuid; recipient text; settings jsonb; rehearsal boolean;
begin
  if p_kind = 'admission' then
    select edition_id, recipient_email into edition, recipient from public.annual_conference_ticket_email_outbox where id = p_id;
  elsif p_kind = 'social' then
    select edition_id, recipient_email into edition, recipient from public.annual_conference_social_card_email_outbox where id = p_id;
  elsif p_kind = 'update' then
    select b.edition_id, d.recipient_email into edition, recipient from public.annual_conference_attendee_blast_deliveries d
      join public.annual_conference_attendee_blasts b on b.id = d.blast_id where d.id = p_id;
  end if;
  if edition is null or p_email is null or lower(btrim(recipient)) <> lower(btrim(p_email)) then return false; end if;
  settings := public.get_annual_conference_registration_testing(edition);
  if p_testing_only and (not (settings->>'enabled')::boolean
    or not exists(select 1 from public.annual_conference_editions where id = edition and year = 2026)) then return false; end if;
  select exists(select 1 from public.annual_conference_registrations
    where edition_id = edition and normalized_email = lower(btrim(recipient)) and is_test) into rehearsal;
  return (not (settings->>'enabled')::boolean and not rehearsal)
    or (settings->'tester_emails' ? lower(btrim(recipient)));
end;
$$;

-- A held message is not a provider failure. Preserve payload/idempotency, release
-- its lease and avoid exhausting attempts while an owner edits the allowlist.
create function public.hold_annual_conference_testing_email(p_kind text, p_id uuid, p_claim uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind = 'admission' then
    update public.annual_conference_ticket_email_outbox set status = 'queued', claim_token = null, claimed_until = null,
      attempt_count = greatest(0, attempt_count - 1), next_attempt_at = now() + interval '5 minutes',
      first_attempt_at = case when provider_payload is null then null else first_attempt_at end,
      last_error = 'Held by registration testing recipient policy.'
      where id = p_id and claim_token = p_claim and status = 'sending';
  elsif p_kind = 'social' then
    update public.annual_conference_social_card_email_outbox set status = 'queued', claim_token = null, claimed_until = null,
      attempt_count = greatest(0, attempt_count - 1), next_attempt_at = now() + interval '5 minutes',
      last_error = 'Held by registration testing recipient policy.'
      where id = p_id and claim_token = p_claim and status = 'sending';
  elsif p_kind = 'update' then
    update public.annual_conference_attendee_blast_deliveries set status = 'queued', claim_token = null, claimed_until = null,
      attempt_count = greatest(0, attempt_count - 1), next_attempt_at = now() + interval '5 minutes',
      first_attempt_at = case when provider_payload is null then null else first_attempt_at end
      where id = p_id and claim_token = p_claim and status = 'sending';
  end if;
end;
$$;

revoke all on function public.get_annual_conference_registration_testing(uuid) from public, anon, authenticated;
revoke all on function public.configure_annual_conference_registration_testing(uuid, boolean, text[], text) from public, anon, authenticated;
revoke all on function public.guard_annual_conference_registration_testing() from public, anon, authenticated;
revoke all on function public.register_for_annual_conference_test(uuid, text, text) from public, anon, authenticated;
revoke all on function public.annual_conference_email_allowed(text, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.hold_annual_conference_testing_email(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_annual_conference_registration_testing(uuid) to service_role;
grant execute on function public.configure_annual_conference_registration_testing(uuid, boolean, text[], text) to service_role;
grant execute on function public.register_for_annual_conference_test(uuid, text, text) to service_role;
grant execute on function public.annual_conference_email_allowed(text, uuid, text, boolean) to service_role;
grant execute on function public.hold_annual_conference_testing_email(text, uuid, uuid) to service_role;

-- Restrict claims as well as dispatch, including during rolling deployments.
create or replace function public.claim_annual_conference_ticket_email_outbox(p_claim_token uuid, p_limit integer default 20)
returns setof public.annual_conference_ticket_email_outbox
language plpgsql security definer set search_path = public as $$
begin
  if p_claim_token is null or p_limit not between 1 and 100 then raise exception 'ticket_email_claim_invalid'; end if;
  -- Serialize the policy snapshot with settings changes before leasing mail.
  perform 1 from public.annual_conference_ticketing_settings order by edition_id for update;
  -- Never retry beyond the provider idempotency window. Keep a visible terminal
  -- failure for an operator to reconcile; do not mint another admission silently.
  update public.annual_conference_ticket_email_outbox
    set status = 'failed', next_attempt_at = 'infinity', claim_token = null,
      claimed_until = null, last_error = 'Delivery requires operator reconciliation.'
    where status in ('queued', 'failed', 'sending') and provider_email_id is null
      and next_attempt_at <> 'infinity'::timestamptz
      and (claimed_until is null or claimed_until <= now())
      and (attempt_count >= 5 or first_attempt_at <= now() - interval '1 hour');
  return query with due as (
    select id from public.annual_conference_ticket_email_outbox
    where public.annual_conference_email_allowed('admission', id, recipient_email) and attempt_count < 5 and provider_email_id is null and accepted_at is null
      and (first_attempt_at is null or first_attempt_at > now() - interval '1 hour')
      and ((status in ('queued', 'failed') and next_attempt_at <= now())
        or (status = 'sending' and claimed_until <= now()))
    order by next_attempt_at, created_at limit p_limit for update skip locked
  ) update public.annual_conference_ticket_email_outbox o
    set status = 'sending', attempt_count = o.attempt_count + 1, claim_token = p_claim_token,
      claimed_until = now() + interval '10 minutes', first_attempt_at = coalesce(o.first_attempt_at, now()), last_error = null
    from due where o.id = due.id returning o.*;
end;
$$;

create or replace function public.claim_annual_conference_social_card_email_outbox(p_claim_token uuid, p_limit integer default 20)
returns setof public.annual_conference_social_card_email_outbox
language plpgsql security definer set search_path = public as $$
begin
  if p_claim_token is null or p_limit < 1 or p_limit > 100 then raise exception using message = 'social_card_email_claim_invalid'; end if;
  perform 1 from public.annual_conference_ticketing_settings order by edition_id for update;
  update public.annual_conference_social_card_email_outbox
    set status = 'failed', capability = '', last_error = 'Social-card email retry limit reached.',
        next_attempt_at = 'infinity', claim_token = null, claimed_until = null
    where attempt_count >= 5 and (
      (status in ('queued', 'failed') and next_attempt_at <= now())
      or (status = 'sending' and claimed_until <= now())
    );
  return query with due as (
    select id from public.annual_conference_social_card_email_outbox
    where public.annual_conference_email_allowed('social', id, recipient_email) and attempt_count < 5 and (
      (status in ('queued', 'failed') and next_attempt_at <= now())
      or (status = 'sending' and claimed_until <= now())
    )
    order by next_attempt_at, created_at limit p_limit for update skip locked
  ) update public.annual_conference_social_card_email_outbox outbox
    set status = 'sending', attempt_count = outbox.attempt_count + 1, claim_token = p_claim_token, claimed_until = now() + interval '10 minutes', last_error = null
    from due where outbox.id = due.id returning outbox.*;
end;
$$;

create or replace function public.claim_annual_conference_attendee_updates(p_claim uuid, p_limit integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare claimed jsonb;
begin
  if p_claim is null or p_limit not between 1 and 20 then raise exception 'conference_blast_claim_invalid'; end if;
  -- Only one draining batch at a time across editions; quota is checked before claiming.
  perform pg_advisory_xact_lock(hashtextextended('conference-attendee-updates', 0));
  perform 1 from public.annual_conference_ticketing_settings order by edition_id for update;
  if exists (select 1 from public.annual_conference_attendee_blast_deliveries where status = 'sending' and claimed_until > now()) then return '[]'::jsonb; end if;
  update public.annual_conference_attendee_blast_deliveries d
    set status = 'suppressed', provider_payload = null, claim_token = null, claimed_until = null
    from public.annual_conference_attendee_blasts b
    where b.id = d.blast_id and d.status in ('queued', 'failed', 'sending')
      and not exists (select 1 from public.annual_conference_update_audience(b.edition_id) a where a.email = d.recipient_email);
  update public.annual_conference_attendee_blast_deliveries
    set status = 'failed', next_attempt_at = 'infinity', provider_payload = null, claim_token = null, claimed_until = null
    where status in ('queued', 'failed', 'sending') and provider_email_id is null
      and (attempt_count >= 5 or first_attempt_at <= now() - interval '1 hour');
  with due as (
    select d.id from public.annual_conference_attendee_blast_deliveries d
      join public.annual_conference_attendee_blasts b on b.id = d.blast_id
    where public.annual_conference_email_allowed('update', d.id, d.recipient_email) and b.status = 'queued' and d.attempt_count < 5 and d.provider_email_id is null
      and (d.first_attempt_at is null or d.first_attempt_at > now() - interval '1 hour')
      and ((d.status in ('queued', 'failed') and d.next_attempt_at <= now()) or (d.status = 'sending' and d.claimed_until <= now()))
    order by b.created_at, d.id limit p_limit for update of d skip locked
  ), updated as (
    update public.annual_conference_attendee_blast_deliveries d
      set status = 'sending', attempt_count = d.attempt_count + 1, claim_token = p_claim,
        claimed_until = now() + interval '10 minutes', first_attempt_at = coalesce(d.first_attempt_at, now())
      from due where d.id = due.id returning d.*
  ) select coalesce(jsonb_agg(to_jsonb(u) || jsonb_build_object('subject', b.subject, 'body', b.body)), '[]'::jsonb)
    into claimed from updated u join public.annual_conference_attendee_blasts b on b.id = u.blast_id;
  return claimed;
end;
$$;
