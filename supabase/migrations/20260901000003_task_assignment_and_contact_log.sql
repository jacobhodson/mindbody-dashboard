-- ============================================================================
-- Phase 2 extension: assign a task to a specific person, and move the
-- Notion-backed contact log (Red's List / Fringe / PT Reds "Contact" button)
-- onto the same Supabase table used by task_type='contact_log' tasks.
-- ============================================================================

-- ── Task assignment ──────────────────────────────────────────────────────────
-- Distinct from owner_staff_id (who can edit the template) and scope (team vs
-- individual): when a manager sets assigned_staff_id, the task is private to
-- that person + managers, not the whole team.

alter table task_templates
  add column assigned_staff_id uuid references staff(id) on delete cascade;

drop policy "templates readable by owner or team" on task_templates;
create policy "templates readable by owner, assignee, or team" on task_templates
  for select using (
    scope = 'team'
    or (assigned_staff_id is null and owner_staff_id is null)
    or owner_staff_id = current_staff_id()
    or assigned_staff_id = current_staff_id()
    or is_manager()
  );

drop policy "create shared or own personal templates" on task_templates;
create policy "create shared, personal, or assigned templates" on task_templates
  for insert with check (
    (scope = 'team' and assigned_staff_id is null and is_manager())
    or (owner_staff_id = current_staff_id() and assigned_staff_id is null)
    or (assigned_staff_id is not null and is_manager())
  );

-- update/delete policies are unchanged — assignment is a manager action, the
-- assignee completes it via the existing task_completions policies as-is.

-- ── Contact log → Supabase ──────────────────────────────────────────────────
-- Promote last round's task-only contact_log table into the general-purpose
-- store, adding the client-ID column the Operations tab needs (Red's List /
-- Fringe / PT Reds key everything off the Mindbody client ID).

alter table task_contact_log rename to contact_log;
alter table contact_log add column client_mindbody_id text;
create index contact_log_client_idx on contact_log (client_mindbody_id, contacted_at desc);

alter policy "task contact log readable by team" on contact_log rename to "contact log readable by team";
alter policy "log own contact entries"           on contact_log rename to "log own contact log entries";
alter policy "update own contact entries"        on contact_log rename to "update own contact log entries";
alter policy "delete own contact entries"        on contact_log rename to "delete own contact log entries";
