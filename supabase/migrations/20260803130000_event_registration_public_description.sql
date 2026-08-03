alter table public.event_registration_campaigns
  add column if not exists description text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_registration_campaigns_description_length'
      and conrelid = 'public.event_registration_campaigns'::regclass
  ) then
    alter table public.event_registration_campaigns
      add constraint event_registration_campaigns_description_length
      check (description is null or char_length(description) <= 2000);
  end if;
end $$;

comment on column public.event_registration_campaigns.description is
  'Optional plain-text introduction shown on the public registration form; separate from the event About description.';
