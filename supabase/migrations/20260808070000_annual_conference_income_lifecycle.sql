alter table public.annual_conference_finance_entries
  add column original_amount_minor bigint,
  add column source_type text not null default 'manual',
  add column source_reference text;

update public.annual_conference_finance_entries
set original_amount_minor = amount_minor
where original_amount_minor is null;

alter table public.annual_conference_finance_entries
  alter column original_amount_minor set not null,
  add constraint annual_conference_finance_entries_original_amount_check check (original_amount_minor > 0),
  add constraint annual_conference_finance_entries_source_type_check check (source_type in ('manual', 'sponsor', 'ticket')),
  drop constraint annual_conference_finance_entries_status_check,
  add constraint annual_conference_finance_entries_status_check check (
    (kind = 'expense' and status in ('draft', 'committed', 'paid', 'cancelled'))
    or (kind = 'income' and status in ('expected', 'partially_received', 'received', 'cancelled'))
  );

create table public.annual_conference_finance_income_amendments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.annual_conference_finance_entries(id) on delete cascade,
  previous_amount_minor bigint not null,
  next_amount_minor bigint not null,
  action text not null default 'amend',
  reason text not null,
  created_by_email text,
  created_at timestamptz not null default now(),
  constraint annual_conference_finance_income_amendments_amount_check check (
    previous_amount_minor > 0 and next_amount_minor >= 0
  ),
  constraint annual_conference_finance_income_amendments_action_check check (action in ('amend', 'cancel')),
  constraint annual_conference_finance_income_amendments_reason_not_blank check (length(trim(reason)) > 0)
);

create table public.annual_conference_finance_income_receipts (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.annual_conference_finance_entries(id) on delete cascade,
  amount_minor bigint not null,
  received_date date not null,
  payment_reference text,
  notes text,
  created_by_email text,
  created_at timestamptz not null default now(),
  constraint annual_conference_finance_income_receipts_amount_check check (amount_minor > 0)
);

create index annual_conference_finance_income_amendments_entry_idx
  on public.annual_conference_finance_income_amendments (entry_id, created_at asc);

create index annual_conference_finance_income_receipts_entry_idx
  on public.annual_conference_finance_income_receipts (entry_id, received_date desc, created_at desc);

alter table public.annual_conference_finance_income_amendments enable row level security;
alter table public.annual_conference_finance_income_receipts enable row level security;

revoke all on table public.annual_conference_finance_income_amendments from public, anon, authenticated;
revoke all on table public.annual_conference_finance_income_receipts from public, anon, authenticated;
grant select, insert on table public.annual_conference_finance_income_amendments to service_role;
grant select, insert on table public.annual_conference_finance_income_receipts to service_role;

create or replace function public.amend_annual_conference_income_expectation(
  p_entry_id uuid,
  p_next_amount_minor bigint,
  p_reason text,
  p_actor_email text
)
returns public.annual_conference_finance_entries
language plpgsql
set search_path = public
as $$
declare
  v_entry public.annual_conference_finance_entries;
  v_received_minor bigint;
begin
  select * into v_entry
  from public.annual_conference_finance_entries
  where id = p_entry_id
  for update;

  if not found then
    raise exception 'Finance income record was not found.';
  end if;
  if v_entry.kind <> 'income' or v_entry.source_type <> 'manual' then
    raise exception 'Only manual income expectations can be amended here.';
  end if;
  if v_entry.status = 'cancelled' then
    raise exception 'A cancelled expectation cannot be amended.';
  end if;

  select coalesce(sum(amount_minor), 0) into v_received_minor
  from public.annual_conference_finance_income_receipts
  where entry_id = p_entry_id;
  if v_entry.status = 'received' and v_received_minor = 0 then
    v_received_minor := v_entry.amount_minor;
  end if;
  if p_next_amount_minor < v_received_minor then
    raise exception 'The revised expected amount cannot be lower than money already received.';
  end if;

  insert into public.annual_conference_finance_income_amendments (
    entry_id, previous_amount_minor, next_amount_minor, action, reason, created_by_email
  ) values (
    p_entry_id, v_entry.amount_minor, p_next_amount_minor, 'amend', p_reason, p_actor_email
  );

  update public.annual_conference_finance_entries
  set amount_minor = p_next_amount_minor,
      status = case
        when v_received_minor = 0 then 'expected'
        when v_received_minor < p_next_amount_minor then 'partially_received'
        else 'received'
      end,
      updated_by_email = p_actor_email
  where id = p_entry_id
  returning * into v_entry;

  return v_entry;
