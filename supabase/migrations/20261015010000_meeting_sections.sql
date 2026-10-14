-- ============================================================================
-- Editable meeting agendas ("build mode"). The Team Meeting / Leadership
-- Huddle sections used to be a constant in src/utils/meetingAgendas.js; they
-- now live here so managers can rename, re-hint, re-time, reorder, add and
-- remove sections from the Meetings tab.
--
-- `kind` picks the component that renders the section (see meetingAgendas.js).
-- meeting_items are keyed by (meeting_id, section key), so a key never changes
-- once created.
--
-- History: a section only shows for meetings dated within
-- [active_from, active_until). Adding sets active_from to the current week's
-- Monday; removing sets active_until to it — so past weeks keep the agenda
-- (and entries) they had. Title/hint/minutes/order edits apply to every week.
-- ============================================================================

create table meeting_sections (
  id            uuid primary key default gen_random_uuid(),
  meeting_type  text not null check (meeting_type in ('team','leadership')),
  key           text not null,
  title         text not null,
  hint          text,
  minutes       int check (minutes is null or minutes between 0 and 240),
  kind          text not null check (kind in
                  ('items','cascade_in','cascade_out','scorecard','rocks','ids','last_todos','todos','rating')),
  board         text check (board in ('team','leadership')),   -- ids only
  voices        boolean not null default false,               -- ids only
  sort_order    int not null default 0,
  active_from   date,                                         -- null = always
  active_until  date,                                         -- null = still on the agenda
  created_at    timestamptz not null default now(),
  unique (meeting_type, key)
);
create index meeting_sections_type_idx on meeting_sections (meeting_type, sort_order);

alter table meeting_sections enable row level security;
create policy "meeting sections readable" on meeting_sections
  for select using (auth.uid() is not null and (meeting_type = 'team' or is_manager()));
create policy "managers manage meeting sections" on meeting_sections
  for all using (is_manager()) with check (is_manager());

-- Renumber an agenda 0..n in the given order. Runs as the caller, so the
-- managers-only update policy still applies.
create function reorder_meeting_sections(p_ids uuid[])
returns void
language sql
as $$
  update meeting_sections s set sort_order = o.ord - 1
  from unnest(p_ids) with ordinality as o(id, ord)
  where s.id = o.id;
$$;

-- Seed with the agendas as they were hard-coded.
insert into meeting_sections (meeting_type, key, title, minutes, kind, board, voices, hint, sort_order) values
  ('team', 'wins', 'Wins', 5, 'items', null, false,
     'Share one personal and one professional highlight each.', 0),
  ('team', 'cascade', 'Cascade from Leadership', 3, 'cascade_in', null, false,
     'GM delivers the agreed message from this week''s Leadership Huddle.', 1),
  ('team', 'scorecard', 'Team Scorecard Review', null, 'scorecard', null, false,
     'Last week''s numbers against target. Anything off track goes to IDS.', 2),
  ('team', 'pipeline', 'FEO Pipeline Party', null, 'items', null, false,
     'Review everyone in the pipeline to hit 80% rollovers. 🟢 on track = skip · 🟠🔴 = discuss + assign.', 3),
  ('team', 'headlines', 'Client Headlines', null, 'items', null, false,
     'Any significant client information from the past week.', 4),
  ('team', 'reach_outs', 'Client Reach-outs', null, 'items', null, false,
     'Red''s List — who needs a call or message this week.', 5),
  ('team', 'last_todos', 'Last Week''s To-Dos', 5, 'last_todos', null, false,
     'Done or not done — no discussion. Anything stuck goes to IDS.', 6),
  ('team', 'ids', 'Team IDS — Identify, Discuss, Solve', 8, 'ids', 'team', true,
     'Issues the team owns and can solve — real, unsolved, theirs.', 7),
  ('team', 'todos', 'Conclude — New To-Dos', 5, 'todos', null, false,
     'Action items for the week, assigned from IDS.', 8),
  ('team', 'events', 'Events & Reminders', null, 'items', null, false,
     'Upcoming events and things to remember.', 9),
  ('team', 'rating', 'Meeting Rating', 2, 'rating', null, false,
     'Rate the meeting''s effectiveness 1–10 and suggest one improvement.', 10),

  ('leadership', 'checkin', 'Segue / Check-in', 2, 'items', null, false,
     'Quick personal + business beat. Full wins live in the Team Meeting.', 0),
  ('leadership', 'scorecard', 'Scorecard Review', 8, 'scorecard', null, false,
     'On / off track only. Off-track drops to IDS.', 1),
  ('leadership', 'rocks', 'Rock Review', 5, 'rocks', null, false,
     'Status + on/off track only. Never the craft content itself — that''s the Braintrust''s job.', 2),
  ('leadership', 'ids', 'IDS — Identify, Discuss, Solve', 8, 'ids', 'leadership', false,
     'Off-track scorecards + leadership-only issues. Solve leadership''s; sort the rest — move what the team should IDS itself to the Team board.', 3),
  ('leadership', 'cascade', 'Cascading Message', 2, 'cascade_out', null, false,
     'The handoff — don''t skip it. Agree before anyone leaves the room; it shows in this week''s Team Meeting.', 4),
  ('leadership', 'last_todos', 'Last Week''s To-Dos', null, 'last_todos', null, false,
     'Done or not done. Anything stuck goes to IDS.', 5),
  ('leadership', 'todos', 'Conclude — New To-Dos', 2, 'todos', null, false,
     'Assign new to-dos and flag upcoming events.', 6),
  ('leadership', 'rating', 'Rate', null, 'rating', null, false,
     'Each attendee rates 1–10 + one improvement.', 7);
