create table if not exists public.app_json_documents (
  key text primary key,
  data jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_json_documents_data_array check (jsonb_typeof(data) = 'array')
);

drop trigger if exists set_app_json_documents_updated_at on public.app_json_documents;

create trigger set_app_json_documents_updated_at
before update on public.app_json_documents
for each row
execute function public.set_updated_at();

alter table public.app_json_documents enable row level security;

grant select, insert, update, delete on public.app_json_documents to service_role;
