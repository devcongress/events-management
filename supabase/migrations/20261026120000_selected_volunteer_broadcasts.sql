-- Owner-reviewed updates for manually selected accepted volunteers. These use
-- the same three reusable Resend segments as event blasts while keeping the
-- transactional invitation and outcome queues unchanged.

begin;

alter table public.event_blasts
  alter column event_id drop not null,
  add column audience_kind text not null default 'event_registrations'
    check (audience_kind in ('event_registrations', 'accepted_volunteers')),
  add column volunteer_campaign_id uuid
    references public.volunteer_follow_up_campaigns(id) on delete cascade,
  add column rendered_html text,
  add column rendered_text text,
  add column template_version text;

alter table public.event_blasts
  add constraint event_blasts_audience_scope_check check (
    (audience_kind = 'event_registrations' and event_id is not null and volunteer_campaign_id is null)
    or
    (audience_kind = 'accepted_volunteers' and event_id is null and volunteer_campaign_id is not null)
  );

create index event_blasts_volunteer_campaign_created_at_idx
  on public.event_blasts (volunteer_campaign_id, created_at desc)
  where audience_kind = 'accepted_volunteers';

comment on column public.event_blasts.audience_kind is
  'Server-owned audience source. Volunteer broadcasts contain only the explicitly reviewed accepted-volunteer snapshot.';
comment on column public.event_blasts.volunteer_campaign_id is
  'Volunteer campaign owning an accepted-volunteer broadcast; null for event-registration blasts.';

create table public.volunteer_follow_up_broadcast_previews (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.volunteer_follow_up_campaigns(id) on delete cascade,
  subject text not null check (char_length(btrim(subject)) between 1 and 160),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  scheduled_for timestamptz,
  recipients jsonb not null check (jsonb_typeof(recipients) = 'array'),
  recipient_count integer not null check (recipient_count between 1 and 100),
  rendered_html text not null,
  rendered_text text not null,
  template_version text not null,
  created_by text not null check (created_by = lower(btrim(created_by))),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  confirmed_at timestamptz,
  confirmed_blast_id uuid unique references public.event_blasts(id) on delete restrict
);

create index volunteer_follow_up_broadcast_previews_campaign_created_idx
  on public.volunteer_follow_up_broadcast_previews (campaign_id, created_at desc);

alter table public.volunteer_follow_up_broadcast_previews enable row level security;
revoke all on public.volunteer_follow_up_broadcast_previews from public, anon, authenticated;
grant select, insert, update on public.volunteer_follow_up_broadcast_previews to service_role;

create function public.create_volunteer_follow_up_broadcast_preview(
  p_campaign_id uuid,
  p_recipient_ids uuid[],
  p_subject text,
  p_body text,
  p_scheduled_for timestamptz,
  p_rendered_html text,
  p_rendered_text text,
  p_template_version text,
  p_actor text
)
returns setof public.volunteer_follow_up_broadcast_previews
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_count integer;
  selected_count integer;
  snapshot jsonb;
  preview public.volunteer_follow_up_broadcast_previews%rowtype;
begin
  requested_count := coalesce(array_length(p_recipient_ids, 1), 0);

  if requested_count not between 1 and 100 then
    raise exception using errcode = '22023', message = 'volunteer_broadcast_recipient_count_invalid';
  end if;

  if (select count(distinct recipient_id) from unnest(p_recipient_ids) recipient_id) <> requested_count then
    raise exception using errcode = '22023', message = 'volunteer_broadcast_recipient_duplicate';
  end if;

  select count(*), jsonb_agg(jsonb_build_object(
    'recipient_id', recipient.id,
    'decision_version', recipient.decision_version,
    'name', recipient.applicant_name,
    'email', lower(btrim(recipient.applicant_email))
  ) order by recipient.applicant_name, recipient.id)
  into selected_count, snapshot
  from public.volunteer_follow_up_recipients recipient
  where recipient.campaign_id = p_campaign_id
    and recipient.id = any(p_recipient_ids)
    and recipient.decision = 'accepted';

  if selected_count <> requested_count then
    raise exception using errcode = '40001', message = 'volunteer_broadcast_selection_stale';
  end if;

  if (select count(distinct item->>'email') from jsonb_array_elements(snapshot) item) <> requested_count then
    raise exception using errcode = '22023', message = 'volunteer_broadcast_email_duplicate';
  end if;

  insert into public.volunteer_follow_up_broadcast_previews (
    campaign_id, subject, body, scheduled_for, recipients, recipient_count,
    rendered_html, rendered_text, template_version, created_by
  ) values (
    p_campaign_id, btrim(p_subject), btrim(p_body), p_scheduled_for, snapshot,
    requested_count, p_rendered_html, p_rendered_text, p_template_version,
    lower(btrim(p_actor))
  ) returning * into preview;

  return next preview;
