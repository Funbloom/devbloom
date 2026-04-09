-- Per-user preferences (e.g. last selected project). user_id matches auth.users.id (JWT sub).
create table if not exists user_profiles (
  user_id text primary key,
  current_project_key text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_profiles_current_project on user_profiles (current_project_key)
  where current_project_key is not null;
