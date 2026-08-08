-- Forward-only integrity hardening for already-deployed annual-conference and
-- shared-document schemas.  Application checks remain useful for friendly
-- errors; these constraints make the invariants hold under concurrent writes.

alter table public.app_json_documents
  add column if not exists version bigint not null default 0;

create or replace function public.replace_app_json_document(
  p_key text,
  p_expected_version bigint,
  p_data jsonb
)
returns public.app_json_documents
language plpgsql
set search_path = public
as $$
declare
  v_document public.app_json_documents;
begin
  if jsonb_typeof(p_data) <> 'array' then
    raise exception 'Shared document data must be an array.';
  end if;

  update public.app_json_documents
  set data = p_data,
      version = version + 1
  where key = p_key
    and version = p_expected_version
  returning * into v_document;

  if found then return v_document; end if;

  if p_expected_version = 0 then
    insert into public.app_json_documents (key, data, version)
    values (p_key, p_data, 1)
    on conflict (key) do nothing
    returning * into v_document;
    if found then return v_document; end if;
  end if;

  raise exception 'shared_document_conflict';
end;
$$;

revoke all on function public.replace_app_json_document(text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.replace_app_json_document(text, bigint, jsonb) to service_role;

alter table public.annual_conference_finance_income_receipts
  add column if not exists idempotency_key uuid;

update public.annual_conference_finance_income_receipts
set idempotency_key = gen_random_uuid()
where idempotency_key is null;

alter table public.annual_conference_finance_income_receipts
  alter column idempotency_key set not null;

create unique index if not exists annual_conference_finance_income_receipts_idempotency_idx
  on public.annual_conference_finance_income_receipts (entry_id, idempotency_key);

create or replace function public.record_annual_conference_income_receipt(
  p_entry_id uuid,
  p_amount_minor bigint,
  p_received_date date,
  p_payment_reference text,
  p_notes text,
  p_actor_email text,
  p_idempotency_key uuid
)
returns public.annual_conference_finance_entries
language plpgsql
set search_path = public
as $$
declare
  v_entry public.annual_conference_finance_entries;
  v_existing_receipt public.annual_conference_finance_income_receipts;
  v_received_minor bigint;
begin
  select * into v_entry
  from public.annual_conference_finance_entries
  where id = p_entry_id
  for update;

  if not found then raise exception 'Finance income record was not found.'; end if;

  select * into v_existing_receipt
  from public.annual_conference_finance_income_receipts
  where entry_id = p_entry_id and idempotency_key = p_idempotency_key;

  if found then
    if v_existing_receipt.amount_minor <> p_amount_minor
      or v_existing_receipt.received_date <> p_received_date
      or v_existing_receipt.payment_reference is distinct from p_payment_reference
      or v_existing_receipt.notes is distinct from p_notes then
      raise exception 'This receipt idempotency key was already used with different payment details.';
    end if;
    return v_entry;
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
    entry_id, amount_minor, received_date, payment_reference, notes, created_by_email, idempotency_key
  ) values (
    p_entry_id, p_amount_minor, p_received_date, p_payment_reference, p_notes, p_actor_email, p_idempotency_key
  );

  v_received_minor := v_received_minor + p_amount_minor;
  update public.annual_conference_finance_entries
  set status = case when v_received_minor < amount_minor then 'partially_received' else 'received' end,
      updated_by_email = p_actor_email
  where id = p_entry_id
  returning * into v_entry;
  return v_entry;
end;
$$;

create or replace function public.enforce_active_owner_membership()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_active_owner_count integer;
begin
  if (tg_op = 'DELETE' and old.role = 'owner' and old.status = 'active')
    or (tg_op = 'UPDATE' and old.role = 'owner' and old.status = 'active'
      and (new.role <> 'owner' or new.status <> 'active')) then
    perform 1 from public.admin_memberships
    where role = 'owner' and status = 'active'
    order by id for update;
    select count(*) into v_active_owner_count from public.admin_memberships
    where role = 'owner' and status = 'active';
    if v_active_owner_count <= 1 then
      raise exception 'at_least_one_active_owner_required';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists admin_memberships_preserve_active_owner on public.admin_memberships;
create trigger admin_memberships_preserve_active_owner
before update of role, status or delete on public.admin_memberships
for each row execute function public.enforce_active_owner_membership();

create or replace function public.clear_annual_conference_grants_on_membership_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.role is distinct from new.role or old.status is distinct from new.status then
    delete from public.annual_conference_access_grants where membership_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists admin_memberships_clear_conference_grants on public.admin_memberships;
