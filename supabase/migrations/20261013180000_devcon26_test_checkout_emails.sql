-- Sandbox-only confirmation outbox. No historical backfill or admission records.
create table public.devcon26_test_checkout_email_outbox (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.devcon26_test_checkout_sessions(id) on delete cascade,
  recipient_email text not null,
  recipient_name text not null,
  tier_key text not null,
  quantity integer not null check (quantity in (1, 3, 5)),
  amount_minor integer not null check (amount_minor > 0),
  idempotency_key text not null unique,
  status text not null default 'queued' check (status in ('queued', 'sending', 'accepted', 'failed', 'suppressed', 'needs_attention')),
  provider_payload jsonb,
  provider_email_id text,
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  claim_token uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index devcon26_test_email_due_idx on public.devcon26_test_checkout_email_outbox (next_attempt_at)
  where status in ('queued', 'sending', 'failed');
alter table public.devcon26_test_checkout_email_outbox enable row level security;
revoke all on public.devcon26_test_checkout_email_outbox from public, anon, authenticated;
grant select on public.devcon26_test_checkout_email_outbox to service_role;

create function public.queue_devcon26_test_checkout_email() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.purchaser_email is not null and new.purchaser_name is not null then
    insert into public.devcon26_test_checkout_email_outbox
      (session_id, recipient_email, recipient_name, tier_key, quantity, amount_minor, idempotency_key)
    values (new.id, lower(trim(new.purchaser_email)), new.purchaser_name, new.tier_key,
      new.quantity, new.amount_minor, 'devcon26-test-confirmation/' || new.id::text)
    on conflict (session_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger devcon26_test_checkout_email_verified
after update of status on public.devcon26_test_checkout_sessions
for each row when (old.status is distinct from 'verified' and new.status = 'verified')
execute function public.queue_devcon26_test_checkout_email();

create function public.claim_devcon26_test_checkout_emails(p_claim_token uuid)
returns setof public.devcon26_test_checkout_email_outbox
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_claim_token is null then raise exception 'missing_claim_token'; end if;

  update public.devcon26_test_checkout_email_outbox
  set status = 'needs_attention', claim_token = null, lease_until = null, updated_at = now()
  where status in ('queued', 'failed', 'sending')
    and (lease_until is null or lease_until <= now())
    and (attempt_count >= 5 or first_attempt_at <= now() - interval '1 hour');

  return query
  with due as (
    select id from public.devcon26_test_checkout_email_outbox
    where status in ('queued', 'failed', 'sending') and next_attempt_at <= now()
      and (lease_until is null or lease_until <= now())
      and attempt_count < 5
      and (first_attempt_at is null or first_attempt_at > now() - interval '1 hour')
    order by next_attempt_at, id for update skip locked limit 5
  )
  update public.devcon26_test_checkout_email_outbox o
  set status = 'sending', claim_token = p_claim_token, lease_until = now() + interval '10 minutes',
    attempt_count = o.attempt_count + 1, first_attempt_at = coalesce(o.first_attempt_at, now()), updated_at = now()
  from due where o.id = due.id returning o.*;
end;
$$;

create function public.freeze_devcon26_test_checkout_email(p_id uuid, p_claim_token uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.devcon26_test_checkout_email_outbox;
begin
  select * into v_row from public.devcon26_test_checkout_email_outbox
  where id = p_id and claim_token = p_claim_token and status = 'sending' and lease_until > now()
  for update;
  if not found then raise exception 'invalid_email_claim'; end if;
  if v_row.provider_payload is not null then return v_row.provider_payload; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or p_payload->'to' is distinct from jsonb_build_array(v_row.recipient_email)
    or coalesce(p_payload->>'subject', '') not like '[TEST]%' then
    raise exception 'invalid_test_email_payload';
  end if;
  update public.devcon26_test_checkout_email_outbox
  set provider_payload = p_payload, updated_at = now() where id = p_id;
  return p_payload;
end;
$$;

create function public.finish_devcon26_test_checkout_email(
  p_id uuid, p_claim_token uuid, p_status text, p_provider_email_id text default null
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_status not in ('accepted', 'failed', 'suppressed', 'needs_attention')
    or (p_status = 'accepted' and nullif(trim(p_provider_email_id), '') is null) then
    raise exception 'invalid_email_result';
  end if;
  update public.devcon26_test_checkout_email_outbox
  set status = p_status, provider_email_id = p_provider_email_id, claim_token = null, lease_until = null,
    next_attempt_at = now() + interval '5 minutes', updated_at = now()
  where id = p_id and claim_token = p_claim_token and status = 'sending' and lease_until > now();
  return found;
end;
$$;

revoke all on function public.queue_devcon26_test_checkout_email() from public, anon, authenticated, service_role;
revoke all on function public.claim_devcon26_test_checkout_emails(uuid) from public, anon, authenticated;
revoke all on function public.freeze_devcon26_test_checkout_email(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.finish_devcon26_test_checkout_email(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_devcon26_test_checkout_emails(uuid) to service_role;
grant execute on function public.freeze_devcon26_test_checkout_email(uuid, uuid, jsonb) to service_role;
grant execute on function public.finish_devcon26_test_checkout_email(uuid, uuid, text, text) to service_role;
