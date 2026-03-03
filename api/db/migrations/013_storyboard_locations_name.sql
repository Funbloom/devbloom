-- Replace location description with name
alter table storyboard_locations
  add column if not exists name text;

update storyboard_locations
  set name = coalesce(description, '');

alter table storyboard_locations
  alter column name set not null;

alter table storyboard_locations
  drop column if exists description;
