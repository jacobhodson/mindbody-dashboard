-- ============================================================================
-- Rocks (quarterly projects) + weekly meetings (Monday Team Meeting and the
-- manager-only Leadership Huddle), replacing the Notion ROCKS / MONDAY TEAM
-- MEETING / Leadership Huddle / IDENTIFY, DISCUSS, SOLVE databases.
--
-- Rock tasks and meeting to-dos are ordinary task_templates rows (cadence
-- 'once', due_date set) tagged with rock_id / meeting_id, so they also land
-- in the assignee's normal Home checklist.
-- ============================================================================

-- ── rocks ───────────────────────────────────────────────────────────────────
create table rocks (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  description    text,
  status         text not null default 'planned'
                 check (status in ('planned','doing','ongoing','on_hold','done')),
  stage          text check (stage in ('build','braintrust','close')), -- Craft Cycle stage
  on_track       boolean not null default true,
  owner_staff_id uuid references staff(id) on delete set null,
  due_date       date,
  completed_on   date,
  notion_page_id text unique,
  created_by     uuid references staff(id) on delete set null default current_staff_id(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Keeps updated_at fresh and stamps completed_on when a rock moves to done.
create function rocks_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' then
      new.completed_on := coalesce(new.completed_on, current_date);
    end if;
  else
    new.completed_on := null;
  end if;
  return new;
end;
$$;

create trigger rocks_touch before insert or update on rocks
  for each row execute function rocks_touch();

alter table rocks enable row level security;
create policy "rocks readable by team" on rocks
  for select using (auth.uid() is not null);
create policy "managers create rocks" on rocks
  for insert with check (is_manager());
create policy "managers or rock owner update rocks" on rocks
  for update using (is_manager() or owner_staff_id = current_staff_id())
  with check (is_manager() or owner_staff_id = current_staff_id());
create policy "managers delete rocks" on rocks
  for delete using (is_manager());

-- ── rock_notes ──────────────────────────────────────────────────────────────
-- Running update log on a rock — anyone can add one.
create table rock_notes (
  id         uuid primary key default gen_random_uuid(),
  rock_id    uuid not null references rocks(id) on delete cascade,
  staff_id   uuid references staff(id) on delete set null default current_staff_id(),
  body       text not null,
  created_at timestamptz not null default now()
);
create index rock_notes_rock_idx on rock_notes (rock_id, created_at desc);

alter table rock_notes enable row level security;
create policy "rock notes readable by team" on rock_notes
  for select using (auth.uid() is not null);
create policy "anyone adds own rock notes" on rock_notes
  for insert with check (staff_id = current_staff_id());
create policy "author or manager deletes rock notes" on rock_notes
  for delete using (is_manager() or staff_id = current_staff_id());

-- ── meetings ────────────────────────────────────────────────────────────────
-- One row per meeting type per week (meeting_date = that week's Monday).
-- Created on demand the first time someone opens that week's meeting.
create table meetings (
  id           uuid primary key default gen_random_uuid(),
  meeting_type text not null check (meeting_type in ('team','leadership')),
  meeting_date date not null,
  status       text not null default 'planned' check (status in ('planned','in_progress','done')),
  created_at   timestamptz not null default now(),
  unique (meeting_type, meeting_date)
);

alter table meetings enable row level security;

-- Team meetings are open to all staff; the Leadership Huddle is managers only.
create function can_see_meeting(p_meeting_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from meetings
    where id = p_meeting_id and (meeting_type = 'team' or is_manager())
  );
$$;

create policy "meetings readable by audience" on meetings
  for select using (meeting_type = 'team' or is_manager());
create policy "audience creates meetings" on meetings
  for insert with check (auth.uid() is not null and (meeting_type = 'team' or is_manager()));
create policy "audience updates meetings" on meetings
  for update using (meeting_type = 'team' or is_manager())
  with check (meeting_type = 'team' or is_manager());
create policy "managers delete meetings" on meetings
  for delete using (is_manager());

-- ── meeting_items ───────────────────────────────────────────────────────────
-- What people "pop in" to an agenda section (wins, client headlines, the
-- Leadership cascade…). One row per entry so people never overwrite each
-- other. The Leadership Huddle's 'cascade_*' sections reach the team via
-- leadership_cascade() below, not via this table's policies.
create table meeting_items (
  id         uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  section    text not null,
  staff_id   uuid references staff(id) on delete set null default current_staff_id(),
  body       text not null,
  created_at timestamptz not null default now()
);
create index meeting_items_meeting_idx on meeting_items (meeting_id, section, created_at);

alter table meeting_items enable row level security;
create policy "meeting items readable by audience" on meeting_items
  for select using (can_see_meeting(meeting_id));
create policy "audience adds own meeting items" on meeting_items
  for insert with check (can_see_meeting(meeting_id) and staff_id = current_staff_id());
create policy "author or manager edits meeting items" on meeting_items
  for update using (is_manager() or (staff_id = current_staff_id() and can_see_meeting(meeting_id)))
  with check (is_manager() or (staff_id = current_staff_id() and can_see_meeting(meeting_id)));
create policy "author or manager deletes meeting items" on meeting_items
  for delete using (is_manager() or (staff_id = current_staff_id() and can_see_meeting(meeting_id)));

-- The Leadership Huddle's agreed message for the team (its 'cascade_*'
-- items) for a given week — the Team Meeting shows it under "Cascade from
-- Leadership" without the team being able to read the rest of the huddle.
create function leadership_cascade(p_meeting_date date)
returns table (id uuid, section text, body text, staff_id uuid, created_at timestamptz)
language sql
security definer set search_path = public
stable
as $$
  select i.id, i.section, i.body, i.staff_id, i.created_at
  from meeting_items i
  join meetings m on m.id = i.meeting_id
  where m.meeting_type = 'leadership'
    and m.meeting_date = p_meeting_date
    and i.section like 'cascade\_%'
    and auth.uid() is not null
  order by i.created_at;
$$;

-- ── meeting_ratings ─────────────────────────────────────────────────────────
create table meeting_ratings (
  id         uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  staff_id   uuid not null references staff(id) on delete cascade default current_staff_id(),
  rating     int not null check (rating between 1 and 10),
  suggestion text,
  created_at timestamptz not null default now(),
  unique (meeting_id, staff_id)
);

alter table meeting_ratings enable row level security;
create policy "ratings readable by audience" on meeting_ratings
  for select using (can_see_meeting(meeting_id));
create policy "rate own" on meeting_ratings
  for insert with check (can_see_meeting(meeting_id) and staff_id = current_staff_id());
create policy "update own rating" on meeting_ratings
  for update using (staff_id = current_staff_id()) with check (staff_id = current_staff_id());
create policy "delete own rating" on meeting_ratings
  for delete using (is_manager() or staff_id = current_staff_id());

-- ── issues (IDS) ────────────────────────────────────────────────────────────
-- Not per-meeting: an issue stays on its board week to week until solved.
-- board='leadership' issues are managers only; the huddle can move one to
-- the team board.
create table issues (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  notes          text,
  board          text not null default 'team' check (board in ('team','leadership')),
  status         text not null default 'open' check (status in ('open','todos_created','solved')),
  raised_by      uuid references staff(id) on delete set null default current_staff_id(),
  solved_at      timestamptz,
  notion_page_id text unique,
  created_at     timestamptz not null default now()
);
create index issues_board_status_idx on issues (board, status);

alter table issues enable row level security;
create policy "issues readable by audience" on issues
  for select using (board = 'team' or is_manager());
create policy "audience raises issues" on issues
  for insert with check ((board = 'team' or is_manager()) and raised_by = current_staff_id());
create policy "audience updates issues" on issues
  for update using (board = 'team' or is_manager())
  with check (board = 'team' or is_manager());
create policy "raiser or manager deletes issues" on issues
  for delete using (is_manager() or raised_by = current_staff_id());

-- ── task_templates links ────────────────────────────────────────────────────
alter table task_templates
  add column rock_id    uuid references rocks(id) on delete cascade,
  add column meeting_id uuid references meetings(id) on delete set null,
  add column issue_id   uuid references issues(id) on delete set null;
create index task_templates_rock_idx    on task_templates (rock_id) where rock_id is not null;
create index task_templates_meeting_idx on task_templates (meeting_id) where meeting_id is not null;

-- Rock tasks are visible to everyone (they show on the rock), and anyone
-- can add one to any rock, assigned to anyone. Team-meeting to-dos likewise;
-- Leadership Huddle to-dos stay with the existing owner/assignee/manager
-- visibility. These are permissive policies, OR'd with the existing ones.
create policy "rock and meeting tasks readable" on task_templates
  for select using (
    rock_id is not null
    or (meeting_id is not null and can_see_meeting(meeting_id))
  );
create policy "anyone adds rock or meeting tasks" on task_templates
  for insert with check (
    (rock_id is not null or (meeting_id is not null and can_see_meeting(meeting_id)))
    and scope = 'individual'
    and owner_staff_id = current_staff_id()
  );
create policy "rock and meeting task owner, assignee or manager updates" on task_templates
  for update using (
    (rock_id is not null or meeting_id is not null)
    and (is_manager() or owner_staff_id = current_staff_id() or assigned_staff_id = current_staff_id())
  )
  with check (
    (rock_id is not null or meeting_id is not null)
    and (is_manager() or owner_staff_id = current_staff_id() or assigned_staff_id = current_staff_id())
  );
create policy "rock and meeting task owner, assignee or manager deletes" on task_templates
  for delete using (
    (rock_id is not null or meeting_id is not null)
    and (is_manager() or owner_staff_id = current_staff_id() or assigned_staff_id = current_staff_id())
  );

-- ── task_completions delete ─────────────────────────────────────────────────
-- There was no DELETE policy, so unticking a task (useTeamTasks.toggle)
-- silently deleted nothing and the tick came back on reload. Mirrors the
-- existing update policy.
drop policy if exists "delete own or team completions" on task_completions;
create policy "delete own or team completions" on task_completions
  for delete using (is_manager() or staff_id = current_staff_id() or staff_id is null);