end;
$$;

create function public.confirm_volunteer_follow_up_broadcast_preview(
  p_preview_id uuid,
  p_actor text
)
returns setof public.event_blasts
language plpgsql
security definer
set search_path = public
as $$
declare
  preview public.volunteer_follow_up_broadcast_previews%rowtype;
  blast public.event_blasts%rowtype;
  item jsonb;
  recipient public.volunteer_follow_up_recipients%rowtype;
begin
  select * into preview
  from public.volunteer_follow_up_broadcast_previews
  where id = p_preview_id and created_by = lower(btrim(p_actor))
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'volunteer_broadcast_preview_missing';
  end if;

  if preview.confirmed_blast_id is not null then
    select * into blast from public.event_blasts where id = preview.confirmed_blast_id;
    return next blast;
    return;
  end if;

  if preview.expires_at <= now() then
    raise exception using errcode = '40001', message = 'volunteer_broadcast_preview_expired';
  end if;

  for item in select value from jsonb_array_elements(preview.recipients)
  loop
    select * into recipient
    from public.volunteer_follow_up_recipients
    where id = (item->>'recipient_id')::uuid and campaign_id = preview.campaign_id
    for update;

    if not found
      or recipient.decision <> 'accepted'
      or recipient.decision_version <> (item->>'decision_version')::integer
      or lower(btrim(recipient.applicant_email)) <> item->>'email'
    then
      raise exception using errcode = '40001', message = 'volunteer_broadcast_selection_stale';
    end if;
  end loop;

  insert into public.event_blasts (
    event_id, audience_kind, volunteer_campaign_id, subject, body, status,
    recipient_count, scheduled_for, sent_at, provider_broadcast_id,
    provider_segment_id, recipient_snapshot, prepared_recipient_count,
    preparation_error, created_by_email, rendered_html, rendered_text,
    template_version
  ) values (
    null, 'accepted_volunteers', preview.campaign_id, preview.subject,
    preview.body, 'waiting', preview.recipient_count, preview.scheduled_for,
    null, null, null, preview.recipients, 0, null, lower(btrim(p_actor)),
    preview.rendered_html, preview.rendered_text, preview.template_version
  ) returning * into blast;

  update public.volunteer_follow_up_broadcast_previews
  set confirmed_at = now(), confirmed_blast_id = blast.id
  where id = preview.id;

  return next blast;
end;
$$;

