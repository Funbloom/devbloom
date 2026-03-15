-- Add user_id to storyboards: null = public, set = private (owned by that user)
alter table storyboards
  add column if not exists user_id text;

create index if not exists idx_storyboards_user_id on storyboards (user_id);
