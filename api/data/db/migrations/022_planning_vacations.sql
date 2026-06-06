create table if not exists planning_employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text not null default '',
  start_date date not null default current_date,
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists planning_vacation_days (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references planning_employees (id) on delete cascade,
  day_date date not null,
  status text not null check (status in ('vacation', 'away_working')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, day_date)
);

create index if not exists idx_planning_employees_order
  on planning_employees (order_index, name);

create index if not exists idx_planning_vacation_days_date
  on planning_vacation_days (day_date);

create index if not exists idx_planning_vacation_days_employee_date
  on planning_vacation_days (employee_id, day_date);

alter table planning_employees enable row level security;
alter table planning_vacation_days enable row level security;

drop policy if exists planning_employees_service_role_all on planning_employees;
create policy planning_employees_service_role_all
  on planning_employees for all to service_role using (true) with check (true);

drop policy if exists planning_vacation_days_service_role_all on planning_vacation_days;
create policy planning_vacation_days_service_role_all
  on planning_vacation_days for all to service_role using (true) with check (true);
