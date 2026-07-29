create or replace function public.register_for_event(
  p_event_id uuid,
  p_name text,
  p_email text
)
returns public.event_registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign public.event_registration_campaigns;
  registration public.event_registrations;
  normalized_email_value text := lower(trim(p_email));
  confirmed_count integer;
  next_status public.event_registration_status;
begin
  select *
  into campaign
  from public.event_registration_campaigns
  where event_id = p_event_id
  for update;

  if campaign.id is null then
    raise exception using message = 'registration_unavailable';
  end if;

  if campaign.status <> 'open'
    or (campaign.opens_at is not null and campaign.opens_at > now())
    or (campaign.closes_at is not null and campaign.closes_at < now()) then
    raise exception using message = 'registration_closed';
  end if;

  select *
  into registration
  from public.event_registrations as existing_registration
  where existing_registration.campaign_id = campaign.id
    and existing_registration.normalized_email = normalized_email_value;

  if registration.id is not null and registration.status <> 'cancelled' then
    raise exception using message = 'registration_duplicate';
  end if;

  select count(*)
  into confirmed_count
  from public.event_registrations as confirmed_registration
  where confirmed_registration.campaign_id = campaign.id
    and confirmed_registration.status = 'confirmed';

  if campaign.auto_confirm and confirmed_count < campaign.capacity then
    next_status := 'confirmed';
  elsif campaign.waitlist_enabled then
    next_status := 'waitlisted';
  else
    raise exception using message = 'registration_full';
  end if;

  if registration.id is null then
    insert into public.event_registrations (
      campaign_id,
      name,
      email,
      normalized_email,
      status,
      confirmed_at
    ) values (
      campaign.id,
      trim(p_name),
      trim(p_email),
      normalized_email_value,
      next_status,
      case when next_status = 'confirmed' then now() else null end
    )
    returning * into registration;
  else
    update public.event_registrations
    set
      name = trim(p_name),
      email = trim(p_email),
      status = next_status,
      confirmed_at = case when next_status = 'confirmed' then now() else null end,
      cancelled_at = null
    where id = registration.id
    returning * into registration;

    delete from public.event_registration_checkins
    where registration_id = registration.id;
  end if;

  insert into public.registration_email_deliveries (
    registration_id,
    kind,
    status,
    attempts,
    idempotency_key,
    provider_id,
    last_error,
    last_attempt_at,
    accepted_at
  ) values (
    registration.id,
    'confirmation',
    'pending',
    0,
    'registration-confirmation-' || registration.id::text,
    null,
    null,
    null,
    null
  )
  on conflict (registration_id, kind) do update set
    status = 'pending',
    attempts = 0,
    provider_id = null,
    last_error = null,
    last_attempt_at = null,
    accepted_at = null;

  return registration;
end;
$$;

revoke all on function public.register_for_event(uuid, text, text) from public, anon, authenticated;
grant execute on function public.register_for_event(uuid, text, text) to service_role;
