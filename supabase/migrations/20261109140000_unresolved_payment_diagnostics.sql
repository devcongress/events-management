-- Diagnostic scheduling is independent of fulfillment and admission delivery.
alter table public.annual_conference_ticket_payment_attempts
  add column diagnostic_next_at timestamptz not null default now(),
  add column diagnostic_retries integer not null default 0 check (diagnostic_retries >= 0),
  add column diagnostic_claim uuid,
  add column diagnostic_until timestamptz;

create function public.claim_unresolved_payment_diagnostics(p_claim uuid)
returns table(order_id uuid, payment_reference text, payment_mode text)
language plpgsql security definer set search_path = public as $$
begin
  if p_claim is null then raise exception 'payment_diagnostic_claim_invalid'; end if;
  return query with due as (
    select a.id
    from public.annual_conference_ticket_payment_attempts a
    join public.annual_conference_ticket_orders o on o.id = a.order_id
    where a.provider = 'paystack'
      and o.status in ('pending_payment', 'expired', 'cancelled')
      and o.paid_at is null
      and coalesce(a.paystack_status, '') not in ('success', 'failed', 'abandoned', 'reversed')
      and a.diagnostic_next_at <= now()
      and (a.diagnostic_until is null or a.diagnostic_until <= now())
      and (a.paystack_check_started_at is null or a.paystack_check_started_at <= now() - interval '1 minute')
    order by a.diagnostic_next_at, a.id
    limit 8 for update of a skip locked
  )
  update public.annual_conference_ticket_payment_attempts a
    set diagnostic_claim = p_claim, diagnostic_until = now() + interval '3 minutes'
    from due, public.annual_conference_ticket_orders o
    where a.id = due.id and o.id = a.order_id
    returning a.order_id, a.payment_reference, o.payment_mode;
end;
$$;

create function public.finish_unresolved_payment_diagnostic(p_order uuid, p_claim uuid)
returns void language sql security definer set search_path = public as $$
  update public.annual_conference_ticket_payment_attempts
    set diagnostic_next_at = case
        when paystack_status in ('success', 'failed', 'abandoned', 'reversed') then 'infinity'::timestamptz
        else now() + case diagnostic_retries
          when 0 then interval '1 minute' when 1 then interval '5 minutes'
          when 2 then interval '15 minutes' when 3 then interval '60 minutes'
          else interval '1 day' end end,
      diagnostic_retries = diagnostic_retries + 1,
      diagnostic_claim = null, diagnostic_until = null
    where order_id = p_order and diagnostic_claim = p_claim and diagnostic_until > now();
$$;

revoke all on function public.claim_unresolved_payment_diagnostics(uuid), public.finish_unresolved_payment_diagnostic(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_unresolved_payment_diagnostics(uuid), public.finish_unresolved_payment_diagnostic(uuid, uuid) to service_role;
