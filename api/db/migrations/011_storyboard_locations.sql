create table if not exists storyboard_locations (
  id uuid primary key default gen_random_uuid(),
  storyboard_id uuid not null references storyboards (id) on delete cascade,
  description text not null,
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_storyboard_locations_storyboard_id
  on storyboard_locations (storyboard_id);

