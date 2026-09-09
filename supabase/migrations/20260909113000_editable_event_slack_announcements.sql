-- Store Slack Web API message references so a published event announcement can
-- be kept in sync when an organizer changes its public details.
alter table public.event_slack_announcements
  add column if not exists provider_channel_id text,
  add column if not exists provider_message_ts text,
  add column if not exists message_updated_at timestamptz,
  add column if not exists message_update_last_error text;

alter table public.event_slack_announcements
  drop constraint if exists event_slack_announcements_provider_reference_pair,
  drop constraint if exists event_slack_announcements_provider_channel_format,
  drop constraint if exists event_slack_announcements_provider_message_ts_format,
  drop constraint if exists event_slack_announcements_message_update_error_length,
  add constraint event_slack_announcements_provider_reference_pair check (
    (provider_channel_id is null and provider_message_ts is null)
    or (provider_channel_id is not null and provider_message_ts is not null)
  ),
  add constraint event_slack_announcements_provider_channel_format check (
    provider_channel_id is null or provider_channel_id ~ '^[CG][A-Z0-9]{8,31}$'
  ),
  add constraint event_slack_announcements_provider_message_ts_format check (
    provider_message_ts is null or provider_message_ts ~ '^[0-9]{10,16}\.[0-9]{6}$'
  ),
  add constraint event_slack_announcements_message_update_error_length check (
    message_update_last_error is null or char_length(message_update_last_error) <= 500
  );

drop function if exists public.complete_event_slack_announcement(uuid, uuid, boolean, text);

create function public.complete_event_slack_announcement(
  p_event_id uuid,
  p_attempt_token uuid,
  p_sent boolean,
  p_error text default null,
  p_provider_channel_id text default null,
  p_provider_message_ts text default null
)
returns public.event_slack_announcements
language plpgsql security definer set search_path = public as $$
declare
  announcement public.event_slack_announcements%rowtype;
begin
  if (p_provider_channel_id is null) <> (p_provider_message_ts is null) then
    raise exception 'event_slack_announcement_provider_reference_incomplete';
  end if;

  update public.event_slack_announcements
  set status = case when p_sent then 'sent' else 'failed' end,
      sent_at = case when p_sent then now() else null end,
      last_error = case when p_sent then null else left(coalesce(p_error, 'Slack notification failed.'), 500) end,
      provider_channel_id = case when p_sent then p_provider_channel_id else null end,
      provider_message_ts = case when p_sent then p_provider_message_ts else null end,
      message_updated_at = case when p_sent and p_provider_message_ts is not null then now() else null end,
      message_update_last_error = null,
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

revoke all on function public.complete_event_slack_announcement(uuid, uuid, boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_event_slack_announcement(uuid, uuid, boolean, text, text, text) to service_role;

