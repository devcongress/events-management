-- Each event can keep its own number of Resend sends available for
-- registrations and organizer decisions. A null value intentionally falls
-- back to the deployment-wide operational default.
alter table public.event_registration_campaigns
  add column if not exists blast_transactional_reserve integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_registration_campaigns_blast_transactional_reserve_range'
      and conrelid = 'public.event_registration_campaigns'::regclass
  ) then
    alter table public.event_registration_campaigns
      add constraint event_registration_campaigns_blast_transactional_reserve_range
      check (
        blast_transactional_reserve is null
        or (blast_transactional_reserve >= 0 and blast_transactional_reserve <= 10000)
      );
  end if;
end $$;

comment on column public.event_registration_campaigns.blast_transactional_reserve is
  'Event-specific Resend capacity held for transactional messages; null uses the deployment default.';
