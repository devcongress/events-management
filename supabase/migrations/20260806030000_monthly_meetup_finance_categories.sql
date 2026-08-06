create table if not exists public.monthly_meetup_finance_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  created_by_email text,
  created_at timestamptz not null default now(),
  constraint monthly_meetup_finance_categories_name_check check (
    length(trim(name)) between 1 and 80
  ),
  constraint monthly_meetup_finance_categories_normalized_name_key unique (normalized_name)
);

alter table public.monthly_meetup_finance_categories enable row level security;

revoke all on table public.monthly_meetup_finance_categories from public, anon, authenticated;
grant select, insert on table public.monthly_meetup_finance_categories to service_role;

insert into public.monthly_meetup_finance_categories (name, normalized_name)
select
  trim(category),
  lower(regexp_replace(trim(category), '\s+', ' ', 'g'))
from public.monthly_meetup_finance_expenses
where length(trim(category)) > 0
group by trim(category), lower(regexp_replace(trim(category), '\s+', ' ', 'g'))
on conflict (normalized_name) do nothing;

insert into public.monthly_meetup_finance_categories (name, normalized_name)
values
  ('Venue', 'venue'),
  ('Food and refreshments', 'food and refreshments'),
  ('Connectivity', 'connectivity'),
  ('Transport', 'transport'),
  ('Promotion', 'promotion'),
  ('Supplies', 'supplies'),
  ('Speaker support', 'speaker support'),
  ('Other', 'other')
on conflict (normalized_name) do nothing;

alter table public.monthly_meetup_finance_expenses
  drop constraint if exists monthly_meetup_finance_expenses_category_check;

alter table public.monthly_meetup_finance_expenses
  add constraint monthly_meetup_finance_expenses_category_not_blank
  check (length(trim(category)) between 1 and 80);
