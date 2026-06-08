alter table planning_employees
  add column if not exists user_email text;

create unique index if not exists idx_planning_employees_user_email_lower
  on planning_employees (lower(user_email))
  where user_email is not null and trim(user_email) <> '';
