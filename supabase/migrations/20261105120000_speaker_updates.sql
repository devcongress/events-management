-- Speaker updates are independent from the original decision and its delivery history.
begin;

create table public.annual_conference_speaker_updates (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.annual_conference_editions(id),
  subject text not null,
  message text not null,
  version integer not null default 1 check (version > 0),
  state text not null default 'draft' check (state in ('draft', 'queued', 'complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.annual_conference_speaker_update_deliveries (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references public.annual_conference_speaker_updates(id),
  submission_id uuid not null references public.annual_conference_speaker_submissions(id),
  name text not null,
  recipient text not null,
  speaker_email text not null,
  link_id uuid not null references public.annual_conference_speaker_intake_links(id),
  link_expires_at timestamptz not null,
  provider_payload jsonb not null,
  idempotency_key text not null unique,
  status text not null default 'queued' check (status in ('queued', 'sending', 'accepted', 'delivered', 'failed', 'bounced', 'complained', 'suppressed')),
  attempt_count integer not null default 0,
  first_attempt_at timestamptz,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  claim_token uuid,
  claimed_until timestamptz,
  provider_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (update_id, submission_id),
  unique (update_id, recipient)
);

create index speaker_update_delivery_due_idx on public.annual_conference_speaker_update_deliveries (status, next_attempt_at);
create unique index speaker_update_provider_id_idx on public.annual_conference_speaker_update_deliveries (provider_id) where provider_id is not null;

create table public.annual_conference_speaker_update_previews (
  id uuid primary key,
  update_id uuid not null references public.annual_conference_speaker_updates(id),
  edition_id uuid not null references public.annual_conference_editions(id),
  actor_id text not null,
  version integer not null,
  recipients jsonb not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  queued_count integer
);

alter table public.annual_conference_speaker_updates enable row level security;
alter table public.annual_conference_speaker_update_deliveries enable row level security;
alter table public.annual_conference_speaker_update_previews enable row level security;
revoke all on public.annual_conference_speaker_updates, public.annual_conference_speaker_update_deliveries, public.annual_conference_speaker_update_previews from public, anon, authenticated;
grant select, insert, update on public.annual_conference_speaker_updates, public.annual_conference_speaker_update_deliveries, public.annual_conference_speaker_update_previews to service_role;
grant delete on public.annual_conference_speaker_update_previews to service_role;

create function public.queue_annual_conference_speaker_update(p_preview_id uuid, p_update_id uuid, p_edition_id uuid, p_actor_id text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  preview public.annual_conference_speaker_update_previews%rowtype;
  campaign public.annual_conference_speaker_updates%rowtype;
  proposal public.annual_conference_speaker_submissions%rowtype;
  item jsonb;
begin
  select * into preview from public.annual_conference_speaker_update_previews where id = p_preview_id for update;
  if not found or preview.update_id <> p_update_id or preview.edition_id <> p_edition_id or preview.actor_id <> p_actor_id then
    raise exception 'speaker_update_preview_unavailable';
  end if;
  if preview.used_at is not null then return preview.queued_count; end if;
  if preview.expires_at <= now() then raise exception 'speaker_update_preview_unavailable'; end if;
  select * into campaign from public.annual_conference_speaker_updates where id = p_update_id and edition_id = p_edition_id for update;
  if not found or campaign.state <> 'draft' or campaign.version <> preview.version then raise exception 'speaker_update_preview_changed'; end if;
  if jsonb_typeof(preview.recipients) <> 'array' or jsonb_array_length(preview.recipients) not between 1 and 100
    or (select count(distinct value->>'id') from jsonb_array_elements(preview.recipients)) <> jsonb_array_length(preview.recipients)
    or (select count(distinct value->>'recipient') from jsonb_array_elements(preview.recipients)) <> jsonb_array_length(preview.recipients) then
    raise exception 'speaker_update_preview_changed';
  end if;
  for item in select value from jsonb_array_elements(preview.recipients) order by value->>'id' loop
    select * into proposal from public.annual_conference_speaker_submissions where id = (item->>'id')::uuid for update;
    if not found or proposal.edition_id <> p_edition_id or proposal.status <> 'selected'
      or proposal.decision_email_kind is distinct from 'acceptance' or proposal.decision_email_sent_at is null
      or proposal.decision_email_status is null or proposal.decision_email_status not in ('accepted', 'delivered', 'delayed')
      or lower(btrim(coalesce(proposal.decision_email_recipient, proposal.speaker_email))) is distinct from item->>'recipient'
      or lower(btrim(proposal.speaker_email)) is distinct from item->>'speaker_email'
      or proposal.selected_intake_link_id is distinct from (item->>'link_id')::uuid
      or exists (select 1 from public.annual_conference_email_suppressions s where s.email = item->>'recipient') then
      raise exception 'speaker_update_preview_changed';
    end if;
    perform 1 from public.annual_conference_speaker_intake_links link
      where link.id = proposal.selected_intake_link_id and link.edition_id = p_edition_id
        and link.speaker_submission_id = proposal.id and link.workspace_session_id = proposal.selected_session_id
        and link.revoked_at is null and link.expires_at = (item->>'link_expires_at')::timestamptz for share;
    if not found then raise exception 'speaker_update_preview_changed'; end if;
  end loop;
  for item in select value from jsonb_array_elements(preview.recipients) loop
    insert into public.annual_conference_speaker_update_deliveries
      (update_id, submission_id, name, recipient, speaker_email, link_id, link_expires_at, provider_payload, idempotency_key)
    values (p_update_id, (item->>'id')::uuid, item->>'name', item->>'recipient', item->>'speaker_email', (item->>'link_id')::uuid,
      (item->>'link_expires_at')::timestamptz, item->'provider_payload', item->>'key');
  end loop;
  update public.annual_conference_speaker_updates set state = 'queued', updated_at = now() where id = p_update_id;
  update public.annual_conference_speaker_update_previews set used_at = now(), queued_count = jsonb_array_length(recipients), recipients = '[]'::jsonb where id = p_preview_id;
  return jsonb_array_length(preview.recipients);
end;
$$;
revoke all on function public.queue_annual_conference_speaker_update(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.queue_annual_conference_speaker_update(uuid,uuid,uuid,text) to service_role;

commit;
