do $$
begin
  if not exists (select 1 from pg_type where typname = 'annual_conference_ticket_sales_status') then
    create type public.annual_conference_ticket_sales_status as enum ('draft', 'open', 'closed');
  end if;

  if not exists (select 1 from pg_type where typname = 'annual_conference_ticket_order_status') then
    create type public.annual_conference_ticket_order_status as enum ('pending_payment', 'paid', 'refunded', 'expired', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'annual_conference_ticket_status') then
    create type public.annual_conference_ticket_status as enum ('pending', 'issued', 'cancelled', 'checked_in');
  end if;
end $$;

create table public.annual_conference_ticketing_settings (
  edition_id uuid primary key references public.annual_conference_editions(id) on delete cascade,
  public_capacity integer not null default 200,
  sales_status public.annual_conference_ticket_sales_status not null default 'draft',
  currency text not null default 'GHS',
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annual_conference_ticketing_settings_capacity check (public_capacity > 0),
  constraint annual_conference_ticketing_settings_currency check (currency = 'GHS')
);

create table public.annual_conference_sponsor_ticket_allocations (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.annual_conference_editions(id) on delete cascade,
  sponsor_name text not null,
  contact_name text not null,
  contact_email text not null,
  quantity integer not null,
  created_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annual_conference_sponsor_ticket_allocations_name check (length(trim(sponsor_name)) > 0),
  constraint annual_conference_sponsor_ticket_allocations_contact check (length(trim(contact_name)) > 0),
  constraint annual_conference_sponsor_ticket_allocations_email check (length(trim(contact_email)) > 0),
  constraint annual_conference_sponsor_ticket_allocations_quantity check (quantity > 0),
  constraint annual_conference_sponsor_ticket_allocations_id_edition_unique unique (id, edition_id)
);

create table public.annual_conference_ticket_orders (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.annual_conference_editions(id) on delete restrict,
  status public.annual_conference_ticket_order_status not null default 'pending_payment',
  purchaser_name text not null,
  purchaser_email text not null,
  tier_key text not null,
  quantity integer not null,
  amount_minor integer not null,
  currency text not null default 'GHS',
  payment_reference text unique,
  provider text,
  expires_at timestamptz,
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annual_conference_ticket_orders_purchaser check (length(trim(purchaser_name)) > 0 and length(trim(purchaser_email)) > 0),
  constraint annual_conference_ticket_orders_quantity check (quantity in (1, 3, 5)),
  constraint annual_conference_ticket_orders_amount check (amount_minor >= 0),
  constraint annual_conference_ticket_orders_currency check (currency = 'GHS'),
  constraint annual_conference_ticket_orders_id_edition_unique unique (id, edition_id)
);

create table public.annual_conference_tickets (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.annual_conference_editions(id) on delete restrict,
  order_id uuid,
  sponsor_allocation_id uuid,
  status public.annual_conference_ticket_status not null default 'pending',
  attendee_name text,
  attendee_email text,
  qr_token_hash text unique,
  issued_at timestamptz,
  checked_in_at timestamptz,
  checked_in_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annual_conference_tickets_source check ((order_id is not null)::integer + (sponsor_allocation_id is not null)::integer = 1),
  constraint annual_conference_tickets_identity check (
    status = 'pending'
    or (coalesce(trim(attendee_name), '') <> '' and coalesce(trim(attendee_email), '') <> '')
  ),
  constraint annual_conference_tickets_order_edition_fkey
    foreign key (order_id, edition_id)
    references public.annual_conference_ticket_orders (id, edition_id)
    on delete restrict,
  constraint annual_conference_tickets_sponsor_allocation_edition_fkey
    foreign key (sponsor_allocation_id, edition_id)
    references public.annual_conference_sponsor_ticket_allocations (id, edition_id)
    on delete restrict
);

create index annual_conference_ticket_orders_edition_status_idx on public.annual_conference_ticket_orders (edition_id, status, created_at desc);
create index annual_conference_tickets_edition_status_idx on public.annual_conference_tickets (edition_id, status, created_at desc);
create index annual_conference_sponsor_ticket_allocations_edition_idx on public.annual_conference_sponsor_ticket_allocations (edition_id, created_at desc);

create trigger set_annual_conference_ticketing_settings_updated_at before update on public.annual_conference_ticketing_settings for each row execute function public.set_updated_at();
create trigger set_annual_conference_sponsor_ticket_allocations_updated_at before update on public.annual_conference_sponsor_ticket_allocations for each row execute function public.set_updated_at();
create trigger set_annual_conference_ticket_orders_updated_at before update on public.annual_conference_ticket_orders for each row execute function public.set_updated_at();
create trigger set_annual_conference_tickets_updated_at before update on public.annual_conference_tickets for each row execute function public.set_updated_at();

alter table public.annual_conference_ticketing_settings enable row level security;
alter table public.annual_conference_sponsor_ticket_allocations enable row level security;
alter table public.annual_conference_ticket_orders enable row level security;
alter table public.annual_conference_tickets enable row level security;

grant usage on type public.annual_conference_ticket_sales_status to service_role;
grant usage on type public.annual_conference_ticket_order_status to service_role;
grant usage on type public.annual_conference_ticket_status to service_role;
grant select, insert, update, delete on public.annual_conference_ticketing_settings to service_role;
grant select, insert, update, delete on public.annual_conference_sponsor_ticket_allocations to service_role;
grant select, insert, update, delete on public.annual_conference_ticket_orders to service_role;
grant select, insert, update, delete on public.annual_conference_tickets to service_role;

comment on table public.annual_conference_ticketing_settings is 'Edition-scoped paid-ticket inventory settings. Public capacity begins at 200 and is changed through audited server commands.';
comment on table public.annual_conference_sponsor_ticket_allocations is 'Private named sponsor allocations; they are not public free-ticket tiers.';
comment on table public.annual_conference_ticket_orders is 'Immutable paid-order records. Payment confirmation must be verified server-side before tickets issue.';
comment on table public.annual_conference_tickets is 'Individual attendee tickets; one row per seat, including group-pack and sponsor tickets.';
