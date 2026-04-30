-- Provider/service usage aggregates by user/day.
create table if not exists provider_usage_daily (
  user_id text not null,
  date date not null,
  provider text not null,
  service text not null,
  requests_count int not null default 0,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  total_tokens int not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  primary key (user_id, date, provider, service)
);

create index if not exists idx_provider_usage_daily_user_date
  on provider_usage_daily (user_id, date);

create index if not exists idx_provider_usage_daily_provider
  on provider_usage_daily (provider);

-- Security: keep this table protected when queried through Supabase APIs.
alter table provider_usage_daily enable row level security;

-- Service role (server-side key) can fully manage usage rows.
drop policy if exists provider_usage_daily_service_role_all on provider_usage_daily;
create policy provider_usage_daily_service_role_all
  on provider_usage_daily
  for all
  to service_role
  using (true)
  with check (true);

-- Authenticated users can read only their own usage rows.
drop policy if exists provider_usage_daily_user_select_own on provider_usage_daily;
create policy provider_usage_daily_user_select_own
  on provider_usage_daily
  for select
  to authenticated
  using (auth.uid()::text = user_id);
