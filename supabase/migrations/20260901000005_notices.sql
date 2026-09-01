-- ============================================================================
-- Noticeboard — manager-editable announcements/coaching keys shown on Home.
-- Simple flat list of active notices, not a single pinned field, so it works
-- for multiple items at once (e.g. a coaching key + a class announcement).
-- ============================================================================

create table notices (
  id         uuid primary key default gen_random_uuid(),
  message    text not null,
  created_by uuid not null references staff(id),
  created_at timestamptz not null default now(),
  active     boolean not null default true
);

alter table notices enable row level security;

create policy "notices readable by team" on notices
  for select using (auth.uid() is not null);
create policy "managers create notices" on notices
  for insert with check (is_manager() and created_by = current_staff_id());
create policy "managers update notices" on notices
  for update using (is_manager()) with check (is_manager());
create policy "managers delete notices" on notices
  for delete using (is_manager());
