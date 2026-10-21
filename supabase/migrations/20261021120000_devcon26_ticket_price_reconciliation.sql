-- Reconcile the unpublished DevCon26 flexible checkout with the agreed GH₵150
-- per-seat price. This migration does not activate flexible checkout or send mail.
-- Historical orders, including abandoned holds, make a price rewrite unsafe.
begin;

-- Acquire the order lock first. A concurrent checkout may hold the settings
-- row before inserting an order; NOWAIT avoids a lock-order deadlock.
lock table public.annual_conference_ticket_orders in share row exclusive mode;
lock table public.annual_conference_ticketing_settings in access exclusive mode nowait;

alter table public.annual_conference_ticketing_settings
  alter column regular_price_minor set default 15000,
  alter column team_3_price_minor set default 45000,
  alter column team_5_price_minor set default 75000;

do $$
declare
  v_edition_id uuid;
  settings public.annual_conference_ticketing_settings;
begin
  select id into v_edition_id
  from public.annual_conference_editions
  where year = 2026;

  if v_edition_id is null then
    raise exception using message = 'devcon26_edition_missing';
  end if;

  select * into settings
  from public.annual_conference_ticketing_settings
  where annual_conference_ticketing_settings.edition_id = v_edition_id
  for update;

  if settings.edition_id is null then
    raise exception using message = 'devcon26_ticket_settings_missing';
  end if;

  if settings.currency <> 'GHS'
    or settings.flexible_checkout_state <> 'foundation'
    or settings.regular_price_minor <> 19999
    or settings.team_3_price_minor <> 54999
    or settings.team_5_price_minor not in (84999, 89999)
    or exists (
      select 1 from public.annual_conference_ticket_orders
      where annual_conference_ticket_orders.edition_id = v_edition_id
    ) then
    raise exception using message = 'devcon26_price_reconciliation_precondition_failed';
  end if;

  update public.annual_conference_ticketing_settings
  set regular_price_minor = 15000,
      team_3_price_minor = 45000,
      team_5_price_minor = 75000
  where annual_conference_ticketing_settings.edition_id = v_edition_id;
end;
$$;

commit;
