-- Store replies to community-submission decisions in EMS. The webhook is
-- externally reachable, but this table remains service-role-only.

begin;

create table if not exists public.event_submission_replies (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.event_submissions(id) on delete cascade,
  webhook_event_id text not null unique,
  resend_email_id text not null unique,
  sender_email text not null,
  subject text not null default '',
  body_text text not null default '',
  received_at timestamptz not null,
  attachments jsonb not null default '[]'::jsonb,
  slack_status text not null default 'pending',
  slack_error text,
  slack_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_submission_replies_slack_status_valid check (slack_status in ('pending', 'sent', 'failed')),
  constraint event_submission_replies_sender_email_length check (length(sender_email) <= 320),
  constraint event_submission_replies_subject_length check (length(subject) <= 500),
  constraint event_submission_replies_body_length check (length(body_text) <= 100000)
);

create index if not exists event_submission_replies_submission_received_idx
  on public.event_submission_replies (submission_id, received_at);

drop trigger if exists set_event_submission_replies_updated_at
  on public.event_submission_replies;
create trigger set_event_submission_replies_updated_at
before update on public.event_submission_replies
for each row execute function public.set_updated_at();

alter table public.event_submission_replies enable row level security;
revoke all on table public.event_submission_replies from public, anon, authenticated;
grant select, insert, update on table public.event_submission_replies to service_role;

comment on table public.event_submission_replies is
  'Inbound organizer replies to community event submission emails, with best-effort Slack notification state.';
comment on column public.event_submission_replies.webhook_event_id is
  'Resend/Svix event id used to make webhook delivery idempotent.';
comment on column public.event_submission_replies.body_text is
  'Sanitized plain-text reply body; raw HTML is intentionally not rendered or stored.';

commit;
