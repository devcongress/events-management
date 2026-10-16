-- Edition-specific operational messages. Each draft freezes its own audience;
-- it does not reuse a monthly event or mutate that event's marketing segments.
create table public.annual_conference_email_suppressions (
  email text primary key,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.annual_conference_email_suppressions enable row level security;
revoke all on public.annual_conference_email_suppressions from public, anon, authenticated;
grant select, insert, update on public.annual_conference_email_suppressions to service_role;

-- Named free admissions and future Regular buyers share an edition audience.
create function public.annual_conference_update_audience(p_edition_id uuid)
returns table(name text, email text) language sql stable security definer set search_path = public as $$
  select min(coalesce(nullif(btrim(t.attendee_name), ''), o.purchaser_name)),
    lower(btrim(coalesce(nullif(t.attendee_email, ''), o.purchaser_email)))
  from public.annual_conference_tickets t
  left join public.annual_conference_ticket_orders o on o.id = t.order_id
  where t.edition_id = p_edition_id and t.status in ('issued', 'checked_in')
    and coalesce(nullif(t.attendee_email, ''), o.purchaser_email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and not exists (select 1 from public.annual_conference_email_suppressions s
      where s.email = lower(btrim(coalesce(nullif(t.attendee_email, ''), o.purchaser_email))))
  group by lower(btrim(coalesce(nullif(t.attendee_email, ''), o.purchaser_email)));
$$;
create table public.annual_conference_attendee_blasts (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.annual_conference_editions(id),
  subject text not null check (length(btrim(subject)) between 1 and 160),
  body text not null check (length(btrim(body)) between 1 and 12000),
  status text not null default 'draft' check (status in ('draft', 'queued', 'complete')),
  created_by_email text not null,
  created_at timestamptz not null default now(),
  queued_at timestamptz
);
create table public.annual_conference_attendee_blast_deliveries (
  id uuid primary key default gen_random_uuid(),
  blast_id uuid not null references public.annual_conference_attendee_blasts(id),
  recipient_name text not null,
  recipient_email text not null,
  status text not null default 'draft' check (status in ('draft', 'queued', 'sending', 'accepted', 'failed', 'suppressed')),
  attempt_count integer not null default 0,
  first_attempt_at timestamptz,
  claim_token uuid,
  claimed_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  provider_email_id text,
  provider_payload jsonb,
  unique (blast_id, recipient_email)
);
create index conference_blast_edition_idx on public.annual_conference_attendee_blasts(edition_id, created_at desc);
create index conference_blast_delivery_due_idx on public.annual_conference_attendee_blast_deliveries(status, next_attempt_at);
alter table public.annual_conference_attendee_blasts enable row level security;
alter table public.annual_conference_attendee_blast_deliveries enable row level security;
revoke all on public.annual_conference_attendee_blasts, public.annual_conference_attendee_blast_deliveries from public, anon, authenticated;
grant select, insert, update on public.annual_conference_attendee_blasts, public.annual_conference_attendee_blast_deliveries to service_role;

create function public.create_annual_conference_attendee_blast(p_edition_id uuid, p_subject text, p_body text, p_actor text)
returns uuid language plpgsql security definer set search_path = public as $$
declare blast_id uuid;
begin
  insert into public.annual_conference_attendee_blasts(edition_id, subject, body, created_by_email)
    values (p_edition_id, btrim(p_subject), btrim(p_body), lower(btrim(p_actor))) returning id into blast_id;
  insert into public.annual_conference_attendee_blast_deliveries(blast_id, recipient_name, recipient_email)
    select blast_id, a.name, a.email from public.annual_conference_update_audience(p_edition_id) a;
  return blast_id;
end;
$$;

create function public.queue_annual_conference_attendee_blast(p_edition_id uuid, p_blast_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.annual_conference_attendee_blasts where id = p_blast_id and edition_id = p_edition_id and status = 'draft' for update;
  if not found then raise exception 'conference_blast_not_draft'; end if;
  -- Preserve the reviewed snapshot, but suppress anyone whose admission was cancelled meanwhile.
  update public.annual_conference_attendee_blast_deliveries d set status = case when exists (
    select 1 from public.annual_conference_update_audience(p_edition_id) a where a.email = d.recipient_email
  ) then 'queued' else 'suppressed' end where blast_id = p_blast_id;
  update public.annual_conference_attendee_blasts set status = 'queued', queued_at = now() where id = p_blast_id;
end;
$$;

create function public.list_annual_conference_attendee_blasts(p_edition_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(summary) order by summary.created_at desc), '[]'::jsonb) from (
    select b.*, count(d.id)::integer as recipients,
      count(d.id) filter (where d.status = 'accepted')::integer as accepted,
      count(d.id) filter (where d.status in ('failed', 'suppressed'))::integer as needs_attention
    from public.annual_conference_attendee_blasts b
    left join public.annual_conference_attendee_blast_deliveries d on d.blast_id = b.id
    where b.edition_id = p_edition_id group by b.id order by b.created_at desc limit 100
  ) summary;
$$;

create function public.claim_annual_conference_attendee_updates(p_claim uuid, p_limit integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare claimed jsonb;
begin
  if p_claim is null or p_limit not between 1 and 20 then raise exception 'conference_blast_claim_invalid'; end if;
  -- Only one draining batch at a time across editions; quota is checked before claiming.
  perform pg_advisory_xact_lock(hashtextextended('conference-attendee-updates', 0));
  if exists (select 1 from public.annual_conference_attendee_blast_deliveries where status = 'sending' and claimed_until > now()) then return '[]'::jsonb; end if;
  update public.annual_conference_attendee_blast_deliveries d
    set status = 'suppressed', provider_payload = null, claim_token = null, claimed_until = null
    from public.annual_conference_attendee_blasts b
    where b.id = d.blast_id and d.status in ('queued', 'failed', 'sending')
      and not exists (select 1 from public.annual_conference_update_audience(b.edition_id) a where a.email = d.recipient_email);
  update public.annual_conference_attendee_blast_deliveries
    set status = 'failed', next_attempt_at = 'infinity', provider_payload = null, claim_token = null, claimed_until = null
    where status in ('queued', 'failed', 'sending') and provider_email_id is null
      and (attempt_count >= 5 or first_attempt_at <= now() - interval '1 hour');
  with due as (
    select d.id from public.annual_conference_attendee_blast_deliveries d
      join public.annual_conference_attendee_blasts b on b.id = d.blast_id
    where b.status = 'queued' and d.attempt_count < 5 and d.provider_email_id is null
      and (d.first_attempt_at is null or d.first_attempt_at > now() - interval '1 hour')
      and ((d.status in ('queued', 'failed') and d.next_attempt_at <= now()) or (d.status = 'sending' and d.claimed_until <= now()))
    order by b.created_at, d.id limit p_limit for update of d skip locked
  ), updated as (
    update public.annual_conference_attendee_blast_deliveries d
      set status = 'sending', attempt_count = d.attempt_count + 1, claim_token = p_claim,
        claimed_until = now() + interval '10 minutes', first_attempt_at = coalesce(d.first_attempt_at, now())
      from due where d.id = due.id returning d.*
  ) select coalesce(jsonb_agg(to_jsonb(u) || jsonb_build_object('subject', b.subject, 'body', b.body)), '[]'::jsonb)
    into claimed from updated u join public.annual_conference_attendee_blasts b on b.id = u.blast_id;
  return claimed;
end;
$$;

create function public.freeze_annual_conference_attendee_update(p_id uuid, p_claim uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare frozen jsonb;
begin
  update public.annual_conference_attendee_blast_deliveries set provider_payload = coalesce(provider_payload, p_payload)
    where id = p_id and claim_token = p_claim and status = 'sending' and claimed_until > now()
      and first_attempt_at > now() - interval '1 hour'
      and exists (select 1 from public.annual_conference_attendee_blasts b,
        lateral public.annual_conference_update_audience(b.edition_id) a
        where b.id = blast_id and a.email = recipient_email)
    returning provider_payload into frozen;
  return frozen;
end;
$$;

create function public.finish_annual_conference_attendee_update(p_id uuid, p_claim uuid, p_provider_id text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.annual_conference_attendee_blast_deliveries
    set status = case when nullif(btrim(p_provider_id), '') is null then 'failed' else 'accepted' end,
      provider_email_id = p_provider_id, claim_token = null, claimed_until = null, next_attempt_at = now() + interval '5 minutes'
    where id = p_id and claim_token = p_claim and status = 'sending';
  update public.annual_conference_attendee_blasts b set status = 'complete'
    where status = 'queued' and not exists (select 1 from public.annual_conference_attendee_blast_deliveries d
      where d.blast_id = b.id and d.status not in ('accepted', 'suppressed'));
end;
$$;

create function public.apply_annual_conference_admission_email_event(p_provider_id text, p_type text)
returns boolean language plpgsql security definer set search_path = public as $$
declare recipient text;
begin
  select recipient_email into recipient from public.annual_conference_attendee_blast_deliveries where provider_email_id = p_provider_id limit 1;
  if recipient is null then
    select recipient_email into recipient from public.annual_conference_ticket_email_outbox where provider_email_id = p_provider_id limit 1;
  end if;
  if recipient is null then return false; end if;
  if p_type in ('email.bounced', 'email.complained', 'email.suppressed') then
    insert into public.annual_conference_email_suppressions(email, reason) values (lower(btrim(recipient)), p_type)
      on conflict (email) do update set reason = excluded.reason;
  elsif p_type = 'email.delivered' then
    update public.annual_conference_ticket_email_outbox set status = 'delivered' where provider_email_id = p_provider_id and status = 'accepted';
  end if;
  return true;
end;
$$;
revoke all on function public.annual_conference_update_audience(uuid), public.apply_annual_conference_admission_email_event(text,text) from public, anon, authenticated;
grant execute on function public.annual_conference_update_audience(uuid), public.apply_annual_conference_admission_email_event(text,text) to service_role;

revoke all on function public.create_annual_conference_attendee_blast(uuid,text,text,text),
  public.queue_annual_conference_attendee_blast(uuid,uuid), public.list_annual_conference_attendee_blasts(uuid),
  public.claim_annual_conference_attendee_updates(uuid,integer), public.freeze_annual_conference_attendee_update(uuid,uuid,jsonb),
  public.finish_annual_conference_attendee_update(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.create_annual_conference_attendee_blast(uuid,text,text,text),
  public.queue_annual_conference_attendee_blast(uuid,uuid), public.list_annual_conference_attendee_blasts(uuid),
  public.claim_annual_conference_attendee_updates(uuid,integer), public.freeze_annual_conference_attendee_update(uuid,uuid,jsonb),
  public.finish_annual_conference_attendee_update(uuid,uuid,text) to service_role;
