-- Management access is useful only when a purchaser has a handoff action.
-- Existing queued or frozen rows remain historical delivery records.

create function public.filter_flexible_order_management_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'flexible_order_management'
    and exists (
      select 1
      from public.annual_conference_flexible_ticket_allocations allocation
      where allocation.order_id = new.order_id
    )
    and not exists (
      select 1
      from public.annual_conference_flexible_ticket_allocations allocation
      where allocation.order_id = new.order_id
        and allocation.allocation_kind in ('gift', 'buyer_managed', 'community_shareable')
    ) then
    return null;
  end if;

  return new;
end;
$$;

-- PostgreSQL runs same-event triggers alphabetically. This runs before the
-- combined-email trigger, so self-only orders never acquire a management link.
create trigger a_filter_flexible_order_management_email
before insert on public.annual_conference_ticket_email_outbox
for each row execute function public.filter_flexible_order_management_email();

revoke all on function public.filter_flexible_order_management_email()
  from public, anon, authenticated;
