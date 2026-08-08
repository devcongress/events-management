create table if not exists public.email_delivery_health (
  provider text primary key default 'resend',
  daily_quota_used integer,
  daily_quota_limit integer not null default 100,
  monthly_quota_used integer,
  monthly_quota_limit integer not null default 3000,
  daily_level text not null default 'healthy',
  monthly_level text not null default 'healthy',
  last_provider_response_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_delivery_health_provider_check check (provider = 'resend'),
  constraint email_delivery_health_daily_used_nonnegative check (daily_quota_used is null or daily_quota_used >= 0),
  constraint email_delivery_health_daily_limit_positive check (daily_quota_limit > 0),
  constraint email_delivery_health_monthly_used_nonnegative check (monthly_quota_used is null or monthly_quota_used >= 0),
  constraint email_delivery_health_monthly_limit_positive check (monthly_quota_limit > 0),
  constraint email_delivery_health_daily_level_check check (daily_level in ('healthy', 'warning', 'high', 'exhausted')),
  constraint email_delivery_health_monthly_level_check check (monthly_level in ('healthy', 'warning', 'high', 'exhausted'))
);

drop trigger if exists set_email_delivery_health_updated_at on public.email_delivery_health;
create trigger set_email_delivery_health_updated_at
before update on public.email_delivery_health
for each row execute function public.set_updated_at();

alter table public.email_delivery_health enable row level security;
revoke all on table public.email_delivery_health from public, anon, authenticated;
grant select, insert, update on table public.email_delivery_health to service_role;

comment on table public.email_delivery_health is
  'Latest provider quota observation for owner-only email delivery health monitoring.';
