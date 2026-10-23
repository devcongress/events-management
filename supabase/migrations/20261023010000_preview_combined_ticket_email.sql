-- Opt-in for NEW preview orders only. No existing outbox rows are changed.
-- The new Worker opts in through the v2 hold RPC; applying SQL alone does not
-- alter checkout delivery. Live orders cannot opt in.
alter table public.annual_conference_ticket_orders
  add column preview_combined_email boolean not null default false,
  add constraint preview_combined_email_test_only check (not preview_combined_email or payment_mode = 'test');

create function public.guard_preview_combined_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.preview_combined_email is distinct from old.preview_combined_email then
    if old.preview_combined_email or new.payment_mode <> 'test' or new.status <> 'pending_payment'
      or exists (select 1 from public.annual_conference_ticket_payment_attempts where order_id = new.id) then
      raise exception 'preview_email_policy_immutable';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_preview_combined_email before update on public.annual_conference_ticket_orders
  for each row execute function public.guard_preview_combined_email();

create function public.create_complete_test_hold_v2(
  p_edition_id uuid, p_purchaser_name text, p_purchaser_email text,
  p_quantity integer, p_allocations jsonb, p_checkout_request_key uuid, p_origin text
) returns public.annual_conference_ticket_orders
language plpgsql security definer set search_path = public as $$
declare existing public.annual_conference_ticket_orders; result public.annual_conference_ticket_orders;
begin
  perform 1 from public.annual_conference_ticketing_settings where edition_id = p_edition_id for update;
  select * into existing from public.annual_conference_ticket_orders
    where edition_id = p_edition_id and flexible_cart_request_key = p_checkout_request_key;
  if existing.id is not null and not existing.preview_combined_email then
    raise exception 'flexible_ticket_checkout_request_conflict';
  end if;
  select * into result from public.create_annual_conference_complete_test_hold(
    p_edition_id, p_purchaser_name, p_purchaser_email, p_quantity, p_allocations, p_checkout_request_key, p_origin
  );
  if existing.id is null then
    update public.annual_conference_ticket_orders set preview_combined_email = true
      where id = result.id returning * into result;
  end if;
  return result;
end;
$$;

create function public.combine_preview_ticket_email() returns trigger
language plpgsql security definer set search_path = public as $$
declare ticket_order public.annual_conference_ticket_orders; target_id uuid;
begin
  select * into ticket_order from public.annual_conference_ticket_orders where id = new.order_id;
  if not coalesce(ticket_order.preview_combined_email, false) or ticket_order.payment_mode <> 'test' then return new; end if;
  -- Paystack owns the payment receipt. No duplicate receipt is queued.
  if new.kind = 'payment_receipt' then return null; end if;
  if new.kind in ('flexible_admission_delivery', 'flexible_order_management', 'flexible_gift_claim') then
    new.payload := new.payload || jsonb_build_object('email_version', 2);
  end if;
  if new.kind = 'flexible_admission_delivery' then
    new.payload := new.payload || jsonb_build_object('seat_number', (
      select order_seat_number from public.annual_conference_tickets
      where id::text = new.payload->>'ticket_id' and order_id = new.order_id
    ));
    -- Later QR reissues can reuse an existing badge without a new badge email.
    if exists (select 1 from public.annual_conference_social_cards
      where ticket_id::text = new.payload->>'ticket_id' and is_test and revoked_at is null) then
      new.payload := new.payload || jsonb_build_object('badge_included', true);
    end if;
  end if;
  if new.kind = 'flexible_order_management' then
    select d.id into target_id from public.annual_conference_ticket_email_outbox d
      join public.annual_conference_tickets t on t.id::text = d.payload->>'ticket_id' and t.order_id = d.order_id
      join public.annual_conference_flexible_ticket_allocations a on a.order_id = t.order_id and a.seat_index = t.order_seat_number
      where d.order_id = new.order_id and a.allocation_kind = 'self'
        and d.kind = 'flexible_admission_delivery' and d.payload->>'email_version' = '2'
        and d.recipient_email = new.recipient_email and new.recipient_email = ticket_order.purchaser_email
        and d.status = 'queued' and d.attempt_count = 0 and d.first_attempt_at is null
        and d.provider_payload is null and d.provider_email_id is null and d.accepted_at is null
      for update of d;
    if target_id is not null then
      -- Existing scrub trigger removes capability on acceptance/reconciliation.
      update public.annual_conference_ticket_email_outbox
        set payload = payload || jsonb_build_object('capability', new.payload->>'capability') where id = target_id;
      return null;
    end if;
  end if;
  -- A purchaser without a self ticket still needs their management email.
  return new;
end;
$$;
create trigger combine_preview_ticket_email before insert on public.annual_conference_ticket_email_outbox
  for each row execute function public.combine_preview_ticket_email();

create function public.combine_preview_badge_email() returns trigger
language plpgsql security definer set search_path = public as $$
declare target_id uuid;
begin
  select d.id into target_id from public.annual_conference_social_cards c
    join public.annual_conference_tickets t on t.id = c.ticket_id
    join public.annual_conference_ticket_orders o on o.id = t.order_id
    join public.annual_conference_ticket_email_outbox d on d.order_id = o.id and d.payload->>'ticket_id' = t.id::text
    where c.id = new.social_card_id and c.is_test and o.payment_mode = 'test' and o.preview_combined_email
      and d.kind = 'flexible_admission_delivery' and d.recipient_email = new.recipient_email
      and d.payload->>'email_version' = '2' and not (d.payload ? 'badge_included')
      and d.status = 'queued' and d.attempt_count = 0 and d.first_attempt_at is null
      and d.provider_payload is null and d.provider_email_id is null and d.accepted_at is null
    for update of d;
  if target_id is not null then
    -- The sender signs a seat-scoped badge link; no extra raw capability is copied.
    update public.annual_conference_ticket_email_outbox
      set payload = payload || jsonb_build_object('badge_included', true) where id = target_id;
    return null;
  end if;
  -- Explicit later badge reissues and unrelated queued mail retain their behavior.
  return new;
end;
$$;
create trigger combine_preview_badge_email before insert on public.annual_conference_social_card_email_outbox
  for each row execute function public.combine_preview_badge_email();

revoke all on function public.guard_preview_combined_email(), public.create_complete_test_hold_v2(uuid,text,text,integer,jsonb,uuid,text),
  public.combine_preview_ticket_email(), public.combine_preview_badge_email() from public, anon, authenticated;
grant execute on function public.guard_preview_combined_email(), public.create_complete_test_hold_v2(uuid,text,text,integer,jsonb,uuid,text),
  public.combine_preview_ticket_email(), public.combine_preview_badge_email() to service_role;
