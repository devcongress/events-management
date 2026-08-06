create table public.annual_conference_finance_budgets (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.annual_conference_editions(id) on delete cascade,
  category text not null,
  label text not null,
  amount_minor bigint not null,
  currency text not null default 'GHS',
  created_by_email text,
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annual_conference_finance_budgets_category_check check (
    category in (
      'venue',
      'catering',
      'av_connectivity',
      'creative_printing',
      'media',
      'badges',
      'signage',
      'swag',
      'transport',
      'speaker_support',
      'contingency',
      'other'
    )
  ),
  constraint annual_conference_finance_budgets_label_not_blank check (length(trim(label)) > 0),
  constraint annual_conference_finance_budgets_amount_check check (amount_minor >= 0),
  constraint annual_conference_finance_budgets_currency_check check (currency = 'GHS')
);

create table public.annual_conference_finance_entries (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.annual_conference_editions(id) on delete cascade,
  kind text not null,
  category text not null,
  description text not null,
  amount_minor bigint not null,
  currency text not null default 'GHS',
  status text not null,
  vendor text,
  entry_date date,
  notes text,
  created_by_email text,
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annual_conference_finance_entries_kind_check check (kind in ('expense', 'income')),
  constraint annual_conference_finance_entries_category_check check (
    category in (
      'venue',
      'catering',
      'av_connectivity',
      'creative_printing',
      'media',
      'badges',
      'signage',
      'swag',
      'transport',
      'speaker_support',
      'contingency',
      'other'
    )
  ),
  constraint annual_conference_finance_entries_description_not_blank check (length(trim(description)) > 0),
  constraint annual_conference_finance_entries_amount_check check (amount_minor > 0),
  constraint annual_conference_finance_entries_currency_check check (currency = 'GHS'),
  constraint annual_conference_finance_entries_status_check check (
    (kind = 'expense' and status in ('draft', 'committed', 'paid', 'cancelled'))
    or (kind = 'income' and status in ('expected', 'received', 'cancelled'))
  )
);

create index annual_conference_finance_budgets_edition_idx
  on public.annual_conference_finance_budgets (edition_id, category);

create index annual_conference_finance_entries_edition_idx
  on public.annual_conference_finance_entries (edition_id, kind, status, entry_date desc);

create trigger set_annual_conference_finance_budgets_updated_at
before update on public.annual_conference_finance_budgets
for each row execute function public.set_updated_at();

create trigger set_annual_conference_finance_entries_updated_at
before update on public.annual_conference_finance_entries
for each row execute function public.set_updated_at();

alter table public.annual_conference_finance_budgets enable row level security;
alter table public.annual_conference_finance_entries enable row level security;

revoke all on table public.annual_conference_finance_budgets from public, anon, authenticated;
revoke all on table public.annual_conference_finance_entries from public, anon, authenticated;
grant select, insert, update on table public.annual_conference_finance_budgets to service_role;
grant select, insert, update on table public.annual_conference_finance_entries to service_role;
