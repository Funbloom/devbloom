alter table planning_milestones
  add column if not exists goals text[] not null default '{}';

alter table planning_deliverables
  add column if not exists owner text not null default '',
  add column if not exists due_date date;
