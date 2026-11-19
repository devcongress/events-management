begin;

create table public.event_submission_slack_identities (
  team_id text not null,
  slack_user_id text not null,
  membership_id uuid references public.admin_memberships(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (team_id, slack_user_id),
  unique (membership_id)
);

create table public.event_submission_slack_link_tokens (
  token_hash text primary key,
  team_id text not null,
  slack_user_id text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint slack_link_tokens_actor_unique unique (team_id, slack_user_id)
);

alter table public.event_submission_slack_identities enable row level security;
alter table public.event_submission_slack_link_tokens enable row level security;
revoke all on public.event_submission_slack_identities from public, anon, authenticated;
revoke all on public.event_submission_slack_link_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.event_submission_slack_identities to service_role;
grant select, insert, update, delete on public.event_submission_slack_link_tokens to service_role;

create function public.consume_event_submission_slack_link(p_token_hash text, p_membership_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  link_token public.event_submission_slack_link_tokens%rowtype;
  linked_membership uuid;
begin
  select * into link_token from public.event_submission_slack_link_tokens
    where token_hash = p_token_hash and expires_at > now() for update;
  if not found then return false; end if;

  perform 1 from public.admin_memberships
    where id = p_membership_id and status = 'active' and role in ('owner', 'organizer') for share;
  if not found then return false; end if;

  insert into public.event_submission_slack_identities (team_id, slack_user_id, membership_id)
    values (link_token.team_id, link_token.slack_user_id, p_membership_id)
    on conflict do nothing;

  select membership_id into linked_membership from public.event_submission_slack_identities
    where team_id = link_token.team_id and slack_user_id = link_token.slack_user_id;
  if linked_membership is distinct from p_membership_id then return false; end if;

  delete from public.event_submission_slack_link_tokens where token_hash = p_token_hash;
  return true;
end;
$$;

revoke all on function public.consume_event_submission_slack_link(text, uuid) from public, anon, authenticated;
grant execute on function public.consume_event_submission_slack_link(text, uuid) to service_role;


create table public.event_submission_slack_grants (
  team_id text not null,
  channel_id text not null,
  slack_user_id text not null,
  granted_at timestamptz not null default now(),
  primary key (team_id, channel_id, slack_user_id)
);

alter table public.event_submission_slack_grants enable row level security;
revoke all on public.event_submission_slack_grants from public, anon, authenticated;
grant select, insert, update, delete on public.event_submission_slack_grants to service_role;

create function public.grant_event_submission_slack_reviewer(
  p_team_id text, p_channel_id text, p_slack_user_id text, p_slack_email text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_role public.admin_role;
  existing_status public.admin_membership_status;
  inserted_at timestamptz;
begin
  select m.role, m.status into existing_role, existing_status
    from public.event_submission_slack_identities i
    left join public.admin_memberships m on m.id = i.membership_id
    where i.team_id = p_team_id and i.slack_user_id = p_slack_user_id;
  if found then
    if existing_status = 'active' and existing_role in ('owner', 'organizer') then return 'linked'; end if;
    return 'denied';
  end if;

  if exists (select 1 from public.admin_memberships where email = lower(trim(p_slack_email))) then
    return 'link_required';
  end if;

  insert into public.event_submission_slack_grants (team_id, channel_id, slack_user_id)
    values (p_team_id, p_channel_id, p_slack_user_id)
    on conflict do nothing returning granted_at into inserted_at;
  if inserted_at is not null then
    insert into public.admin_audit_log (actor_email, actor_role, action, target_type, metadata)
      values (lower(trim(p_slack_email)), null, 'event_submission.slack_reviewer_granted', 'slack_reviewer',
        jsonb_build_object('source', 'slack', 'team_id', p_team_id, 'channel_id', p_channel_id,
          'slack_user_id', p_slack_user_id, 'slack_email', lower(trim(p_slack_email)), 'granted_at', inserted_at));
  end if;
  return 'granted';
end;
$$;

revoke all on function public.grant_event_submission_slack_reviewer(text, text, text, text) from public, anon, authenticated;
grant execute on function public.grant_event_submission_slack_reviewer(text, text, text, text) to service_role;

commit;
