alter table public.feedback_submissions
add column if not exists archived_at timestamptz;

create index if not exists feedback_submissions_archived_created_idx
  on public.feedback_submissions (archived_at, created_at desc);
