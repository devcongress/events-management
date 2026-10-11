-- Social-card management is deliberately independent from ticket receipts.
-- A new capability is issued only through this command and survives provider
-- retries in this dedicated outbox; ticket QR capabilities are never reused.

-- Earlier foundation code added a management capability to ticket receipt
-- payloads. Remove every raw value before removing the trigger, including
-- rows no longer eligible for a status transition.
update public.annual_conference_ticket_email_outbox
  set payload = payload - 'social_card_capability'
  where payload ? 'social_card_capability';

drop trigger if exists attach_annual_conference_ticket_social_card_capability on public.annual_conference_ticket_email_outbox;
drop trigger if exists scrub_annual_conference_social_card_capability on public.annual_conference_ticket_email_outbox;
drop function if exists public.attach_annual_conference_ticket_social_card_capability();
drop function if exists public.scrub_annual_conference_social_card_capability();

create type public.annual_conference_social_card_email_status as enum ('queued', 'sending', 'accepted', 'delivered', 'failed');

create table public.annual_conference_social_card_email_outbox (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.annual_conference_editions(id) on delete cascade,
  social_card_id uuid not null references public.annual_conference_social_cards(id) on delete cascade,
  recipient_name text not null,
  recipient_email text not null,
  capability text not null,
  idempotency_key text not null unique,
  status public.annual_conference_social_card_email_status not null default 'queued',
  attempt_count integer not null default 0 check (attempt_count <= 5),
  provider_email_id text,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  claim_token uuid,
  claimed_until timestamptz,
  accepted_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index annual_conference_social_card_email_outbox_due_idx
  on public.annual_conference_social_card_email_outbox (next_attempt_at, created_at)
  where status in ('queued', 'failed', 'sending') and attempt_count < 5;

create trigger set_annual_conference_social_card_email_outbox_updated_at
  before update on public.annual_conference_social_card_email_outbox
  for each row execute function public.set_updated_at();

alter table public.annual_conference_social_card_email_outbox enable row level security;
revoke all on table public.annual_conference_social_card_email_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.annual_conference_social_card_email_outbox to service_role;
grant usage on type public.annual_conference_social_card_email_status to service_role;

create or replace function public.issue_annual_conference_social_card_delivery(
  p_edition_id uuid,
  p_subject_type public.annual_conference_social_card_subject,
  p_subject_id uuid
)
returns table (social_card_id uuid, management_capability text)
language plpgsql security definer set search_path = public as $$
declare
  card public.annual_conference_social_cards;
  capability text := replace(replace(trim(trailing '=' from encode(gen_random_bytes(32), 'base64')), '+', '-'), '/', '_');
  slug text := replace(replace(trim(trailing '=' from encode(gen_random_bytes(24), 'base64')), '+', '-'), '/', '_');
  normalized_name text;
  normalized_email text;
begin
  -- The row does not exist on first issuance, so take a subject-scoped
  -- transaction lock before eligibility and card-row reads. This serializes
  -- concurrent first issues and rotations without relying on a unique-error
  -- retry that might leave a second raw capability in an outbox row.
  perform pg_advisory_xact_lock(hashtextextended(p_subject_type::text || ':' || p_subject_id::text, 0));

  if p_subject_type = 'attendee' then
    select btrim(attendee_name), lower(btrim(attendee_email)) into normalized_name, normalized_email
      from public.annual_conference_tickets
      where id = p_subject_id and edition_id = p_edition_id and status in ('issued', 'checked_in')
      for share;
  else
    select btrim(session.speaker_name), lower(btrim(session.speaker_email)) into normalized_name, normalized_email
      from public.annual_conference_sessions session
      join public.annual_conference_speaker_submissions submission on submission.id = session.speaker_submission_id
      where session.id = p_subject_id and session.edition_id = p_edition_id and session.status = 'confirmed'
        and submission.status = 'selected'
      for share of session, submission;
  end if;
  if not found or length(normalized_name) not between 1 and 120 or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using message = 'social_card_subject_ineligible';
  end if;

  if p_subject_type = 'attendee' then
    select * into card from public.annual_conference_social_cards where ticket_id = p_subject_id for update;
  else
    select * into card from public.annual_conference_social_cards where session_id = p_subject_id for update;
  end if;

  if card.id is null then
    if p_subject_type = 'attendee' then
      insert into public.annual_conference_social_cards (edition_id, subject_type, ticket_id, display_name, management_token_hash, public_slug, revoked_at)
      values (p_edition_id, p_subject_type, p_subject_id, normalized_name, encode(digest(capability, 'sha256'), 'hex'), slug, null)
      returning * into card;
    else
      insert into public.annual_conference_social_cards (edition_id, subject_type, session_id, display_name, management_token_hash, public_slug, revoked_at)
      values (p_edition_id, p_subject_type, p_subject_id, normalized_name, encode(digest(capability, 'sha256'), 'hex'), slug, null)
      returning * into card;
    end if;
  else
    update public.annual_conference_social_card_email_outbox
      set status = 'failed', capability = '', last_error = 'Superseded by a newer social-card delivery.',
          next_attempt_at = 'infinity', claim_token = null, claimed_until = null
      -- A sender may still hold an old capability in memory. The card hash is
      -- already rotated, so that link is invalid; terminalizing the leased
      -- row prevents a late finalize from returning it to the retry pool.
      where social_card_id = card.id and status in ('queued', 'failed', 'sending');
    update public.annual_conference_social_cards
      set display_name = normalized_name, management_token_hash = encode(digest(capability, 'sha256'), 'hex'), revoked_at = null
      where id = card.id returning * into card;
  end if;

  insert into public.annual_conference_social_card_email_outbox (edition_id, social_card_id, recipient_name, recipient_email, capability, idempotency_key)
  values (p_edition_id, card.id, normalized_name, normalized_email, capability, concat('annual-conference-social-card:', card.id, ':', encode(digest(capability, 'sha256'), 'hex')));

  return query select card.id, capability;
end;
$$;

create or replace function public.claim_annual_conference_social_card_email_outbox(p_claim_token uuid, p_limit integer default 20)
returns setof public.annual_conference_social_card_email_outbox
language plpgsql security definer set search_path = public as $$
begin
  if p_claim_token is null or p_limit < 1 or p_limit > 100 then raise exception using message = 'social_card_email_claim_invalid'; end if;
  update public.annual_conference_social_card_email_outbox
    set status = 'failed', capability = '', last_error = 'Social-card email retry limit reached.',
        next_attempt_at = 'infinity', claim_token = null, claimed_until = null
    where attempt_count >= 5 and (
      (status in ('queued', 'failed') and next_attempt_at <= now())
      or (status = 'sending' and claimed_until <= now())
    );
  return query with due as (
    select id from public.annual_conference_social_card_email_outbox
    where attempt_count < 5 and (
      (status in ('queued', 'failed') and next_attempt_at <= now())
      or (status = 'sending' and claimed_until <= now())
    )
    order by next_attempt_at, created_at limit p_limit for update skip locked
  ) update public.annual_conference_social_card_email_outbox outbox
    set status = 'sending', attempt_count = outbox.attempt_count + 1, claim_token = p_claim_token, claimed_until = now() + interval '10 minutes', last_error = null
    from due where outbox.id = due.id returning outbox.*;
end;
$$;

create or replace function public.finalize_annual_conference_social_card_email_outbox(p_outbox_id uuid, p_claim_token uuid, p_status public.annual_conference_social_card_email_status, p_provider_email_id text default null, p_last_error text default null, p_next_attempt_at timestamptz default null)
returns public.annual_conference_social_card_email_outbox
language plpgsql security definer set search_path = public as $$
declare delivery public.annual_conference_social_card_email_outbox;
begin
  if p_status not in ('accepted', 'failed') then raise exception using message = 'social_card_email_status_invalid'; end if;
  if p_status = 'accepted' and nullif(btrim(p_provider_email_id), '') is null then
    raise exception using message = 'social_card_email_provider_id_required';
  end if;
  update public.annual_conference_social_card_email_outbox
    set status = p_status, provider_email_id = coalesce(p_provider_email_id, provider_email_id), capability = case when p_status = 'accepted' then '' else capability end,
        last_error = case when p_status = 'failed' then left(coalesce(p_last_error, 'Email provider did not accept the message.'), 500) else null end,
        next_attempt_at = case when p_status = 'failed' then coalesce(p_next_attempt_at, now() + interval '5 minutes') else next_attempt_at end,
        accepted_at = case when p_status = 'accepted' then now() else accepted_at end, claim_token = null, claimed_until = null
    where id = p_outbox_id and status = 'sending' and claim_token = p_claim_token returning * into delivery;
  if delivery.id is null then raise exception using message = 'social_card_email_claim_lost'; end if;
  return delivery;
end;
$$;

revoke all on function public.issue_annual_conference_social_card_delivery(uuid, public.annual_conference_social_card_subject, uuid) from public, anon, authenticated;
revoke all on function public.claim_annual_conference_social_card_email_outbox(uuid, integer) from public, anon, authenticated;
revoke all on function public.finalize_annual_conference_social_card_email_outbox(uuid, uuid, public.annual_conference_social_card_email_status, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.issue_annual_conference_social_card_delivery(uuid, public.annual_conference_social_card_subject, uuid) to service_role;
grant execute on function public.claim_annual_conference_social_card_email_outbox(uuid, integer) to service_role;
grant execute on function public.finalize_annual_conference_social_card_email_outbox(uuid, uuid, public.annual_conference_social_card_email_status, text, text, timestamptz) to service_role;
