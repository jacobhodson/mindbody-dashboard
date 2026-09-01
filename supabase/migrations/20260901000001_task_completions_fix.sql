-- ============================================================================
-- Fix task_completions uniqueness for team-scope rows, and track who actually
-- logged an entry separately from who it's assigned to (staff_id stays null
-- for team tasks; completed_by always records the real person).
-- Safe to run even though the table is empty — no data migration needed.
-- ============================================================================

alter table task_completions
  drop constraint task_completions_template_id_staff_id_period_start_key;

alter table task_completions
  add column completed_by uuid references staff(id);

-- individual tasks: one row per template+staff+period
create unique index task_completions_individual_uniq
  on task_completions (template_id, staff_id, period_start)
  where staff_id is not null;

-- team tasks: one shared row per template+period, regardless of who logs it
create unique index task_completions_team_uniq
  on task_completions (template_id, period_start)
  where staff_id is null;

-- Replace the insert/update policies so completed_by can't be spoofed to
-- someone else's identity (managers still can, for corrections).
drop policy "log own or team tasks" on task_completions;
create policy "log own or team tasks" on task_completions
  for insert with check (
    is_manager()
    or (staff_id = current_staff_id() and completed_by = current_staff_id())
    or (staff_id is null and completed_by = current_staff_id())
  );

drop policy "update own or team tasks" on task_completions;
create policy "update own or team tasks" on task_completions
  for update using (
    is_manager()
    or staff_id = current_staff_id()
    or staff_id is null
  ) with check (
    is_manager()
    or (staff_id = current_staff_id() and completed_by = current_staff_id())
    or (staff_id is null and completed_by = current_staff_id())
  );

-- ── starter templates ───────────────────────────────────────────────────────
-- Placeholder examples so the checklist page isn't empty on first login —
-- edit or delete these directly in the Supabase Table Editor to match your
-- actual daily/weekly/monthly operations.
insert into task_templates (key, label, description, scope, cadence, target_type, target_value, unit, sort_order) values
  ('daily-reds-check',    'Check Red''s List',        'Review and action today''s at-risk members.', 'individual', 'daily',   'boolean', 1,  null,    1),
  ('daily-open-gym',      'Open gym walkthrough',     'Walk the floor, tidy equipment, greet members.', 'team',       'daily',   'boolean', 1,  null,    2),
  ('weekly-checkin-calls','Client check-in calls',    'Call clients who haven''t been contacted this week.', 'individual', 'weekly',  'count',   10, 'calls', 3),
  ('monthly-retention',   'Review member retention',  'Team review of the month''s lapsed/at-risk trend.', 'team',       'monthly', 'boolean', 1,  null,    4)
on conflict (key) do nothing;
