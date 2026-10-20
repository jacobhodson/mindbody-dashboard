-- ============================================================================
-- Meeting to-dos (incl. IDS to-dos) can now also carry a rock_id, so they
-- show on that rock's page too. The rock-task policies granted read (and,
-- when unassigned, edit) to all staff on rock_id alone — that would expose a
-- Leadership Huddle to-do to the whole team the moment it's linked to a
-- rock. A task that belongs to a meeting now stays within that meeting's
-- audience (can_see_meeting) whether or not it's linked to a rock.
-- ============================================================================

drop policy "rock and meeting tasks readable" on task_templates;
create policy "rock and meeting tasks readable" on task_templates
  for select using (
    (meeting_id is not null and can_see_meeting(meeting_id))
    or (meeting_id is null and rock_id is not null)
  );

drop policy "staff edit unassigned rock tasks" on task_templates;
create policy "staff edit unassigned rock tasks" on task_templates
  for update using (
    rock_id is not null and assigned_staff_id is null and current_staff_id() is not null
    and (meeting_id is null or can_see_meeting(meeting_id))
  )
  with check (
    rock_id is not null and current_staff_id() is not null
    and (meeting_id is null or can_see_meeting(meeting_id))
  );

drop policy "anyone adds rock or meeting tasks" on task_templates;
create policy "anyone adds rock or meeting tasks" on task_templates
  for insert with check (
    ((meeting_id is not null and can_see_meeting(meeting_id)) or (meeting_id is null and rock_id is not null))
    and scope = 'individual' and owner_staff_id = current_staff_id()
  );
