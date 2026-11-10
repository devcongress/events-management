-- Preserve existing counter settings while allowing an independently editable baseline.
alter table public.annual_conference_attendance_counters
  add column baseline integer not null default 20
  constraint annual_conference_attendance_counters_baseline_nonnegative check (baseline >= 0);

create function public.read_annual_conference_ticket_counter(p_year integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  selected_edition_id uuid;
  counter_baseline integer;
  counter_version integer;
  purchased bigint;
begin
  select id into selected_edition_id from public.annual_conference_editions where year = p_year;
  if selected_edition_id is null then return null; end if;

  select baseline, version into counter_baseline, counter_version
  from public.annual_conference_attendance_counters where annual_conference_attendance_counters.edition_id = selected_edition_id;
  purchased := (public.read_annual_conference_attendance_counter(p_year)->>'purchases')::bigint;

  return jsonb_build_object('count', coalesce(counter_baseline, 20) + purchased,
    'source', 'ticket_count', 'baseline', coalesce(counter_baseline, 20),
    'purchases', purchased, 'version', coalesce(counter_version, 0));
end;
$$;

create function public.set_annual_conference_attendance_baseline(p_year integer, p_baseline integer, p_version integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  selected_edition_id uuid;
begin
  if p_baseline is null or p_baseline < 0 then raise exception 'attendance_baseline_invalid'; end if;

  select id into selected_edition_id from public.annual_conference_editions where year = p_year;
  if selected_edition_id is null then raise exception 'attendance_counter_edition_missing'; end if;

  if p_version = 0 then
    insert into public.annual_conference_attendance_counters (edition_id, source, baseline)
    values (selected_edition_id, 'actual', p_baseline)
    on conflict do nothing;
  else
    update public.annual_conference_attendance_counters
    set baseline = p_baseline, version = version + 1
    where edition_id = selected_edition_id and version = p_version;
  end if;
  if not found then raise exception 'attendance_baseline_conflict'; end if;

  return public.read_annual_conference_ticket_counter(p_year);
end;
$$;

revoke all on function public.read_annual_conference_ticket_counter(integer) from public, anon, authenticated;
revoke all on function public.set_annual_conference_attendance_baseline(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.read_annual_conference_ticket_counter(integer) to service_role;
grant execute on function public.set_annual_conference_attendance_baseline(integer, integer, integer) to service_role;
