alter table storyboard_tiles
  add column if not exists location_id uuid references storyboard_locations (id) on delete set null;

alter table storyboard_tiles
  add column if not exists character_ids uuid[];

create index if not exists idx_storyboard_tiles_location_id
  on storyboard_tiles (location_id);

