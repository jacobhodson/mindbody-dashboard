-- Settings → Attendance: which Mindbody appointment types count on the
-- Personal Training tab, and which class types count in Group Training
-- attendance.
--
-- One row per type a manager has changed; no row = the built-in default:
--   appointment → counted when utils/session-classify.js says pt or sp
--   class       → counted (Group Training has always counted every class)
-- Keyed by Mindbody id, not name: the site has duplicate names on different
-- ids (two "Personal Training" session types, two "Newstrength" and two
-- "Run Club" class descriptions).

create table if not exists public.attendance_type_rules (
  kind       text not null check (kind in ('appointment', 'class')),
  type_id    text not null,          -- SessionTypeId / ClassDescription.Id
  type_name  text,                   -- name when last saved, for reading the table
  included   boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.staff(id) on delete set null,
  primary key (kind, type_id)
);

alter table public.attendance_type_rules enable row level security;

drop policy if exists "attendance rules readable by team" on public.attendance_type_rules;
create policy "attendance rules readable by team" on public.attendance_type_rules
  for select using (auth.uid() is not null);

drop policy if exists "managers write attendance rules" on public.attendance_type_rules;
create policy "managers write attendance rules" on public.attendance_type_rules
  for all using (is_manager()) with check (is_manager());

-- The type lists live in the service-role-only mirror, so managers read them
-- through this. uses_120d = appointments / class sessions in the last 120
-- days, so the UI can sort live types first and dim unused ones.
create or replace function public.attendance_type_options()
returns table (kind text, type_id text, name text, uses_120d bigint)
language sql
stable
security definer
set search_path = public
as $$
  with st as (
    select jsonb_array_elements(raw) t from mb_reference where key = 'sessiontypes'
  ),
  appt_use as (
    select raw->>'SessionTypeId' id, count(*) n
    from mb_appointments where local_ts > (now() at time zone 'Australia/Sydney') - interval '120 days'
    group by 1
  ),
  cls as (
    select raw->'ClassDescription'->>'Id' id,
           max(trim(raw->'ClassDescription'->>'Name')) nm,
           count(*) filter (where local_ts > (now() at time zone 'Australia/Sydney') - interval '120 days') n
    from mb_classes
    where raw->'ClassDescription'->>'Id' is not null
    group by 1
  )
  select 'appointment', st.t->>'Id', trim(st.t->>'Name'), coalesce(appt_use.n, 0)
  from st left join appt_use on appt_use.id = st.t->>'Id'
  where is_manager()
  union all
  select 'class', cls.id, cls.nm, cls.n
  from cls
  where is_manager();
$$;

revoke all on function public.attendance_type_options() from public, anon;
grant execute on function public.attendance_type_options() to authenticated;
