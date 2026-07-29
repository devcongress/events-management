-- Repair the distributed rate limiter after PostgreSQL resolved the original
-- `current_time` PL/pgSQL variable as the SQL CURRENT_TIME value (timetz).
-- Keep this additive because 20260728020000_security_hardening.sql may already
-- have been applied to hosted projects.

create or replace function public.consume_public_rate_limit(
  p_action text,
  p_key_hash text,
  p_max_attempts integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  bucket public.public_rate_limit_buckets%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_action !~ '^[a-z0-9_:-]{1,80}$'
    or p_key_hash !~ '^[a-f0-9]{64}$'
    or p_max_attempts < 1
    or p_max_attempts > 10000
    or p_window_seconds < 1
    or p_window_seconds > 604800 then
    raise exception 'invalid_rate_limit_configuration';
  end if;

  delete from public.public_rate_limit_buckets
  where updated_at < v_now - interval '8 days';

  insert into public.public_rate_limit_buckets (
    action,
    key_hash,
    window_started_at,
    attempt_count,
    updated_at
  )
  values (
    p_action,
    p_key_hash,
    v_now,
    1,
    v_now
  )
  on conflict (action, key_hash)
  do update set
    window_started_at = case
      when public.public_rate_limit_buckets.window_started_at
        + make_interval(secs => p_window_seconds) <= v_now
      then v_now
      else public.public_rate_limit_buckets.window_started_at
    end,
    attempt_count = case
      when public.public_rate_limit_buckets.window_started_at
        + make_interval(secs => p_window_seconds) <= v_now
      then 1
      else public.public_rate_limit_buckets.attempt_count + 1
    end,
    updated_at = v_now
  returning * into bucket;

  allowed := bucket.attempt_count <= p_max_attempts;
  retry_after_seconds := case
    when allowed then 0
    else greatest(
      1,
      ceil(extract(epoch from (
        bucket.window_started_at
          + make_interval(secs => p_window_seconds)
          - v_now
      )))::integer
    )
  end;
  return next;
end;
$$;

revoke all on function public.consume_public_rate_limit(text, text, integer, integer)
from public, anon, authenticated;
grant execute on function public.consume_public_rate_limit(text, text, integer, integer)
to service_role;
