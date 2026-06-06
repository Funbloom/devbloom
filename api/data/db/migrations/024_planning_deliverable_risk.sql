alter table planning_deliverables
  add column if not exists risk text not null default 'on_track';
