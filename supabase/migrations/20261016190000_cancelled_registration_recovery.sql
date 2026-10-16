-- Explicit organizer recovery preserves cancelled registrations and their credentials.
-- Public duplicate submissions still cannot reactivate an existing email.
alter table public.annual_conference_registrations
  drop constraint annual_conference_registrations_edition_id_normalized_email_key,
  add column recovered_from_id uuid,
  add constraint conference_registration_recovery_once unique (recovered_from_id),
  add constraint conference_registration_recovery_source foreign key (recovered_from_id, edition_id)
    references public.annual_conference_registrations(id, edition_id),
  add constraint conference_registration_recovery_not_self check (recovered_from_id <> id);

create unique index conference_registration_active_email
  on public.annual_conference_registrations (edition_id, normalized_email)
  where status in ('confirmed', 'waitlisted');

create function public.recover_annual_conference_registration(p_edition_id uuid, p_registration_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  settings public.annual_conference_ticketing_settings;
  source public.annual_conference_registrations;
  recovered public.annual_conference_registrations;
  testing jsonb;
  next_status text;
begin
  select * into settings from public.annual_conference_ticketing_settings where edition_id = p_edition_id for update;
  select * into source from public.annual_conference_registrations
    where id = p_registration_id and edition_id = p_edition_id for update;
  if source.id is null then raise exception 'conference_recovery_unavailable'; end if;

  -- A repeated action must never create another registration, even after closure
  -- or subsequent cancellation. Recover that newer cancelled row explicitly.
  select * into recovered from public.annual_conference_registrations where recovered_from_id = source.id;
  if recovered.id is not null then
    return jsonb_build_object('registration_id', recovered.id, 'status', recovered.status, 'created', false);
  end if;
  if source.status <> 'cancelled' then raise exception 'conference_recovery_requires_cancelled'; end if;
  if settings.edition_id is null or settings.public_mode <> 'free' or settings.sales_status <> 'open' then
    raise exception 'conference_registration_closed';
  end if;

  testing := public.get_annual_conference_registration_testing(p_edition_id);
  if source.is_test and not (testing->>'enabled')::boolean then
    raise exception 'conference_recovery_testing_disabled';
  end if;
  if (testing->>'enabled')::boolean and not (testing->'tester_emails' ? source.normalized_email) then
    raise exception 'conference_recovery_tester_not_allowed';
  end if;
  if exists (select 1 from public.annual_conference_registrations
    where edition_id = p_edition_id and normalized_email = source.normalized_email and status <> 'cancelled') then
    raise exception 'conference_recovery_active_registration';
  end if;

  perform public.promote_annual_conference_waitlist(p_edition_id);
  next_status := case when public.annual_conference_reserved_seats(p_edition_id) < settings.public_capacity
    then 'confirmed' else 'waitlisted' end;
  insert into public.annual_conference_registrations (edition_id, name, email, status, confirmed_at, recovered_from_id)
    values (p_edition_id, source.name, source.email, next_status,
      case when next_status = 'confirmed' then now() else null end, source.id)
    returning * into recovered;

  if next_status = 'confirmed' then
    perform public.issue_annual_conference_registration_ticket(recovered.id);
  else
    insert into public.annual_conference_ticket_email_outbox (
      edition_id, registration_id, kind, recipient_name, recipient_email, idempotency_key
    ) values (p_edition_id, recovered.id, 'waitlist_notice', recovered.name, recovered.email,
      'conference-registration-waitlist:' || recovered.id);
  end if;

  return jsonb_build_object('registration_id', recovered.id, 'status', recovered.status, 'created', true);
end;
$$;

revoke all on function public.recover_annual_conference_registration(uuid, uuid) from public, anon, authenticated;
grant execute on function public.recover_annual_conference_registration(uuid, uuid) to service_role;
