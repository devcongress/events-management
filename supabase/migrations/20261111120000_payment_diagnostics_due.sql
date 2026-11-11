-- The probe mirrors the claim eligibility without leasing or changing retry state.
create index annual_conference_payment_diagnostics_due_idx
  on public.annual_conference_ticket_payment_attempts (diagnostic_next_at, id)
  where provider = 'paystack'
    and coalesce(paystack_status, '') not in ('success', 'failed', 'abandoned', 'reversed');

create function public.unresolved_payment_diagnostics_due()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.annual_conference_ticket_payment_attempts a
    join public.annual_conference_ticket_orders o on o.id = a.order_id
    where a.provider = 'paystack'
      and o.status in ('pending_payment', 'expired', 'cancelled')
      and o.paid_at is null
      and coalesce(a.paystack_status, '') not in ('success', 'failed', 'abandoned', 'reversed')
      and a.diagnostic_next_at <= now()
      and (a.diagnostic_until is null or a.diagnostic_until <= now())
      and (a.paystack_check_started_at is null or a.paystack_check_started_at <= now() - interval '1 minute')
  );
$$;

revoke all on function public.unresolved_payment_diagnostics_due() from public, anon, authenticated;
grant execute on function public.unresolved_payment_diagnostics_due() to service_role;
