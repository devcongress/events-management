create type public.feedback_campaign_status as enum ('draft', 'active', 'closed');
create type public.feedback_question_type as enum ('rating', 'text', 'choice', 'talk_select', 'yes_no');

create table public.feedback_campaigns (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  title text not null,
  intro text,
  status public.feedback_campaign_status not null default 'draft',
  auto_open_on_event_completion boolean not null default true,
  opens_at timestamptz,
  closes_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feedback_campaigns_title_not_blank check (length(trim(title)) > 0),
  constraint feedback_campaigns_window_order check (closes_at is null or opens_at is null or closes_at >= opens_at)
);

create table public.feedback_questions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.feedback_campaigns(id) on delete cascade,
  type public.feedback_question_type not null,
  label text not null,
  required boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  constraint feedback_questions_label_not_blank check (length(trim(label)) > 0),
  constraint feedback_questions_options_array check (jsonb_typeof(options) = 'array')
);

alter table public.feedback_submissions
  add column if not exists event_id text,
  add column if not exists campaign_id uuid references public.feedback_campaigns(id) on delete set null,
  add column if not exists tester_email text,
  add column if not exists structured_answers jsonb not null default '[]'::jsonb,
  add column if not exists trigger_source text;

create index feedback_campaigns_event_status_idx
  on public.feedback_campaigns (event_id, status);

create index feedback_questions_campaign_order_idx
  on public.feedback_questions (campaign_id, order_index);

create index feedback_submissions_event_created_idx
  on public.feedback_submissions (event_id, created_at desc)
  where event_id is not null;

create trigger set_feedback_campaigns_updated_at
before update on public.feedback_campaigns
for each row
execute function public.set_updated_at();

alter table public.feedback_campaigns enable row level security;
alter table public.feedback_questions enable row level security;

create policy "Open feedback campaigns are public"
on public.feedback_campaigns
for select
to anon, authenticated
using (status = 'active');

create policy "Open feedback questions are public"
on public.feedback_questions
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.feedback_campaigns
    where feedback_campaigns.id = feedback_questions.campaign_id
      and feedback_campaigns.status = 'active'
  )
);
