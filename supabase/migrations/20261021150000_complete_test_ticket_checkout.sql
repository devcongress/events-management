-- Full-flow preview testing. Does not activate testing, open sales, send email,
-- change existing orders, or delete data. Apply only after review.
alter table public.annual_conference_ticket_orders
  add column payment_mode text not null default 'live' check (payment_mode in ('live', 'test')),
  add column checkout_origin text,
  add constraint ticket_test_origin_required check (
    payment_mode = 'live' or (checkout_origin is not null
      and checkout_origin ~ '^https://[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$')
  );

create function public.create_annual_conference_complete_test_hold(
  p_edition_id uuid, p_purchaser_name text, p_purchaser_email text,
  p_quantity integer, p_allocations jsonb, p_checkout_request_key uuid, p_origin text
)
returns public.annual_conference_ticket_orders
language plpgsql security definer set search_path = public as $$
declare settings jsonb; existing public.annual_conference_ticket_orders; result public.annual_conference_ticket_orders;
begin
  perform 1 from public.annual_conference_ticketing_settings
    where edition_id = p_edition_id and flexible_checkout_state = 'internal' for update;
  if not found then raise exception 'complete_test_checkout_not_available'; end if;
  settings := public.get_annual_conference_registration_testing(p_edition_id);
  if not coalesce((settings->>'enabled')::boolean, false)
    or not (settings->'tester_emails' ? lower(btrim(p_purchaser_email)))
    or p_origin is null or p_origin !~ '^https://[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$'
    or exists (select 1 from jsonb_array_elements(p_allocations) a
      where a->>'recipient_email' is not null
        and not (settings->'tester_emails' ? lower(btrim(a->>'recipient_email')))) then
    raise exception 'complete_test_checkout_not_available';
  end if;
  select * into existing from public.annual_conference_ticket_orders
    where edition_id = p_edition_id and flexible_cart_request_key = p_checkout_request_key;
  if existing.id is not null and (existing.payment_mode <> 'test' or existing.checkout_origin <> p_origin) then
    raise exception 'flexible_ticket_checkout_request_conflict';
  end if;
  select * into result from public.create_annual_conference_flexible_checkout_hold(
    p_edition_id, p_purchaser_name, p_purchaser_email, p_quantity, p_allocations, p_checkout_request_key
  );
  if existing.id is null then
    update public.annual_conference_ticket_orders set payment_mode = 'test', checkout_origin = p_origin
      where id = result.id returning * into result;
  end if;
  return result;
end;
$$;

create function public.guard_complete_test_order_identity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.payment_mode, new.checkout_origin) is distinct from (old.payment_mode, old.checkout_origin)
    and (old.payment_mode = 'test' or old.status <> 'pending_payment'
      or exists (select 1 from public.annual_conference_ticket_payment_attempts where order_id = old.id)) then
    raise exception 'ticket_payment_mode_immutable';
  end if;
  return new;
end;
$$;
create trigger guard_complete_test_order_identity before update on public.annual_conference_ticket_orders
  for each row execute function public.guard_complete_test_order_identity();

create function public.guard_complete_test_payment_domain()
returns trigger language plpgsql security definer set search_path = public as $$
declare expected text;
begin
  select payment_mode into expected from public.annual_conference_ticket_orders where id = new.order_id;
  if expected is null or (expected = 'test' and coalesce(new.payload_facts->>'domain', '') <> 'test')
    or (expected = 'live' and new.payload_facts->>'domain' = 'test') then
    raise exception 'ticket_payment_domain_mismatch';
  end if;
  return new;
end;
$$;
create trigger guard_complete_test_payment_domain before insert on public.annual_conference_ticket_payment_events
  for each row execute function public.guard_complete_test_payment_domain();

create function public.guard_complete_test_ticket()
returns trigger language plpgsql security definer set search_path = public as $$
declare settings jsonb; mode text;
begin
  select payment_mode into mode from public.annual_conference_ticket_orders where id = new.order_id;
  if mode = 'test' then
    if new.status = 'checked_in' then raise exception 'test_ticket_not_valid_for_admission'; end if;
    if tg_op = 'INSERT' or new.attendee_email is distinct from old.attendee_email then
      settings := public.get_annual_conference_registration_testing(new.edition_id);
      if not coalesce((settings->>'enabled')::boolean, false)
        or (new.attendee_email is not null and not (settings->'tester_emails' ? lower(btrim(new.attendee_email)))) then
        raise exception 'complete_test_recipient_not_allowed';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_complete_test_ticket before insert or update on public.annual_conference_tickets
  for each row execute function public.guard_complete_test_ticket();

