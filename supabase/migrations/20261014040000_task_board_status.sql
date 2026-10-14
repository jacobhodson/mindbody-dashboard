-- Kanban "Doing" state for rock tasks (the rock page's Board view).
-- null = To Do, 'doing' = in progress; Done is still the task's completion
-- row, so a tick from Home / the list view lands it in Done too.
alter table task_templates
  add column board_status text check (board_status in ('doing'));

-- Unassigned rock tasks are communal (anyone can add or tick them), so any
-- staff member can also move them across the board / edit them. Assigned
-- ones keep the owner / assignee / manager rule.
create policy "staff edit unassigned rock tasks" on task_templates
  for update using (rock_id is not null and assigned_staff_id is null and current_staff_id() is not null)
  with check (rock_id is not null and current_staff_id() is not null);
