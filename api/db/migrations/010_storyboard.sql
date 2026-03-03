create table if not exists storyboards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  style text,
  project_key text references projects (project_key) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists storyboard_characters (
  id uuid primary key default gen_random_uuid(),
  storyboard_id uuid not null references storyboards (id) on delete cascade,
  name text not null,
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists storyboard_tiles (
  id uuid primary key default gen_random_uuid(),
  storyboard_id uuid not null references storyboards (id) on delete cascade,
  tile_number int not null,
  image text,
  prompt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_storyboard_characters_storyboard_id
  on storyboard_characters (storyboard_id);

create index if not exists idx_storyboard_tiles_storyboard_id_tile_number
  on storyboard_tiles (storyboard_id, tile_number);

