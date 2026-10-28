-- RLS does not restrict TRUNCATE, REFERENCES or TRIGGER. Remove client ACLs
-- explicitly, including column grants that survive a table-level REVOKE.
begin;

revoke all privileges on table
  public.annual_conference_ticketing_settings,
  public.annual_conference_ticket_orders,
  public.annual_conference_ticket_payment_attempts,
  public.annual_conference_ticket_email_outbox
from public, anon, authenticated;

do $$
declare
  relation_name text;
  column_names text;
begin
  foreach relation_name in array array[
    'annual_conference_ticketing_settings',
    'annual_conference_ticket_orders',
    'annual_conference_ticket_payment_attempts',
    'annual_conference_ticket_email_outbox'
  ] loop
    select string_agg(format('%I', a.attname), ', ' order by a.attnum)
      into column_names
    from pg_attribute a
    where a.attrelid = format('public.%I', relation_name)::regclass
      and a.attnum > 0 and not a.attisdropped;

    execute format(
      'revoke all privileges (%s) on table public.%I from public, anon, authenticated',
      column_names, relation_name
    );
  end loop;
end;
$$;

alter table public.annual_conference_ticketing_settings enable row level security;
alter table public.annual_conference_ticket_orders enable row level security;
alter table public.annual_conference_ticket_payment_attempts enable row level security;
alter table public.annual_conference_ticket_email_outbox enable row level security;

-- Preserve all existing service grants while ensuring the checkout operations
-- retain the three table privileges they require.
grant select, insert, update on table
  public.annual_conference_ticketing_settings,
  public.annual_conference_ticket_orders,
  public.annual_conference_ticket_payment_attempts,
  public.annual_conference_ticket_email_outbox
to service_role;

revoke all privileges on function public.claim_annual_conference_social_card_email_outbox(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_annual_conference_social_card_email_outbox(uuid, integer)
  to service_role;

-- Direct revokes cannot remove inherited access. Abort the whole transaction
-- when the deployment's role memberships still confer any client privilege.
-- Deliberately leave role memberships and unrelated object ACLs untouched.
do $$
declare
  relation_name text;
  relation_id regclass;
  client_role text;
  table_privileges text;
begin
  foreach relation_name in array array[
    'annual_conference_ticketing_settings',
    'annual_conference_ticket_orders',
    'annual_conference_ticket_payment_attempts',
    'annual_conference_ticket_email_outbox'
  ] loop
    relation_id := format('public.%I', relation_name)::regclass;

    -- Derive the server's complete table privilege vocabulary, including any
    -- privileges added by a newer PostgreSQL version.
    select string_agg(privilege_type, ',') into table_privileges
    from aclexplode(acldefault('r', (select relowner from pg_class where oid = relation_id)));

    foreach client_role in array array['anon', 'authenticated'] loop
      if has_table_privilege(client_role, relation_id, table_privileges)
        or has_any_column_privilege(client_role, relation_id, 'SELECT,INSERT,UPDATE,REFERENCES') then
        raise exception 'managed_checkout_client_privileges_remain: %.%', client_role, relation_name;
      end if;
    end loop;

    if not (select relrowsecurity from pg_class where oid = relation_id) then
      raise exception 'managed_checkout_rls_required: %', relation_name;
    end if;

    if not has_table_privilege('service_role', relation_id, 'SELECT')
      or not has_table_privilege('service_role', relation_id, 'INSERT')
      or not has_table_privilege('service_role', relation_id, 'UPDATE') then
      raise exception 'managed_checkout_service_privileges_missing: %', relation_name;
    end if;
  end loop;

  foreach client_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(client_role,
      'public.claim_annual_conference_social_card_email_outbox(uuid,integer)', 'EXECUTE') then
      raise exception 'managed_checkout_client_function_privilege_remains: %', client_role;
    end if;
  end loop;

  if not has_function_privilege('service_role',
    'public.claim_annual_conference_social_card_email_outbox(uuid,integer)', 'EXECUTE') then
    raise exception 'managed_checkout_service_function_privilege_missing';
  end if;
end;
$$;

commit;
