-- Independent delivery leases and provider receipts for speaker updates.
begin;

create table public.annual_conference_speaker_update_events (
  webhook_id text primary key,
  provider_id text not null,
  event_type text not null,
  event_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.annual_conference_speaker_update_events enable row level security;
revoke all on public.annual_conference_speaker_update_events from public, anon, authenticated;
grant select, insert on public.annual_conference_speaker_update_events to service_role;

create function public.valid_annual_conference_speaker_update(p_id uuid, p_claim uuid)
returns boolean language sql security definer set search_path = '' as $$
  select exists (
    select 1 from public.annual_conference_speaker_update_deliveries d
    join public.annual_conference_speaker_updates u on u.id = d.update_id
    join public.annual_conference_speaker_submissions s on s.id = d.submission_id and s.edition_id = u.edition_id
    join public.annual_conference_speaker_intake_links l on l.id = d.link_id
    where d.id = p_id and d.status = 'sending' and d.claim_token = p_claim
      and d.claimed_until > now() + interval '30 seconds'
      and d.first_attempt_at > now() - interval '22 hours 59 minutes'
      and s.status = 'selected' and s.decision_email_kind = 'acceptance'
      and s.decision_email_sent_at is not null and s.decision_email_status in ('accepted', 'delivered', 'delayed')
      and lower(btrim(coalesce(s.decision_email_recipient, s.speaker_email))) = d.recipient
      and lower(btrim(s.speaker_email)) = d.speaker_email
      and s.selected_intake_link_id = d.link_id and l.speaker_submission_id = s.id
      and l.edition_id = u.edition_id and l.workspace_session_id = s.selected_session_id
      and l.revoked_at is null and l.expires_at = d.link_expires_at
      and not exists (select 1 from public.annual_conference_email_suppressions x where x.email = d.recipient)
  );
$$;

create function public.reconcile_annual_conference_speaker_updates(p_update_id uuid default null)
returns void language sql security definer set search_path = '' as $$
  update public.annual_conference_speaker_updates u set state = 'complete', updated_at = now()
  where u.state = 'queued' and (p_update_id is null or u.id = p_update_id)
    and exists (select 1 from public.annual_conference_speaker_update_deliveries d where d.update_id = u.id)
    and not exists (select 1 from public.annual_conference_speaker_update_deliveries d
      where d.update_id = u.id and (d.status in ('queued', 'sending')
        or (d.status = 'failed' and d.next_attempt_at <> 'infinity'::timestamptz
          and d.attempt_count < 5 and d.first_attempt_at > now() - interval '23 hours')));
$$;

create function public.claim_annual_conference_speaker_updates(p_claim uuid, p_limit integer)
returns setof public.annual_conference_speaker_update_deliveries language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('speaker_update_dispatch'));
  update public.annual_conference_speaker_update_deliveries set status = 'failed',
    claim_token = null, claimed_until = null, next_attempt_at = 'infinity'::timestamptz,
    last_error = 'Provider result unconfirmed; inspect delivery before any manual action.', updated_at = now()
    where status = 'sending' and claimed_until <= now()
      and (attempt_count >= 5 or first_attempt_at <= now() - interval '23 hours');
  perform public.reconcile_annual_conference_speaker_updates();
  return query with candidates as (
    select d.id from public.annual_conference_speaker_update_deliveries d
    where d.status in ('queued', 'failed', 'sending') and d.attempt_count < 5
      and (d.first_attempt_at is null or d.first_attempt_at > now() - interval '23 hours')
      and d.next_attempt_at <= now() and (d.claimed_until is null or d.claimed_until <= now())
    order by d.created_at, d.id for update skip locked
    limit greatest(0, least(p_limit, 10) - (select count(*)::integer from public.annual_conference_speaker_update_deliveries where status = 'sending' and claimed_until > now()))
  ) update public.annual_conference_speaker_update_deliveries d
    set status = 'sending', claim_token = p_claim, claimed_until = now() + interval '5 minutes',
      attempt_count = d.attempt_count + 1, first_attempt_at = coalesce(d.first_attempt_at, now()),
      last_attempt_at = now(), updated_at = now()
    from candidates where d.id = candidates.id returning d.*;
end; $$;

