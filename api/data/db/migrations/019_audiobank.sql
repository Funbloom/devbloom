create table if not exists audiobank_clips (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_path text not null unique,
  public_url text not null,
  category text not null default 'uncategorized',
  tags jsonb not null default '[]'::jsonb,
  content_type text not null,
  file_size_bytes bigint not null,
  duration_ms int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_audiobank_clips_category on audiobank_clips (category);
create index if not exists idx_audiobank_clips_filename on audiobank_clips (filename);

-- Security: block direct table access from anon/authenticated Supabase clients.
-- The DevBloom API uses SUPABASE_SERVICE_ROLE_KEY and remains fully functional.
alter table audiobank_clips enable row level security;

drop policy if exists audiobank_clips_service_role_all on audiobank_clips;
create policy audiobank_clips_service_role_all
  on audiobank_clips
  for all
  to service_role
  using (true)
  with check (true);
