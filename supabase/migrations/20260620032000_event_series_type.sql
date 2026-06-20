alter table public.community_events
  add column if not exists series_type text;

update public.community_events
set series_type = case
  when name ilike '%quarterly%' then 'quarterly'
  else 'monthly'
end
where series_type is null;

alter table public.community_events
  drop constraint if exists community_events_series_type_valid,
  add constraint community_events_series_type_valid
    check (series_type is null or series_type in ('monthly', 'quarterly', 'special'));

create index if not exists community_events_series_type_idx
  on public.community_events (series_type, starts_at desc);
