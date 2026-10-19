-- Validate legacy outcome batches in one catalog-backed request and replay
-- provider events after the batch has been finalized.
begin;

create function public.validate_volunteer_follow_up_outcome_batch_send(
  p_batch_id uuid,
  p_claim_token uuid,
  p_lease_token uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.volunteer_follow_up_outcome_batches b
    join public.volunteer_follow_up_campaigns c on c.id = b.campaign_id
    where b.id = p_batch_id
      and b.status = 'sending'
      and b.claim_token = p_claim_token
      and b.claimed_until > now()
      and b.first_attempt_at > now() - interval '23 hours'
      and b.attempt_count between 1 and 4
      and c.drain_lease_token = p_lease_token
      and c.drain_lease_until > now()
      and not c.outcome_paused
      and b.recipient_count = (
        select count(*)
        from public.volunteer_follow_up_outcome_deliveries d
        where d.batch_id = b.id
      )
      and b.recipient_count = (
        select count(*)
        from public.volunteer_follow_up_outcome_deliveries d
        join public.volunteer_follow_up_recipients r on r.id = d.recipient_id
        where d.batch_id = b.id
          and d.campaign_id = b.campaign_id
          and d.status = 'sending'
          and d.claim_token = p_claim_token
          and d.claimed_until > now()
          and d.first_attempt_at = b.first_attempt_at
          and d.attempt_count = b.attempt_count
          and d.batch_idempotency_key = b.idempotency_key
          and d.batch_position between 1 and b.recipient_count
          and d.held_at is null
          and d.provider_email_id is null
          and r.campaign_id = b.campaign_id
          and r.decision = d.decision
          and r.decision_version = d.decision_version
      )
  );
$$;

revoke all on function public.validate_volunteer_follow_up_outcome_batch_send(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.validate_volunteer_follow_up_outcome_batch_send(uuid, uuid, uuid)
  to service_role;

create function public.replay_volunteer_follow_up_outcome_batch_events(p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_count integer;
begin
  with latest as (
    select distinct on (e.provider_email_id)
      e.provider_email_id,
      e.provider_created_at,
      case e.event_type
        when 'email.delivered' then 'delivered'
        when 'email.delivery_delayed' then 'delayed'
        when 'email.bounced' then 'bounced'
        when 'email.failed' then 'failed'
        when 'email.suppressed' then 'suppressed'
        when 'email.complained' then 'complained'
      end as delivery_status
    from public.volunteer_follow_up_webhook_events e
    join public.volunteer_follow_up_outcome_deliveries d
      on d.provider_email_id = e.provider_email_id
    where d.batch_id = p_batch_id
      and e.event_type in (
        'email.delivered', 'email.delivery_delayed', 'email.bounced',
        'email.failed', 'email.suppressed', 'email.complained'
      )
    order by e.provider_email_id, e.provider_created_at desc, e.webhook_event_id desc
  )
  update public.volunteer_follow_up_outcome_deliveries d
  set status = latest.delivery_status,
    provider_event_at = latest.provider_created_at,
    delivery_stage = 'provider_event',
    diagnostic_at = latest.provider_created_at
  from latest
  where d.batch_id = p_batch_id
    and d.provider_email_id = latest.provider_email_id
    and (d.provider_event_at is null or d.provider_event_at < latest.provider_created_at);

  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

revoke all on function public.replay_volunteer_follow_up_outcome_batch_events(uuid)
  from public, anon, authenticated;
grant execute on function public.replay_volunteer_follow_up_outcome_batch_events(uuid)
  to service_role;

commit;