-- New workers use this context before creating/finalizing a provider payload.
-- It also binds social-card links to the same preview as the originating order.
create function public.complete_test_email_context(p_kind text, p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with source as (
    select o.payment_mode, o.checkout_origin, o.edition_id, d.recipient_email
      from public.annual_conference_ticket_email_outbox d
      join public.annual_conference_ticket_orders o on o.id = d.order_id
      where p_kind = 'admission' and d.id = p_id
    union all
    select o.payment_mode, o.checkout_origin, o.edition_id, d.recipient_email
      from public.annual_conference_social_card_email_outbox d
      left join public.annual_conference_social_cards c on c.id = d.social_card_id
      left join public.annual_conference_tickets t on t.id = c.ticket_id
      join public.annual_conference_ticket_orders o on o.id = coalesce(d.collection_order_id, t.order_id)
      where p_kind = 'social' and d.id = p_id
  ) select coalesce((select jsonb_build_object(
    'is_test', true, 'origin', checkout_origin,
    'allowed', coalesce((public.get_annual_conference_registration_testing(edition_id)->>'enabled')::boolean, false)
      and (public.get_annual_conference_registration_testing(edition_id)->'tester_emails' ? lower(btrim(recipient_email)))
  ) from source where payment_mode = 'test'), '{"is_test":false,"allowed":true}'::jsonb);
$$;

-- Prevent older schedulers from leasing test mail, and stop disabled/removed
-- testers even if a worker still has an in-flight lease. The new dispatcher
-- additionally rechecks context immediately before sending to the provider.
create function public.guard_complete_test_email_lease()
returns trigger language plpgsql security definer set search_path = public as $$
declare context jsonb;
begin
  if new.status = 'sending' and (old.status is distinct from new.status or old.claim_token is distinct from new.claim_token) then
    context := public.complete_test_email_context(tg_argv[0], new.id);
    if coalesce((context->>'is_test')::boolean, false)
      and (not coalesce((context->>'allowed')::boolean, false)
        or current_setting('app.complete_test_email_dispatch', true) is distinct from 'enabled') then return null; end if;
  end if;
  return new;
end;
$$;
create trigger guard_complete_test_admission_lease before update on public.annual_conference_ticket_email_outbox
  for each row execute function public.guard_complete_test_email_lease('admission');
create trigger guard_complete_test_social_lease before update on public.annual_conference_social_card_email_outbox
  for each row execute function public.guard_complete_test_email_lease('social');

create function public.guard_complete_test_refund()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.annual_conference_ticket_orders where id = new.order_id and payment_mode = 'test') then
    raise exception 'test_order_requires_test_cleanup';
  end if;
  return new;
end;
$$;
create trigger guard_complete_test_refund before insert or update on public.annual_conference_ticket_refunds
  for each row execute function public.guard_complete_test_refund();

revoke all on function public.create_annual_conference_complete_test_hold(uuid, text, text, integer, jsonb, uuid, text),
  public.guard_complete_test_order_identity(), public.guard_complete_test_payment_domain(), public.guard_complete_test_ticket(),
  public.complete_test_email_context(text, uuid), public.guard_complete_test_email_lease(), public.guard_complete_test_refund()
  from public, anon, authenticated;
grant execute on function public.create_annual_conference_complete_test_hold(uuid, text, text, integer, jsonb, uuid, text),
  public.complete_test_email_context(text, uuid) to service_role;

create function public.claim_complete_test_aware_admission_emails(p_claim_token uuid, p_limit integer)
returns setof public.annual_conference_ticket_email_outbox
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.complete_test_email_dispatch', 'enabled', true);
  return query select * from public.claim_annual_conference_ticket_email_outbox(p_claim_token, p_limit);
end;
$$;
create function public.claim_complete_test_aware_social_emails(p_claim_token uuid, p_limit integer)
returns setof public.annual_conference_social_card_email_outbox
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.complete_test_email_dispatch', 'enabled', true);
  return query select * from public.claim_annual_conference_social_card_email_outbox(p_claim_token, p_limit);
end;
$$;
revoke all on function public.claim_complete_test_aware_admission_emails(uuid, integer),
  public.claim_complete_test_aware_social_emails(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_complete_test_aware_admission_emails(uuid, integer),
  public.claim_complete_test_aware_social_emails(uuid, integer) to service_role;

alter table public.annual_conference_social_cards add column is_test boolean not null default false;
create function public.mark_complete_test_badge()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.is_test := exists (select 1 from public.annual_conference_tickets t
    join public.annual_conference_ticket_orders o on o.id = t.order_id
    where t.id = new.ticket_id and o.payment_mode = 'test');
  if new.is_test and new.public_enabled then raise exception 'test_badge_public_sharing_unavailable'; end if;
  return new;
end;
$$;
create trigger mark_complete_test_badge before insert or update on public.annual_conference_social_cards
  for each row execute function public.mark_complete_test_badge();
revoke all on function public.mark_complete_test_badge() from public, anon, authenticated;

-- Activate internal lifecycle only. The public checkout requires 'public', so
-- this cannot open live sales. The separate test flag and tester settings remain off/unchanged.
update public.annual_conference_ticketing_settings s
  set flexible_checkout_state = 'internal'
  from public.annual_conference_editions e
  where e.id = s.edition_id and e.year = 2026 and s.flexible_checkout_state = 'foundation';

-- Shared rehearsal capacity must be cleared by a separately reviewed cleanup
-- before live launch. The settings lock serializes this with test hold creation.
create function public.guard_complete_test_live_launch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.flexible_checkout_state = 'public' and exists (
    select 1 from public.annual_conference_ticket_orders
      where edition_id = new.edition_id and payment_mode = 'test'
  ) then
    raise exception 'complete_test_cleanup_required_before_live_launch';
  end if;
  return new;
end;
$$;
create trigger guard_complete_test_live_launch before insert or update on public.annual_conference_ticketing_settings
  for each row execute function public.guard_complete_test_live_launch();
revoke all on function public.guard_complete_test_live_launch() from public, anon, authenticated;
