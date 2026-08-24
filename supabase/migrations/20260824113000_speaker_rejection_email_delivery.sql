alter table public.speaker_submissions
  add column if not exists decision_email_status text,
  add column if not exists decision_email_provider_id text,
  add column if not exists decision_email_idempotency_key text,
  add column if not exists decision_email_sent_at timestamptz,
  add column if not exists decision_email_last_attempt_at timestamptz,
  add column if not exists decision_email_last_error text;

alter table public.speaker_submissions
  drop constraint if exists speaker_submissions_decision_email_status_check;

alter table public.speaker_submissions
  add constraint speaker_submissions_decision_email_status_check
  check (decision_email_status is null or decision_email_status in ('pending', 'accepted', 'failed'));

create unique index if not exists speaker_submissions_decision_email_idempotency_idx
  on public.speaker_submissions (decision_email_idempotency_key)
  where decision_email_idempotency_key is not null;

create index if not exists speaker_submissions_pending_decision_email_idx
  on public.speaker_submissions (decision_email_last_attempt_at, decided_at)
  where status = 'not_selected' and decision_email_status in ('pending', 'failed');

comment on column public.speaker_submissions.decision_email_status is
  'Durable Resend acceptance state for the automatic final proposal-decision email.';
