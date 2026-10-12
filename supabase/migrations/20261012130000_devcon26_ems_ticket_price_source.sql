-- The EMS edition settings are the single price source for the public catalog
-- and the isolated test checkout. Existing prepared sessions remain immutable.
alter table public.devcon26_test_coupon_codes
  drop constraint devcon26_test_coupon_codes_check,
  add constraint devcon26_test_coupon_codes_discount_check check (
    (discount_type = 'percentage_bps' and discount_value < 10000)
    or (discount_type = 'fixed_minor' and discount_value > 0)
  );

create or replace function public.create_devcon26_test_coupon(
  p_year integer, p_code text, p_discount_type text, p_discount_value integer,
  p_eligible_tiers text[], p_expires_at timestamptz, p_max_completed integer, p_actor_email text
) returns public.devcon26_test_coupon_codes
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  coupon public.devcon26_test_coupon_codes;
  v_edition_id uuid;
  settings public.annual_conference_ticketing_settings;
  eligible_tier text;
  eligible_price integer;
  lowest_price integer;
begin
  if p_year <> 2026 or p_expires_at <= now() or p_actor_email is null or length(btrim(p_actor_email)) = 0 then
    raise exception 'test_coupon_invalid';
  end if;

  if p_discount_type = 'fixed_minor' then
    select edition.id into v_edition_id
    from public.annual_conference_editions as edition
    where edition.year = 2026;

    select ticket_settings.* into settings
    from public.annual_conference_ticketing_settings as ticket_settings
    where ticket_settings.edition_id = v_edition_id
    for share;

    if settings.edition_id is null then raise exception 'test_coupon_invalid'; end if;

    foreach eligible_tier in array p_eligible_tiers loop
      eligible_price := case eligible_tier
        when 'regular' then settings.regular_price_minor
        when 'team_3' then settings.team_3_price_minor
        when 'team_5' then settings.team_5_price_minor
        else null
      end;

      if eligible_price is null then raise exception 'test_coupon_invalid'; end if;
      lowest_price := least(coalesce(lowest_price, eligible_price), eligible_price);
    end loop;

    if lowest_price is null or p_discount_value >= lowest_price then
      raise exception 'test_coupon_invalid';
    end if;
  end if;

  insert into public.devcon26_test_coupon_codes (
    edition_year, code, discount_type, discount_value, eligible_tiers, expires_at, max_completed,
    created_by_email, updated_by_email
  ) values (
    p_year, upper(btrim(p_code)), p_discount_type, p_discount_value,
    array(select distinct unnest(p_eligible_tiers)), p_expires_at, p_max_completed,
    lower(btrim(p_actor_email)), lower(btrim(p_actor_email))
  ) returning * into coupon;

  return coupon;
end;
$$;

create or replace function public.quote_devcon26_test_checkout(p_tier_key text, p_coupon_code text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_edition_id uuid;
  settings public.annual_conference_ticketing_settings;
  coupon public.devcon26_test_coupon_codes;
  normalized_code text := nullif(upper(btrim(p_coupon_code)), '');
  price integer;
  seats integer;
  discount integer := 0;
  used integer;
begin
  select edition.id into v_edition_id
  from public.annual_conference_editions as edition
  where edition.year = 2026;

  select ticket_settings.* into settings
  from public.annual_conference_ticketing_settings as ticket_settings
  where ticket_settings.edition_id = v_edition_id
  for share;

  if settings.edition_id is null then raise exception 'test_checkout_pricing_unavailable'; end if;

  case p_tier_key
    when 'regular' then price := settings.regular_price_minor; seats := 1;
    when 'team_3' then price := settings.team_3_price_minor; seats := 3;
    when 'team_5' then price := settings.team_5_price_minor; seats := 5;
    else raise exception 'test_checkout_invalid_tier';
  end case;

  if normalized_code is not null then
    select * into coupon from public.devcon26_test_coupon_codes where edition_year = 2026 and code = normalized_code;
    if not found then raise exception 'test_coupon_invalid'; end if;
    if not coupon.enabled then raise exception 'test_coupon_unavailable'; end if;
    if coupon.expires_at <= now() then raise exception 'test_coupon_expired'; end if;
    if not p_tier_key = any(coupon.eligible_tiers) then raise exception 'test_coupon_ineligible'; end if;
    select count(*) into used from public.devcon26_test_coupon_claims
      where coupon_id = coupon.id and (status = 'completed' or (status = 'held' and expires_at > now()));
    if used >= coupon.max_completed then raise exception 'test_coupon_unavailable'; end if;
    discount := case when coupon.discount_type = 'fixed_minor' then coupon.discount_value
      else (price::bigint * coupon.discount_value / 10000)::integer end;
    if discount <= 0 or discount >= price then raise exception 'test_coupon_invalid'; end if;
  end if;

  return jsonb_build_object('mode', 'test', 'tier_key', p_tier_key, 'quantity', seats, 'currency', settings.currency,
    'base_amount_minor', price, 'discount_amount_minor', discount, 'final_amount_minor', price - discount,
    'coupon_applied', normalized_code);
end;
$$;

revoke all on function public.create_devcon26_test_coupon(integer, text, text, integer, text[], timestamptz, integer, text) from public, anon, authenticated;
grant execute on function public.create_devcon26_test_coupon(integer, text, text, integer, text[], timestamptz, integer, text) to service_role;
revoke all on function public.quote_devcon26_test_checkout(text, text) from public, anon, authenticated;
grant execute on function public.quote_devcon26_test_checkout(text, text) to service_role;

comment on function public.quote_devcon26_test_checkout(text, text) is 'Quotes isolated DevCon26 sandbox checkout using current EMS edition prices; prepared sessions retain immutable price snapshots.';
