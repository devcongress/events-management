-- A provider draft is stored before delivery. This state is intentionally
-- distinct from provider-capacity and terminal failure outcomes.
alter type public.event_blast_status add value if not exists 'preparing';
