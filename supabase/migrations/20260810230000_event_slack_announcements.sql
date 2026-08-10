-- Durable, one-send Slack announcements for public events. This is deliberately
-- separate from event creation: Slack remains best-effort, but retries cannot
-- accidentally post a second announcement after a successful delivery.
create table if not exists public.event_slack_announcements (
  event_id uuid primary key references public.community_events(id) on delete cascade,
  source text not null check (source in ('organizer', 'public submission')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  last_error text,
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.event_slack_announcements enable row level security;
revoke all on public.event_slack_announcements from public, anon, authenticated;
grant select, insert, update, delete on public.event_slack_announcements to service_role;

create index if not exists event_slack_announcements_status_idx
  on public.event_slack_announcements (status, last_attempt_at desc);

create or replace function public.claim_event_slack_announcement(
  p_event_id uuid,
  p_source text,
  p_allow_retry boolean default false
)
returns table (
  event_id uuid,
  source text,
  status text,
  attempt_count integer,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  last_error text,
  should_send boolean,
  attempt_token uuid
)
language plpgsql security definer set search_path = public as $$
declare
  announcement public.event_slack_announcements%rowtype;
  token uuid;
begin
  if p_source not in ('organizer', 'public submission') then
    raise exception 'event_slack_announcement_invalid_source';
  end if;

  insert into public.event_slack_announcements (event_id, source)
  values (p_event_id, p_source)
  on conflict (event_id) do nothing;

  select * into announcement
  from public.event_slack_announcements
  where event_slack_announcements.event_id = p_event_id
  for update;

  if announcement.status = 'sent'
    or (announcement.status = 'pending' and announcement.lease_expires_at > now())
    or (announcement.status = 'failed' and not p_allow_retry) then
    return query select announcement.event_id, announcement.source, announcement.status, announcement.attempt_count,
      announcement.last_attempt_at, announcement.sent_at, announcement.last_error, false, null::uuid;
    return;
  end if;

  token := gen_random_uuid();
  update public.event_slack_announcements
  set source = p_source,
      status = 'pending',
      attempt_count = announcement.attempt_count + 1,
      last_attempt_at = now(),
      last_error = null,
      lease_token = token,
      lease_expires_at = now() + interval '2 minutes',
      updated_at = now()
  where event_slack_announcements.event_id = p_event_id
  returning * into announcement;

  return query select announcement.event_id, announcement.source, announcement.status, announcement.attempt_count,
    announcement.last_attempt_at, announcement.sent_at, announcement.last_error, true, token;
end;
$$;

create or replace function public.complete_event_slack_announcement(
  p_event_id uuid,
  p_attempt_token uuid,
  p_sent boolean,
  p_error text default null
)
returns public.event_slack_announcements
language plpgsql security definer set search_path = public as $$
declare
  announcement public.event_slack_announcements%rowtype;
begin
  update public.event_slack_announcements
  set status = case when p_sent then 'sent' else 'failed' end,
      sent_at = case when p_sent then now() else null end,
      last_error = case when p_sent then null else left(coalesce(p_error, 'Slack notification failed.'), 500) end,
      lease_token = null,
      lease_expires_at = null,
      updated_at = now()
  where event_id = p_event_id
    and status = 'pending'
    and lease_token = p_attempt_token
  returning * into announcement;

  if announcement.event_id is null then
    raise exception 'event_slack_announcement_claim_invalid';
  end if;

  return announcement;
end;
$$;

revoke all on function public.claim_event_slack_announcement(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.complete_event_slack_announcement(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_event_slack_announcement(uuid, text, boolean) to service_role;
grant execute on function public.complete_event_slack_announcement(uuid, uuid, boolean, text) to service_role;
