-- Derive the public display from fulfilled live orders, independently of inventory.
create or replace function public.read_annual_conference_attendance_counter(p_year integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  selected_edition_id uuid;
  purchased bigint;
begin
  select id into selected_edition_id from public.annual_conference_editions where year = p_year;
  if selected_edition_id is null then return null; end if;

  select coalesce(sum(o.quantity - coalesce(refunds.units, 0)), 0) into purchased
  from public.annual_conference_ticket_orders o
  left join (
    select order_id, count(*) as units
    from public.annual_conference_flexible_ticket_refunds
    where status = 'refunded'
    group by order_id
  ) refunds on refunds.order_id = o.id
  where o.edition_id = selected_edition_id and o.payment_mode = 'live' and o.status = 'paid';

  return jsonb_build_object('count', 20 + purchased, 'source', 'ticket_count',
    'baseline', 20, 'purchases', purchased);
end;
$$;

-- Keep the legacy signature so old clients cannot re-enable manual control.
create or replace function public.configure_annual_conference_attendance_counter(p_year integer, p_source text, p_version integer)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  raise exception 'attendance_counter_automatic';
end;
$$;
