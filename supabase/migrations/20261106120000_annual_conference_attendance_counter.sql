-- Counter settings are owner-controlled through service-role-only functions.
create table public.annual_conference_attendance_counters (
  edition_id uuid primary key references public.annual_conference_editions(id),
  source text not null check (source in ('estimate', 'actual')),
  published_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0)
);
alter table public.annual_conference_attendance_counters enable row level security;
revoke all on public.annual_conference_attendance_counters from public, anon, authenticated;

create function public.read_annual_conference_attendance_counter(p_year integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  edition public.annual_conference_editions;
  counter public.annual_conference_attendance_counters;
  periods integer;
  total integer;
begin
  select * into edition from public.annual_conference_editions where year = p_year;
  if edition.id is null then return null; end if;
  select * into counter from public.annual_conference_attendance_counters where edition_id = edition.id;
  if counter.edition_id is null then return jsonb_build_object('count', null, 'source', null, 'version', 0); end if;
  if counter.source = 'estimate' then
    if edition.provisional_date is null then raise exception 'attendance_counter_date_missing'; end if;
    periods := greatest(0, floor(extract(epoch from (least(now(), (edition.provisional_date::timestamp at time zone 'Africa/Accra') - interval '1 microsecond') - counter.published_at)) / 172800)::integer);
    total := 20 + (periods / 3) * 6 + case periods % 3 when 1 then 1 when 2 then 3 else 0 end;
  else
    with admissions as (
      select lower(btrim(r.email)) as email
      from public.annual_conference_registrations r
      where r.edition_id = edition.id and r.status = 'confirmed' and not r.is_test
      union all
      select lower(btrim(t.attendee_email))
      from public.annual_conference_tickets t
      left join public.annual_conference_ticket_orders o on o.id = t.order_id
      where t.edition_id = edition.id and t.status in ('issued', 'checked_in') and t.registration_id is null
        and (t.sponsor_allocation_id is not null or (o.payment_mode = 'live' and o.status = 'paid'))
    ), speakers as (
      select distinct lower(btrim(s.speaker_email)) as email
      from public.annual_conference_sessions s
      where s.edition_id = edition.id and s.status = 'confirmed' and btrim(s.speaker_email) <> ''
    )
    select (select count(*) from admissions) + (select count(*) from speakers s where not exists (select 1 from admissions a where a.email = s.email)) into total;
  end if;
  return jsonb_build_object('count', total, 'source', counter.source, 'version', counter.version);
end;
$$;

create function public.configure_annual_conference_attendance_counter(p_year integer, p_source text, p_version integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare edition public.annual_conference_editions;
begin
  select * into edition from public.annual_conference_editions where year = p_year;
  if edition.id is null then raise exception 'attendance_counter_edition_missing'; end if;
  if p_source not in ('estimate', 'actual') then raise exception 'attendance_counter_invalid'; end if;
  if p_source = 'estimate' and (edition.provisional_date is null or now() >= (edition.provisional_date::timestamp at time zone 'Africa/Accra')) then raise exception 'attendance_counter_date_missing'; end if;
  if p_version = 0 then
    insert into public.annual_conference_attendance_counters (edition_id, source) values (edition.id, p_source)
    on conflict do nothing;
    if not found then raise exception 'attendance_counter_changed'; end if;
  else
    update public.annual_conference_attendance_counters set source = 'actual', version = version + 1
    where edition_id = edition.id and version = p_version and source = 'estimate' and p_source = 'actual';
    if not found then raise exception 'attendance_counter_changed'; end if;
  end if;
  return public.read_annual_conference_attendance_counter(p_year);
end;
$$;
revoke all on function public.read_annual_conference_attendance_counter(integer) from public, anon, authenticated;
revoke all on function public.configure_annual_conference_attendance_counter(integer, text, integer) from public, anon, authenticated;
grant execute on function public.read_annual_conference_attendance_counter(integer) to service_role;
grant execute on function public.configure_annual_conference_attendance_counter(integer, text, integer) to service_role;
