create table public.monthly_meetup_finance_expenses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.community_events(id) on delete cascade,
  category text not null,
  description text not null,
  amount_minor bigint not null,
  currency text not null default 'GHS',
  status text not null default 'paid',
  vendor text,
  expense_date date not null,
  notes text,
  created_by_email text,
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_meetup_finance_expenses_category_check check (
    category in (
      'venue',
      'catering',
      'av_connectivity',
      'creative_printing',
      'media',
      'transport',
      'speaker_support',
      'supplies',
      'other'
    )
  ),
  constraint monthly_meetup_finance_expenses_description_not_blank check (length(trim(description)) > 0),
  constraint monthly_meetup_finance_expenses_amount_check check (amount_minor > 0),
  constraint monthly_meetup_finance_expenses_currency_check check (currency = 'GHS'),
  constraint monthly_meetup_finance_expenses_status_check check (status in ('paid', 'unpaid', 'cancelled'))
);

create index monthly_meetup_finance_expenses_event_date_idx
  on public.monthly_meetup_finance_expenses (event_id, expense_date desc, created_at desc);

create trigger set_monthly_meetup_finance_expenses_updated_at
before update on public.monthly_meetup_finance_expenses
for each row execute function public.set_updated_at();

alter table public.monthly_meetup_finance_expenses enable row level security;

revoke all on table public.monthly_meetup_finance_expenses from public, anon, authenticated;
grant select, insert, update on table public.monthly_meetup_finance_expenses to service_role;
