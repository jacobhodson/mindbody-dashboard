-- ============================================================================
-- Win the Week: department-grouped target cards with task-linked
-- auto-incrementing progress, replacing the flat "Targets for this period"
-- list in Scorecard.jsx.
-- ============================================================================

alter table targets add column department text check (department in ('operations','acquisition'));

-- A target's named owner(s) — real staff links (not free text) so the app
-- can gate the "Update metric" control to managers + these people.
create table target_owners (
  target_id  uuid not null references targets(id) on delete cascade,
  staff_id   uuid not null references staff(id) on delete cascade,
  primary key (target_id, staff_id)
);
alter table target_owners enable row level security;
create policy "target owners readable by team" on target_owners
  for select using (auth.uid() is not null);
create policy "managers manage target owners" on target_owners
  for all using (is_manager()) with check (is_manager());

-- Optional link from a task to the target it should count toward.
-- linked_metric_key is a denormalized copy of the target's metric_key at
-- link time, so useTeamTasks.js's toggle()/markDone() never need to join
-- targets just to log progress.
alter table task_templates add column linked_target_id uuid references targets(id) on delete set null;
alter table task_templates add column linked_metric_key text;

-- metric_actuals previously had no INSERT/UPDATE policy at all — every row
-- so far came from the service-role-backed scheduled-daily-refresh.js sync.
-- Opened to any signed-in staff for: (a) the manual "Update metric" button
-- (UI-gated to managers + a target's owners), and (b) task-linked
-- auto-increments, which must work for whoever completes the task, not
-- just that target's specific owners. Same "UI gates, RLS guards
-- unauthenticated access" precedent as contact_log/client_notes.
create policy "staff log metric progress" on metric_actuals
  for insert with check (auth.uid() is not null);
create policy "staff update metric progress" on metric_actuals
  for update using (auth.uid() is not null) with check (auth.uid() is not null);
