-- Provider diagnostics are separate from the order and fulfillment state.
alter table public.annual_conference_ticket_payment_attempts
  add column paystack_status text,
  add column paystack_reason text,
  add column paystack_checked_at timestamptz,
  add column paystack_check_started_at timestamptz,
  add column paystack_check_failed boolean not null default false,
  add constraint managed_paystack_observation_status check (paystack_status is null or paystack_status in ('success', 'failed', 'abandoned', 'reversed', 'pending', 'ongoing', 'processing', 'queued', 'other')),
  add constraint managed_paystack_observation_reason check (paystack_reason is null or paystack_reason in ('Successful', 'Approved', 'Declined', 'Insufficient Funds', 'Insufficient funds', 'Transaction declined', 'Transaction failed', 'Pending', 'Card security code verification failed', 'Merchant configuration issue', 'Payment processing error', 'Card expired', 'Bank declined the payment', 'Payment timed out', 'Bank unavailable', 'Customer cancelled payment'));

create function public.record_managed_paystack_observation(
  p_reference text, p_started_at timestamptz, p_status text, p_reason text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_started_at is null or p_started_at > clock_timestamp() + interval '1 minute' then
    raise exception 'invalid_verification_time';
  end if;
  if p_status is null and p_reason is not null then
    raise exception 'invalid_verification_observation';
  end if;
  update public.annual_conference_ticket_payment_attempts
    set paystack_status = case when p_status is null then paystack_status else p_status end,
        paystack_reason = case when p_status is null then paystack_reason else p_reason end,
        paystack_checked_at = case when p_status is null then paystack_checked_at else clock_timestamp() end,
        paystack_check_started_at = p_started_at,
        paystack_check_failed = p_status is null
    where payment_reference = p_reference and provider = 'paystack'
      and (paystack_check_started_at is null or paystack_check_started_at < p_started_at);
end;
$$;

revoke all on function public.record_managed_paystack_observation(text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.record_managed_paystack_observation(text, timestamptz, text, text) to service_role;
