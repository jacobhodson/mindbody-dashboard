-- Notes thread on a task (used for rock tasks and meeting to-dos). Visibility
-- follows the task itself: the subquery runs under task_templates' own RLS,
-- so if you can see the task you can see and add to its notes.
create table task_notes (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references task_templates(id) on delete cascade,
  staff_id    uuid references staff(id) on delete set null default current_staff_id(),
  body        text not null,
  created_at  timestamptz not null default now()
);
create index task_notes_template_idx on task_notes (template_id, created_at);

alter table task_notes enable row level security;
create policy "task notes readable with the task" on task_notes
  for select using (exists (select 1 from task_templates t where t.id = template_id));
create policy "add own task notes" on task_notes
  for insert with check (
    staff_id = current_staff_id()
    and exists (select 1 from task_templates t where t.id = template_id)
  );
create policy "author or manager deletes task notes" on task_notes
  for delete using (is_manager() or staff_id = current_staff_id());
