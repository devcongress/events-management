-- The Worker accesses this private table through the server-only Supabase
-- service role. RLS remains enabled so browser roles receive no access.

grant usage on schema public to service_role;
grant usage on type public.event_blast_status to service_role;
grant select, insert, update, delete on table public.event_blasts to service_role;