end;
$$;

create or replace function public.record_annual_conference_income_receipt(
  p_entry_id uuid,
  p_amount_minor bigint,
  p_received_date date,
  p_payment_reference text,
  p_notes text,
  p_actor_email text
)
returns public.annual_conference_finance_entries
language plpgsql
set search_path = public
as $$
declare
  v_entry public.annual_conference_finance_entries;
  v_received_minor bigint;
begin
  select * into v_entry
  from public.annual_conference_finance_entries
  where id = p_entry_id
  for update;

  if not found then
    raise exception 'Finance income record was not found.';
  end if;
  if v_entry.kind <> 'income' or v_entry.source_type <> 'manual' then
    raise exception 'Only manual income expectations can receive payments here.';
  end if;
  if v_entry.status = 'cancelled' then
    raise exception 'A cancelled expectation cannot receive a payment.';
  end if;

  select coalesce(sum(amount_minor), 0) into v_received_minor
  from public.annual_conference_finance_income_receipts
  where entry_id = p_entry_id;
  if v_entry.status = 'received' and v_received_minor = 0 then
    raise exception 'This income record was marked received when it was created and cannot accept another receipt.';
  end if;
  if v_received_minor + p_amount_minor > v_entry.amount_minor then
    raise exception 'This payment is higher than the outstanding expected amount.';
  end if;

  insert into public.annual_conference_finance_income_receipts (
    entry_id, amount_minor, received_date, payment_reference, notes, created_by_email
  ) values (
    p_entry_id, p_amount_minor, p_received_date, p_payment_reference, p_notes, p_actor_email
  );

  v_received_minor := v_received_minor + p_amount_minor;
  update public.annual_conference_finance_entries
  set status = case
        when v_received_minor < amount_minor then 'partially_received'
        else 'received'
      end,
      updated_by_email = p_actor_email
  where id = p_entry_id
  returning * into v_entry;

  return v_entry;
end;
$$;

create or replace function public.cancel_annual_conference_income_expectation(
  p_entry_id uuid,
  p_reason text,
  p_actor_email text
)
returns public.annual_conference_finance_entries
language plpgsql
set search_path = public
as $$
declare
  v_entry public.annual_conference_finance_entries;
  v_received_minor bigint;
begin
  select * into v_entry
  from public.annual_conference_finance_entries
  where id = p_entry_id
  for update;

  if not found then
    raise exception 'Finance income record was not found.';
  end if;
  if v_entry.kind <> 'income' or v_entry.source_type <> 'manual' then
    raise exception 'Only manual income expectations can be cancelled here.';
  end if;
  if v_entry.status = 'cancelled' then
    raise exception 'This expectation has already been cancelled.';
  end if;

  select coalesce(sum(amount_minor), 0) into v_received_minor
  from public.annual_conference_finance_income_receipts
  where entry_id = p_entry_id;
  if v_entry.status = 'received' and v_received_minor = 0 then
    v_received_minor := v_entry.amount_minor;
  end if;
  if v_received_minor > 0 then
    raise exception 'An expectation with money received cannot be cancelled.';
  end if;

  insert into public.annual_conference_finance_income_amendments (
    entry_id, previous_amount_minor, next_amount_minor, action, reason, created_by_email
  ) values (
    p_entry_id, v_entry.amount_minor, 0, 'cancel', p_reason, p_actor_email
  );

  update public.annual_conference_finance_entries
  set status = 'cancelled',
      updated_by_email = p_actor_email
  where id = p_entry_id
  returning * into v_entry;

  return v_entry;
end;
$$;

revoke all on function public.amend_annual_conference_income_expectation(uuid, bigint, text, text) from public, anon, authenticated;
revoke all on function public.record_annual_conference_income_receipt(uuid, bigint, date, text, text, text) from public, anon, authenticated;
revoke all on function public.cancel_annual_conference_income_expectation(uuid, text, text) from public, anon, authenticated;
grant execute on function public.amend_annual_conference_income_expectation(uuid, bigint, text, text) to service_role;
grant execute on function public.record_annual_conference_income_receipt(uuid, bigint, date, text, text, text) to service_role;
grant execute on function public.cancel_annual_conference_income_expectation(uuid, text, text) to service_role;
