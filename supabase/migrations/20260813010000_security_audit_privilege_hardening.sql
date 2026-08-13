-- Keep application RPCs behind the server-side service role. Revoke the
-- audited overload explicitly so this forward-only change cannot disturb
-- helper/trigger functions that are not part of the HTTP RPC surface.

revoke execute on function public.record_annual_conference_income_receipt(
  uuid,
  bigint,
  date,
  text,
  text,
  text,
  uuid
) from public, anon, authenticated;

-- PostgreSQL grants function execution to PUBLIC by default. Make future
-- public-schema functions fail closed unless a migration grants a runtime role.
alter default privileges for role postgres in schema public
  revoke execute on functions from public;

grant execute on function public.record_annual_conference_income_receipt(
  uuid,
  bigint,
  date,
  text,
  text,
  text,
  uuid
) to service_role;
