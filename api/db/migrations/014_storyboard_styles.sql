-- Style bank: named styles (name + prompt) for storyboards
create table if not exists storyboard_styles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  prompt text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_storyboard_styles_name
  on storyboard_styles (name);
