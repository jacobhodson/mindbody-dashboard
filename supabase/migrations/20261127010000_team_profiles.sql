-- Team tab → per-person profile pages (2026-11-27).
--
--   one_on_ones      one row per staff member per week (week_start = Monday)
--                    with the 1-1 notes. To-dos are ordinary task_templates
--                    rows tagged with one_on_one_id (like meeting to-dos), so
--                    an assigned to-do also shows in the assignee's Home
--                    checklist.
--   staff_documents  files linked to a staff member (first aid cert, etc.)
--                    with an optional expiry date. The files live in the
--                    PRIVATE storage bucket `staff-documents` at
--                    `<staff_id>/<random>-<filename>`; the app only ever hands
--                    out short-lived signed URLs.
--
-- Managers only for now. Every row (and every storage path) carries the
-- staff member's id, so letting a staff member read/update their own 1-1s
-- and documents later is just extra policies, e.g.:
--
--   create policy "staff read own 1-1s" on one_on_ones
--     for select to authenticated using (staff_id = current_staff_id());
--   create policy "staff read own documents" on staff_documents
--     for select to authenticated using (staff_id = current_staff_id());
--   create policy "staff read own document files" on storage.objects
--     for select to authenticated using (
--       bucket_id = 'staff-documents'
--       and (storage.foldername(name))[1] = current_staff_id()::text);
--
-- (1-1 to-dos assigned to someone are already readable by that assignee via
-- the existing "templates readable by owner, assignee, or team" policy.)

-- ── 1-1 meetings ────────────────────────────────────────────────────────
create table one_on_ones (
  id               uuid primary key default gen_random_uuid(),
  staff_id         uuid not null references staff(id) on delete cascade,
  week_start       date not null check (extract(isodow from week_start) = 1),
  notes            text,
  manager_staff_id uuid references staff(id) on delete set null default current_staff_id(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (staff_id, week_start)
);
create index one_on_ones_staff_week on one_on_ones (staff_id, week_start desc);

create or replace function one_on_ones_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger one_on_ones_touch before update on one_on_ones
  for each row execute function one_on_ones_touch();

alter table one_on_ones enable row level security;
create policy "managers read 1-1s"   on one_on_ones for select to authenticated using (is_manager());
create policy "managers add 1-1s"    on one_on_ones for insert to authenticated with check (is_manager());
create policy "managers edit 1-1s"   on one_on_ones for update to authenticated using (is_manager()) with check (is_manager());
create policy "managers delete 1-1s" on one_on_ones for delete to authenticated using (is_manager());

-- 1-1 to-dos. Existing task_templates policies already cover them: a
-- manager can insert/update/delete any task, the creator owns it, and the
-- assignee can read (and tick) it.
alter table task_templates add column one_on_one_id uuid references one_on_ones(id) on delete cascade;
create index task_templates_one_on_one on task_templates (one_on_one_id) where one_on_one_id is not null;

-- ── Documents ───────────────────────────────────────────────────────────
create table staff_documents (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references staff(id) on delete cascade,
  title       text not null,
  file_path   text not null unique,      -- path inside the staff-documents bucket
  file_name   text not null,             -- original file name, for downloads
  mime_type   text,
  size_bytes  bigint,
  expires_on  date,
  uploaded_by uuid references staff(id) on delete set null default current_staff_id(),
  created_at  timestamptz not null default now(),
  check (split_part(file_path, '/', 1) = staff_id::text)
);
create index staff_documents_staff on staff_documents (staff_id, created_at desc);

alter table staff_documents enable row level security;
create policy "managers read staff documents"   on staff_documents for select to authenticated using (is_manager());
create policy "managers add staff documents"    on staff_documents for insert to authenticated with check (is_manager());
create policy "managers edit staff documents"   on staff_documents for update to authenticated using (is_manager()) with check (is_manager());
create policy "managers delete staff documents" on staff_documents for delete to authenticated using (is_manager());

-- Private bucket: no public URLs. 25 MB per file.
insert into storage.buckets (id, name, public, file_size_limit)
values ('staff-documents', 'staff-documents', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create policy "managers read staff document files" on storage.objects
  for select to authenticated using (bucket_id = 'staff-documents' and is_manager());
create policy "managers upload staff document files" on storage.objects
  for insert to authenticated with check (bucket_id = 'staff-documents' and is_manager());
create policy "managers update staff document files" on storage.objects
  for update to authenticated using (bucket_id = 'staff-documents' and is_manager())
  with check (bucket_id = 'staff-documents' and is_manager());
create policy "managers delete staff document files" on storage.objects
  for delete to authenticated using (bucket_id = 'staff-documents' and is_manager());
