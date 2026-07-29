update public.event_registration_campaigns
set
  auto_confirm = true,
  waitlist_enabled = true
where not auto_confirm or not waitlist_enabled;

alter table public.event_registration_campaigns
  drop constraint if exists event_registration_campaigns_automatic_allocation;

alter table public.event_registration_campaigns
  add constraint event_registration_campaigns_automatic_allocation
  check (auto_confirm and waitlist_enabled);

alter table public.registration_email_deliveries
  drop constraint if exists registration_email_deliveries_kind_check;

alter table public.registration_email_deliveries
  add constraint registration_email_deliveries_kind_check
  check (kind in ('confirmation', 'promotion'));

create or replace function public.cancel_registration_and_promote(
  p_registration_id uuid
)
returns table (
  cancelled boolean,
  promoted_registration_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_campaign_id uuid;
  target_status public.event_registration_status;
  promoted_id uuid;
  action_at timestamptz := now();
begin
  cancelled := false;
  promoted_registration_id := null;

  select registration.campaign_id
  into target_campaign_id
  from public.event_registrations as registration
  where registration.id = p_registration_id;

  if target_campaign_id is null then
    return next;
    return;
  end if;

  perform 1
  from public.event_registration_campaigns as campaign
  where campaign.id = target_campaign_id
  for update;

  select registration.status
  into target_status
  from public.event_registrations as registration
  where registration.id = p_registration_id
    and registration.campaign_id = target_campaign_id
  for update;

  if target_status is null or target_status = 'cancelled' then
    return next;
    return;
  end if;

  update public.event_registrations
  set
    status = 'cancelled',
    cancelled_at = action_at
  where id = p_registration_id;

  cancelled := true;

  if target_status = 'confirmed' then
    select registration.id
    into promoted_id
    from public.event_registrations as registration
    where registration.campaign_id = target_campaign_id
      and registration.status = 'waitlisted'
    order by registration.created_at asc, registration.id asc
    limit 1
    for update;

    if promoted_id is not null then
      update public.event_registrations
      set
        status = 'confirmed',
        confirmed_at = action_at,
        cancelled_at = null
      where id = promoted_id;

      delete from public.registration_email_deliveries
      where registration_id = promoted_id
        and kind = 'confirmation'
        and status in ('pending', 'failed');

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
        promoted_id,
        'promotion',
        'pending',
        0,
        'registration-promotion-' || promoted_id::text || '-' || to_char(action_at, 'YYYYMMDDHH24MISSUS'),
        null,
        null,
        null,
        null
      )
      on conflict (registration_id, kind) do update set
        status = 'pending',
        attempts = 0,
        idempotency_key = excluded.idempotency_key,
        provider_id = null,
        last_error = null,
        last_attempt_at = null,
        accepted_at = null;

      promoted_registration_id := promoted_id;
    end if;
  end if;

  return next;
end;
$$;

revoke all on function public.cancel_registration_and_promote(uuid) from public, anon, authenticated;
grant execute on function public.cancel_registration_and_promote(uuid) to service_role;

comment on function public.cancel_registration_and_promote(uuid) is
  'Atomically cancels a registration, promotes the oldest waitlisted guest when a confirmed place opens, and queues one promotion email.';