create trigger admin_memberships_clear_conference_grants
after update of role, status on public.admin_memberships
for each row execute function public.clear_annual_conference_grants_on_membership_change();

create or replace function public.enforce_annual_conference_access_grant_eligibility()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_membership public.admin_memberships;
begin
  select * into v_membership from public.admin_memberships where id = new.membership_id for update;
  if not found or v_membership.status <> 'active' then
    raise exception 'Conference access can only be granted to an active member.';
  end if;
  if (new.capability = 'finance.view' and v_membership.role <> 'organizer')
    or (new.capability <> 'finance.view' and v_membership.role <> 'volunteer') then
    raise exception 'This conference capability is not eligible for the member role.';
  end if;
  return new;
end;
$$;

drop trigger if exists annual_conference_access_grants_eligibility on public.annual_conference_access_grants;
create trigger annual_conference_access_grants_eligibility
before insert or update of membership_id, capability on public.annual_conference_access_grants
for each row execute function public.enforce_annual_conference_access_grant_eligibility();

create or replace function public.validate_annual_conference_task_dependencies()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_dependency_count integer;
  v_known_dependency_count integer;
begin
  perform 1 from public.annual_conference_editions where id = new.edition_id for update;
  perform 1 from public.annual_conference_tasks
  where edition_id = new.edition_id order by id for update;

  select coalesce(cardinality(new.dependency_task_ids), 0) into v_dependency_count;
  if v_dependency_count <> (select count(distinct dependency_id)
    from unnest(coalesce(new.dependency_task_ids, '{}'::uuid[])) as dependency_id) then
    raise exception 'Task dependencies cannot contain duplicates.';
  end if;
  if new.id = any(coalesce(new.dependency_task_ids, '{}'::uuid[])) then
    raise exception 'A task cannot depend on itself.';
  end if;
  select count(*) into v_known_dependency_count from public.annual_conference_tasks
  where edition_id = new.edition_id and id = any(coalesce(new.dependency_task_ids, '{}'::uuid[]));
  if v_known_dependency_count <> v_dependency_count then
    raise exception 'Every task dependency must belong to this conference edition.';
  end if;
  if exists (
    with recursive graph as (
      select id, case when id = new.id then new.dependency_task_ids else dependency_task_ids end as dependencies
      from public.annual_conference_tasks where edition_id = new.edition_id
    ), walk(task_id) as (
      select unnest(coalesce(new.dependency_task_ids, '{}'::uuid[]))
      union
      select unnest(coalesce(graph.dependencies, '{}'::uuid[])) from walk join graph on graph.id = walk.task_id
    ) select 1 from walk where task_id = new.id
  ) then
    raise exception 'Task dependencies cannot contain a circular path.';
  end if;
  return new;
end;
$$;

drop trigger if exists annual_conference_tasks_validate_dependencies on public.annual_conference_tasks;
create trigger annual_conference_tasks_validate_dependencies
before insert or update of dependency_task_ids on public.annual_conference_tasks
for each row execute function public.validate_annual_conference_task_dependencies();

-- The original phase checks are correct for a single writer. Lock the edition's
-- phase rows first so two overlapping inserts cannot both validate a stale view.
create or replace function public.validate_annual_conference_phase_schedule()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform 1 from public.annual_conference_editions where id = new.edition_id for update;
  perform 1 from public.annual_conference_phases
  where edition_id = new.edition_id order by id for update;
  if exists (
    select 1 from public.annual_conference_phases phase
    where phase.edition_id = new.edition_id and phase.id <> new.id
      and new.starts_on <= phase.ends_on and new.ends_on >= phase.starts_on
  ) then raise exception 'Phase dates cannot overlap another phase.'; end if;
  if exists (
    select 1 from public.annual_conference_tasks task
    where task.phase_id = new.id and task.target_date is not null and task.target_date > new.ends_on
  ) then raise exception 'Phase end date cannot precede an assigned task target date.'; end if;
  return new;
end;
$$;

create or replace function public.validate_annual_conference_task_phase()
returns trigger
language plpgsql
set search_path = public
as $$
declare selected_phase public.annual_conference_phases%rowtype;
begin
  if new.phase_id is null then return new; end if;
  select * into selected_phase from public.annual_conference_phases
  where id = new.phase_id for key share;
  if selected_phase.id is null or selected_phase.edition_id <> new.edition_id then
    raise exception 'The selected phase does not belong to this conference edition.';
  end if;
  if new.target_date is not null and new.target_date > selected_phase.ends_on then
    raise exception 'Task target date cannot be after the selected phase end date.';
  end if;
  return new;
end;
$$;
