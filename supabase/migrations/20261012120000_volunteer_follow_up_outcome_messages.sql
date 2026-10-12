-- Versioned, server-owned outcome messages for the volunteer follow-up campaign.

begin;

create table public.volunteer_follow_up_outcome_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.volunteer_follow_up_campaigns(id) on delete cascade,
  decision text not null check (decision in ('accepted', 'not_selected')),
  version integer not null check (version > 0),
  subject text not null check (
    char_length(btrim(subject)) between 1 and 200
    and subject !~ '[\r\n]'
  ),
  message text not null check (char_length(btrim(message)) between 1 and 5000),
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (campaign_id, decision, version)
);

create index volunteer_follow_up_outcome_messages_current_idx
  on public.volunteer_follow_up_outcome_messages (campaign_id, decision, version desc);

insert into public.volunteer_follow_up_outcome_messages (
  campaign_id, decision, version, subject, message, created_by
)
select
  campaign.id,
  defaults.decision,
  1,
  defaults.subject,
  defaults.message,
  'system-default'
from public.volunteer_follow_up_campaigns campaign
cross join (
  values
    (
      'accepted',
      'Your DevCongress 2026 volunteer application',
      'We’re pleased to let you know that you’ve been selected to volunteer with DevCongress 2026. Our team will share the next steps and event information with you soon.'
    ),
    (
      'not_selected',
      'An update on your DevCongress 2026 volunteer application',
      'Thank you for offering your time and for completing the volunteer follow-up. We’re unable to offer you a volunteer place for DevCongress 2026. We appreciate your interest and hope to see you at the event.'
    )
) as defaults(decision, subject, message);

alter table public.volunteer_follow_up_outcome_messages enable row level security;
revoke all on public.volunteer_follow_up_outcome_messages from public, anon, authenticated;
grant select, insert on public.volunteer_follow_up_outcome_messages to service_role;

create function public.save_volunteer_follow_up_outcome_message(
  p_campaign_id uuid,
  p_decision text,
  p_expected_version integer,
  p_subject text,
  p_message text,
  p_actor text
)
returns setof public.volunteer_follow_up_outcome_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_message public.volunteer_follow_up_outcome_messages%rowtype;
begin
  if p_decision not in ('accepted', 'not_selected') then
    raise exception using errcode = '22023', message = 'invalid_outcome_decision';
  end if;

  select * into current_message
  from public.volunteer_follow_up_outcome_messages
  where campaign_id = p_campaign_id and decision = p_decision
  order by version desc
  limit 1
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'outcome_message_not_found';
  end if;

  if current_message.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'outcome_message_version_conflict';
  end if;

  return query
  insert into public.volunteer_follow_up_outcome_messages (
    campaign_id, decision, version, subject, message, created_by
  ) values (
    p_campaign_id,
    p_decision,
    current_message.version + 1,
    btrim(p_subject),
    btrim(p_message),
    p_actor
  )
  returning *;
end;
$$;

revoke all on function public.save_volunteer_follow_up_outcome_message(uuid, text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.save_volunteer_follow_up_outcome_message(uuid, text, integer, text, text, text) to service_role;

commit;
