-- Run this only if audiobank_clips was created before RLS was added to 019_audiobank.sql.

alter table audiobank_clips enable row level security;

drop policy if exists audiobank_clips_service_role_all on audiobank_clips;
create policy audiobank_clips_service_role_all
  on audiobank_clips
  for all
  to service_role
  using (true)
  with check (true);
