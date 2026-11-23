alter table public.community_events
  add column cfp_allowed_kinds text[] not null default array['talk', 'product_demo']::text[],
  add constraint community_events_cfp_allowed_kinds_check check (
    cfp_allowed_kinds in (
      array['talk']::text[],
      array['product_demo']::text[],
      array['talk', 'product_demo']::text[],
      array['product_demo', 'talk']::text[]
    )
  );
