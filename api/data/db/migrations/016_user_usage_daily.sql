-- Daily image generation count per user (Image Gen + storyboard tiles).
-- date = day in UTC; images_generated = count for that day.
create table if not exists user_usage_daily (
  user_id text not null,
  date date not null,
  images_generated int not null default 0,
  primary key (user_id, date)
);

create index if not exists idx_user_usage_daily_user_id on user_usage_daily (user_id);
