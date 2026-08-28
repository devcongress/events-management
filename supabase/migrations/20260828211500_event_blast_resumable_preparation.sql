-- Persist a point-in-time blast audience and its asynchronous preparation
-- progress. This makes a retried Queue delivery idempotent and prevents a
-- later registration/cancellation from changing an already reviewed audience.

alter table public.event_blasts
  add column if not exists recipient_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists prepared_recipient_count integer not null default 0,
  add column if not exists preparation_error text;

alter table public.event_blasts
  drop constraint if exists event_blasts_prepared_recipient_count_range,
  add constraint event_blasts_prepared_recipient_count_range
    check (prepared_recipient_count >= 0 and prepared_recipient_count <= recipient_count);

comment on column public.event_blasts.recipient_snapshot is
  'Immutable confirmed-guest audience captured when an organizer confirms a blast.';
comment on column public.event_blasts.prepared_recipient_count is
  'Number of snapshot recipients confirmed in the provider segment.';
comment on column public.event_blasts.preparation_error is
  'Sanitized latest asynchronous audience-preparation failure.';
