create table if not exists project_plans (
  id uuid primary key default gen_random_uuid(),
  project_key text not null references projects (project_key) on delete cascade,
  start_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_key)
);

create table if not exists planning_milestones (
  id uuid primary key default gen_random_uuid(),
  project_plan_id uuid not null references project_plans (id) on delete cascade,
  name text not null,
  duration_weeks int not null check (duration_weeks >= 1),
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'ready', 'completed')),
  risk text not null default 'on_track'
    check (risk in ('on_track', 'caution', 'risk')),
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists planning_deliverables (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references planning_milestones (id) on delete cascade,
  title text not null,
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'ready', 'completed')),
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists planning_events (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references planning_milestones (id) on delete cascade,
  name text not null,
  weeks_after_milestone_start int not null default 0 check (weeks_after_milestone_start >= 0),
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_planning_milestones_plan_order
  on planning_milestones (project_plan_id, order_index);

create index if not exists idx_planning_deliverables_milestone_order
  on planning_deliverables (milestone_id, order_index);

create index if not exists idx_planning_events_milestone_order
  on planning_events (milestone_id, order_index);

alter table project_plans enable row level security;
alter table planning_milestones enable row level security;
alter table planning_deliverables enable row level security;
alter table planning_events enable row level security;

drop policy if exists project_plans_service_role_all on project_plans;
create policy project_plans_service_role_all
  on project_plans for all to service_role using (true) with check (true);

drop policy if exists planning_milestones_service_role_all on planning_milestones;
create policy planning_milestones_service_role_all
  on planning_milestones for all to service_role using (true) with check (true);

drop policy if exists planning_deliverables_service_role_all on planning_deliverables;
create policy planning_deliverables_service_role_all
  on planning_deliverables for all to service_role using (true) with check (true);

drop policy if exists planning_events_service_role_all on planning_events;
create policy planning_events_service_role_all
  on planning_events for all to service_role using (true) with check (true);