create function public.finish_annual_conference_speaker_update(p_id uuid, p_claim uuid, p_provider_id text default null, p_error text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare campaign_id uuid;
begin
  if p_provider_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('speaker_update_provider:' || p_provider_id, 0));
  end if;
  update public.annual_conference_speaker_update_deliveries d set
    status = case when p_provider_id is not null then 'accepted' else 'failed' end,
    provider_id = coalesce(p_provider_id, d.provider_id), last_error = p_error,
    next_attempt_at = case when p_error = 'Recipient or workspace changed' then 'infinity'::timestamptz else now() + interval '5 minutes' end,
    claim_token = null, claimed_until = null, updated_at = now()
  where d.id = p_id and d.status = 'sending' and d.claim_token = p_claim and d.claimed_until > now()
  returning d.update_id into campaign_id;
  if not found then return false; end if;
  if p_provider_id is not null then
    update public.annual_conference_speaker_update_deliveries d set
      status = case when exists (select 1 from public.annual_conference_speaker_update_events e where e.provider_id = p_provider_id and e.event_type = 'email.complained') then 'complained'
        when exists (select 1 from public.annual_conference_speaker_update_events e where e.provider_id = p_provider_id and e.event_type = 'email.bounced') then 'bounced'
        when exists (select 1 from public.annual_conference_speaker_update_events e where e.provider_id = p_provider_id and e.event_type = 'email.suppressed') then 'suppressed'
        when exists (select 1 from public.annual_conference_speaker_update_events e where e.provider_id = p_provider_id and e.event_type = 'email.delivered') then 'delivered'
        when exists (select 1 from public.annual_conference_speaker_update_events e where e.provider_id = p_provider_id and e.event_type = 'email.failed') then 'failed' else d.status end,
      next_attempt_at = 'infinity'::timestamptz
      where d.id = p_id;
    insert into public.annual_conference_email_suppressions (email, reason)
      select d.recipient, case when d.status = 'complained' then 'email.complained' when d.status = 'suppressed' then 'email.suppressed' else 'email.bounced' end
      from public.annual_conference_speaker_update_deliveries d where d.id = p_id and d.status in ('bounced', 'complained', 'suppressed')
      on conflict (email) do update set reason = excluded.reason;
  end if;
  perform public.reconcile_annual_conference_speaker_updates(campaign_id);
  return true;
end; $$;

create function public.apply_annual_conference_speaker_update_event(p_webhook_id text, p_provider_id text, p_type text, p_at timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
declare matched boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('speaker_update_provider:' || p_provider_id, 0));
  insert into public.annual_conference_speaker_update_events (webhook_id, provider_id, event_type, event_at)
    values (p_webhook_id, p_provider_id, p_type, p_at) on conflict (webhook_id) do nothing;
  update public.annual_conference_speaker_update_deliveries set
    status = case when status = 'complained' then status when p_type = 'email.complained' then 'complained'
      when status = 'bounced' then status when p_type = 'email.bounced' then 'bounced'
      when status = 'suppressed' then status when p_type = 'email.suppressed' then 'suppressed'
      when p_type = 'email.delivered' then 'delivered'
      when p_type = 'email.failed' and status <> 'delivered' then 'failed' else status end,
    next_attempt_at = 'infinity'::timestamptz, updated_at = now()
    where provider_id = p_provider_id;
  matched := found;
  if matched and p_type in ('email.bounced', 'email.complained', 'email.suppressed') then
    insert into public.annual_conference_email_suppressions (email, reason)
      select recipient, p_type from public.annual_conference_speaker_update_deliveries where provider_id = p_provider_id
      on conflict (email) do update set reason = excluded.reason;
  end if;
  return matched;
end; $$;

create function public.retry_annual_conference_speaker_update(p_update_id uuid, p_delivery_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.annual_conference_speaker_update_deliveries set next_attempt_at = now(), updated_at = now()
    where id = p_delivery_id and update_id = p_update_id and status = 'failed'
      and next_attempt_at <> 'infinity'::timestamptz and attempt_count < 5
      and first_attempt_at > now() - interval '23 hours' and (claimed_until is null or claimed_until <= now());
  return found;
end; $$;

revoke all on function public.reconcile_annual_conference_speaker_updates(uuid), public.valid_annual_conference_speaker_update(uuid,uuid), public.claim_annual_conference_speaker_updates(uuid,integer), public.finish_annual_conference_speaker_update(uuid,uuid,text,text), public.apply_annual_conference_speaker_update_event(text,text,text,timestamptz), public.retry_annual_conference_speaker_update(uuid,uuid) from public, anon, authenticated;
grant execute on function public.reconcile_annual_conference_speaker_updates(uuid), public.valid_annual_conference_speaker_update(uuid,uuid), public.claim_annual_conference_speaker_updates(uuid,integer), public.finish_annual_conference_speaker_update(uuid,uuid,text,text), public.apply_annual_conference_speaker_update_event(text,text,text,timestamptz), public.retry_annual_conference_speaker_update(uuid,uuid) to service_role;
commit;
