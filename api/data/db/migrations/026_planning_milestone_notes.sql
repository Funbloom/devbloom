alter table planning_milestones
  add column if not exists notes text not null default '';