revoke all on function public.create_volunteer_follow_up_broadcast_preview(
  uuid, uuid[], text, text, timestamptz, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.confirm_volunteer_follow_up_broadcast_preview(uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_volunteer_follow_up_broadcast_preview(
  uuid, uuid[], text, text, timestamptz, text, text, text, text
) to service_role;
grant execute on function public.confirm_volunteer_follow_up_broadcast_preview(uuid, text)
  to service_role;

-- Generalize ownership of the existing three provider segment slots. The UUID
-- remains the authoritative blast identity; event context is retained only for
-- legacy event-route lookup and volunteer campaign context is stored separately.
alter table public.event_blast_segment_slots
  drop constraint if exists event_blast_segment_slots_check,
  drop constraint if exists event_blast_segment_slots_check1,
  drop constraint if exists event_blast_segment_slots_check2,
  add column active_scope text,
  add column active_volunteer_campaign_id uuid
    references public.volunteer_follow_up_campaigns(id) on delete restrict;

update public.event_blast_segment_slots
set active_scope = 'event'
where active_blast_id is not null;

alter table public.event_blast_segment_slots
  add constraint event_blast_segment_slots_active_scope_check
    check (active_scope is null or active_scope in ('event', 'volunteer')),
  add constraint event_blast_segment_slots_owner_check check (
    (status = 'idle' and active_blast_id is null and active_scope is null
      and active_event_id is null and active_volunteer_campaign_id is null)
    or
    (status <> 'idle' and active_blast_id is not null and (
      (active_scope = 'event' and active_event_id is not null and active_volunteer_campaign_id is null)
      or
      (active_scope = 'volunteer' and active_event_id is null and active_volunteer_campaign_id is not null)
    ))
  ),
  add constraint event_blast_segment_slots_terminal_check
    check (status <> 'idle' or terminal_confirmed_at is null);

create or replace function public.claim_event_blast_segment_slot(p_blast_id uuid, p_event_id uuid)
returns setof public.event_blast_segment_slots
language plpgsql security definer set search_path = public
as $$
declare claimed public.event_blast_segment_slots;
begin
  perform pg_advisory_xact_lock(9172201, 1);
  select * into claimed from public.event_blast_segment_slots
    where active_scope = 'event' and active_blast_id = p_blast_id and active_event_id = p_event_id
    limit 1 for update;
  if found then return next claimed; return; end if;
  select * into claimed from public.event_blast_segment_slots
    where status = 'idle' order by slot_number limit 1 for update skip locked;
  if not found then return; end if;
  update public.event_blast_segment_slots
    set status = 'reserved', active_scope = 'event', active_blast_id = p_blast_id,
      active_event_id = p_event_id, active_volunteer_campaign_id = null,
      terminal_confirmed_at = null, last_error = null, updated_at = now()
    where slot_number = claimed.slot_number returning * into claimed;
  return next claimed;
end;
$$;

create function public.claim_volunteer_blast_segment_slot(p_blast_id uuid, p_campaign_id uuid)
returns setof public.event_blast_segment_slots
language plpgsql security definer set search_path = public
as $$
declare claimed public.event_blast_segment_slots;
begin
  perform pg_advisory_xact_lock(9172201, 1);
  select * into claimed from public.event_blast_segment_slots
    where active_scope = 'volunteer' and active_blast_id = p_blast_id
      and active_volunteer_campaign_id = p_campaign_id
    limit 1 for update;
  if found then return next claimed; return; end if;
  select * into claimed from public.event_blast_segment_slots
    where status = 'idle' order by slot_number limit 1 for update skip locked;
  if not found then return; end if;
  update public.event_blast_segment_slots
    set status = 'reserved', active_scope = 'volunteer', active_blast_id = p_blast_id,
      active_event_id = null, active_volunteer_campaign_id = p_campaign_id,
      terminal_confirmed_at = null, last_error = null, updated_at = now()
    where slot_number = claimed.slot_number returning * into claimed;
  return next claimed;
end;
$$;

create or replace function public.release_event_blast_segment_slot(
  p_blast_id uuid,
  p_slot_number smallint
)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  update public.event_blast_segment_slots
  set status = 'idle', active_scope = null, active_blast_id = null,
      active_event_id = null, active_volunteer_campaign_id = null,
      terminal_confirmed_at = null, last_error = null, updated_at = now()
  where slot_number = p_slot_number and active_blast_id = p_blast_id
    and status = 'clearing' and terminal_confirmed_at is not null;
  return found;
end;
$$;

revoke all on function public.claim_volunteer_blast_segment_slot(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_volunteer_blast_segment_slot(uuid, uuid)
  to service_role;

commit;
