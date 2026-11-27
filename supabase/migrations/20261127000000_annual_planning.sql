-- ============================================================================
-- Annual Planning (2027 Planning Day) — a fourth meeting type, 'planning',
-- keyed by 1 January of the plan year and managers only (can_see_meeting()
-- already reads "team or is_manager()", so a new type is manager-gated with
-- no policy changes). Built from the owner's "2027 Planning Day" template.
--
-- New section kind planning_block: one pillar/block of the day. Its config:
--   goal      text shown under the title
--   prompts   [{ title, bullets: [text] }]           read-only discussion prompts
--   tables    [{ key, title, columns: [{ key, label, type?, options?, fixed? }],
--                rows?: [{ label, values?: { col: default } }],  -- fixed rows
--                add_rows?: bool, hint? }]           editable grids
--   lists     [{ key, title }]                       entries (meeting_items '<section>:<list>')
--   todos     { label?, suggestions?: [text] }       tasks scoped to this block
--   rocks     { due }                                rocks created from this block
--
-- meeting_table_rows: one row per grid row; cells jsonb keyed by column key.
-- Cells are written through set_meeting_table_cell() (security invoker, so
-- RLS applies) which merges one cell, so two people typing in different cells
-- of the same row don't overwrite each other.
--
-- task_templates.meeting_section scopes a to-do to one block of a meeting
-- (null = the meeting's general to-do list, as before).
-- rocks.meeting_id = the meeting a rock was set in (the Q1 rocks block).
-- ============================================================================

alter table meetings drop constraint meetings_meeting_type_check;
alter table meetings add constraint meetings_meeting_type_check
  check (meeting_type in ('team','leadership','monthly','planning'));

alter table meeting_sections drop constraint meeting_sections_meeting_type_check;
alter table meeting_sections add constraint meeting_sections_meeting_type_check
  check (meeting_type in ('team','leadership','monthly','planning'));

alter table meeting_sections drop constraint meeting_sections_kind_check;
alter table meeting_sections add constraint meeting_sections_kind_check check (kind in
  ('items','cascade_in','cascade_out','scorecard','scorecard_30','rocks','ids','last_todos','todos','rating','reds','carry','planning_block'));

alter table task_templates add column meeting_section text;
alter table rocks add column meeting_id uuid references meetings(id) on delete set null;

create table meeting_table_rows (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references meetings(id) on delete cascade,
  section     text not null,           -- '<section key>:<table key>'
  row_key     text not null,           -- 'r<index>' for fixed rows, uuid for added rows
  sort_order  integer not null default 0,
  cells       jsonb not null default '{}'::jsonb,
  updated_by  uuid default current_staff_id() references staff(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (meeting_id, section, row_key)
);
create index meeting_table_rows_meeting on meeting_table_rows (meeting_id);

alter table meeting_table_rows enable row level security;
create policy "audience reads meeting tables" on meeting_table_rows
  for select using (can_see_meeting(meeting_id));
create policy "audience adds meeting table rows" on meeting_table_rows
  for insert with check (can_see_meeting(meeting_id));
create policy "audience edits meeting table rows" on meeting_table_rows
  for update using (can_see_meeting(meeting_id)) with check (can_see_meeting(meeting_id));
create policy "audience deletes meeting table rows" on meeting_table_rows
  for delete using (can_see_meeting(meeting_id));

create function set_meeting_table_cell(
  p_meeting_id uuid, p_section text, p_row_key text, p_col text, p_value text, p_sort integer default 0)
returns meeting_table_rows
language sql
security invoker set search_path = public
as $$
  insert into meeting_table_rows (meeting_id, section, row_key, sort_order, cells)
  values (p_meeting_id, p_section, p_row_key, p_sort, jsonb_build_object(p_col, p_value))
  on conflict (meeting_id, section, row_key) do update
    set cells = meeting_table_rows.cells || jsonb_build_object(p_col, p_value),
        updated_by = current_staff_id(),
        updated_at = now()
  returning *;
$$;

-- ── The 2027 Planning Day agenda ────────────────────────────────────────────
insert into meeting_sections (meeting_type, key, title, kind, hint, minutes, config, sort_order) values
('planning', 'overview', 'Day details', 'planning_block',
 'The day ends with five priorities, one owner each, Q1 rocks and a scorecard everyone signed off on.', null,
 '{"tables": [{"key": "details", "title": "Details",
     "columns": [{"key": "item", "label": "Item", "fixed": true}, {"key": "detail", "label": "Detail"}],
     "rows": [{"label": "Date"}, {"label": "Venue"},
              {"label": "Time", "values": {"detail": "9:30am – 2:30pm"}},
              {"label": "Facilitator"}, {"label": "Scribe (fills this in live)"},
              {"label": "In the room", "values": {"detail": "Founders and GM (the team''s input comes through the pre-survey)"}},
              {"label": "Pre-work due", "values": {"detail": "Team survey closed 5 days before the day"}}]}],
   "prompts": [{"title": "Ground rules", "bullets": [
     "Ideas are cheap on the day; commitments are only what lands in the final priorities table.",
     "Every priority leaves with one owner and a first due date.",
     "Anything we can''t settle goes to the Parking lot, then IDS at the next weekly meeting."]}]}', 0),

('planning', 'before', 'Before the day', 'planning_block',
 'Prep tasks — they land on each owner''s Home checklist.', null,
 '{"todos": {"label": "Add prep task", "suggestions": [
     "Lock the date and send the calendar invite",
     "Send the team pre-survey link with a close date",
     "Pull the 2026 numbers into the look-back table (churn, rollover %, attendance, members, events)",
     "Summarise survey themes into the look-back section",
     "Founders bring their 2027 growth goal and any fixed commitments",
     "Print the agenda; book food and a whiteboard",
     "Nath and Jake review this plan by Tue 1 Dec"]}}', 1),

('planning', 'agenda', 'Agenda', 'planning_block',
 'Five hours, four pillars, with the most time on events and programming; the team survey feeds every block.', null,
 '{"tables": [{"key": "agenda", "title": "Run sheet",
     "columns": [{"key": "time", "label": "Time"}, {"key": "block", "label": "Block"}, {"key": "lead", "label": "Lead"}, {"key": "output", "label": "Output"}],
     "rows": [
       {"label": "1", "values": {"time": "9:30", "block": "Welcome, why we''re here, ground rules", "lead": "Founders", "output": "Shared goal for the day"}},
       {"label": "2", "values": {"time": "9:40", "block": "2026 look-back + survey themes", "lead": "GM", "output": "Wins, lessons, 3 things to fix"}},
       {"label": "3", "values": {"time": "10:10", "block": "Pillar 1 — Growth", "lead": "Founders", "output": "Growth goal, channels, referrals"}},
       {"label": "4", "values": {"time": "10:50", "block": "Pillar 2 — Team & workflows", "lead": "GM", "output": "Structure, seats, SOP fixes"}},
       {"label": "5", "values": {"time": "11:30", "block": "Break"}},
       {"label": "6", "values": {"time": "11:45", "block": "Pillar 3 — Events", "lead": "GM", "output": "2027 events calendar + owners"}},
       {"label": "7", "values": {"time": "12:40", "block": "Lunch"}},
       {"label": "8", "values": {"time": "1:10", "block": "Pillar 4 — Group programming", "lead": "Founders", "output": "Program cycles + coach input loop"}},
       {"label": "9", "values": {"time": "2:05", "block": "Pick the priorities, set Q1 rocks + scorecard", "lead": "All", "output": "Signed-off 2027 plan"}},
       {"label": "10", "values": {"time": "2:20", "block": "Parking lot + close", "lead": "Facilitator", "output": "Next steps with dates"}}],
     "add_rows": true}]}', 2),

('planning', 'lookback', '2026 look-back', 'planning_block',
 'One line to open: how did 2026 go, in a sentence?', 30,
 '{"tables": [{"key": "scorecard", "title": "Scorecard",
     "columns": [{"key": "measure", "label": "Measure", "fixed": true}, {"key": "target", "label": "2026 target"},
                 {"key": "actual", "label": "2026 actual"}, {"key": "trend", "label": "Trend", "type": "select", "options": ["↑ Up", "→ Flat", "↓ Down"]},
                 {"key": "note", "label": "Note"}],
     "rows": [{"label": "Rollover %", "values": {"target": "80%"}}, {"label": "Monthly churn"},
              {"label": "Avg weekly attendance per member"}, {"label": "Active members (Dec)"},
              {"label": "Consults → paid conversion"}, {"label": "Referrals"}, {"label": "Events run / attendance"}]}],
   "lists": [{"key": "one_line", "title": "2026 in a sentence"},
             {"key": "wins", "title": "Wins to keep"},
             {"key": "didnt_work", "title": "What didn''t work"},
             {"key": "fix", "title": "Fix in 2027"},
             {"key": "survey", "title": "What the team told us (survey themes)"}]}', 3),

('planning', 'growth', 'Pillar 1 — Growth', 'planning_block',
 'A 2027 growth number from the founders and a clear view of where the team helps. Lead generation and marketing stay with the founders; the team''s part is converting consults, referrals and showing up well in public.', 40,
 '{"prompts": [
     {"title": "Discuss", "bullets": [
       "Founders: what''s the 2027 member or revenue goal, and when does net growth become the GM''s number (phase two)?",
       "Where did 2026 members come from? Which channels to double down on, which to drop?",
       "Referrals: how do we make it easy and rewarding for members to bring a friend?",
       "Consults and in-person sales: is every Lead Coach confident closing? What training is needed?",
       "New offers to test: challenges, short programs, partnerships, corporate, community events",
       "Capacity: can the timetable and team absorb the growth target?"]},
     {"title": "From the founders'' chat (26 Nov)", "bullets": [
       "Agree the growth strategy first, so events can be planned to support it."]}],
   "tables": [{"key": "plan", "title": "2027 growth plan",
     "columns": [{"key": "lever", "label": "Lever", "fixed": true}, {"key": "target", "label": "2027 target"},
                 {"key": "owner", "label": "Owner", "type": "person"}, {"key": "role", "label": "Team''s role"}, {"key": "first_step", "label": "First step"}],
     "rows": [{"label": "New members (net)", "values": {"owner": "Founders"}}, {"label": "Referrals"},
              {"label": "Consult conversion"}, {"label": "New offer / program"}, {"label": "Partnerships"}],
     "add_rows": true}],
   "lists": [{"key": "decisions", "title": "Decisions"}, {"key": "notes", "title": "Notes"}],
   "todos": {"label": "Add task"}}', 4),

('planning', 'team', 'Pillar 2 — Team & workflows', 'planning_block',
 'The right people in the right seats, and workflows that hit the numbers without the founders in the day-to-day.', 40,
 '{"prompts": [
     {"title": "Discuss", "bullets": [
       "Is GM → 3 Lead Coaches → 5 Casuals still the right shape for 2027? Where are the gaps?",
       "Who wants to grow through management (leading casuals) and who through ownership (a program, an event, Reds or Fringeys)?",
       "Which SOPs are followed, which are ignored, which are missing?",
       "Onboarding: where do consults stall between handover, first session, Mindbody setup and the 30-day handoff?",
       "Rostering and coverage: where are we thin (times, days, leave periods)?",
       "Meeting rhythm: is the weekly meeting focused? What should the 1-1s and quarterly offsites cover?"]},
     {"title": "From the founders'' chat (26 Nov)", "bullets": [
       "Keep this to an overview of the structure, not every workflow in detail.",
       "Lens: building a team, not just the current team. Map how the founders'' own schedules could shift and where the gaps are.",
       "Tie staff development to each person''s interests (from the chats with Jen, Jess and Bailey). E.g. Bailey works through the programming process for one block with support, then leads the next.",
       "Onboarding and workloads go to the GM''s session with the Lead Coaches, not this day."]}],
   "tables": [
     {"key": "seats", "title": "Seats for 2027",
      "columns": [{"key": "seat", "label": "Seat / area", "fixed": true}, {"key": "owner", "label": "Owner", "type": "person"},
                  {"key": "grow", "label": "Grow via", "type": "select", "options": ["Manage", "Own"]}, {"key": "support", "label": "Support needed"}],
      "rows": [{"label": "Onboarding + 30-day handoff"}, {"label": "Reds (at-risk members)"}, {"label": "Fringeys (low attendance)"},
               {"label": "Celebrations"}, {"label": "Rostering + timetable"}, {"label": "Facility + compliance"},
               {"label": "Casual recruitment + training"}],
      "add_rows": true},
     {"key": "sops", "title": "SOPs to fix or write",
      "columns": [{"key": "sop", "label": "SOP"}, {"key": "problem", "label": "Problem"},
                  {"key": "owner", "label": "Owner", "type": "person"}, {"key": "due", "label": "Due", "type": "date"}],
      "add_rows": true}],
   "lists": [{"key": "decisions", "title": "Decisions"}, {"key": "notes", "title": "Notes"}],
   "todos": {"label": "Add task"}}', 5),

('planning', 'events', 'Pillar 3 — Events', 'planning_block',
 'A full-year events calendar where every event has a purpose (retain, celebrate, grow) and a team lead matched to their genius zone. GM plans and delegates; the team delivers.', 55,
 '{"prompts": [
     {"title": "Discuss", "bullets": [
       "Which 2026 events were worth it (turnout, member feedback, new leads) and which should go?",
       "What''s the right rhythm: one flagship a quarter plus smaller monthly socials or challenges?",
       "Which events bring members'' friends in, and which keep current members engaged?",
       "Who on the team wants to lead which event?"]},
     {"title": "From the founders'' chat (26 Nov)", "bullets": [
       "Lock the main events into the calendar; add others ad hoc depending on capacity, availability and what''s trending, with no attachment to them.",
       "Plan around school holidays, long weekends and events like NS Games.",
       "Seasonal programs sit here.",
       "The calendar also drives the 2027 content plan."]}],
   "tables": [{"key": "calendar", "title": "2027 events calendar",
     "columns": [{"key": "month", "label": "Month", "fixed": true}, {"key": "event", "label": "Event"},
                 {"key": "purpose", "label": "Purpose", "type": "select", "options": ["Retain", "Celebrate", "Grow"]},
                 {"key": "lead", "label": "Lead", "type": "person"}, {"key": "support", "label": "Support"}, {"key": "budget", "label": "Budget"}],
     "rows": [{"label": "Jan"}, {"label": "Feb"}, {"label": "Mar"}, {"label": "Apr"}, {"label": "May"}, {"label": "Jun"},
              {"label": "Jul"}, {"label": "Aug"}, {"label": "Sep"}, {"label": "Oct"}, {"label": "Nov"}, {"label": "Dec"}],
     "add_rows": true}],
   "lists": [{"key": "decisions", "title": "Decisions"}, {"key": "notes", "title": "Notes"}],
   "todos": {"label": "Add task"}}', 6),

('planning', 'programming', 'Pillar 4 — Group programming', 'planning_block',
 'A 2027 program structure the founders own, with a clear loop for coaches to feed back what''s working on the floor.', 55,
 '{"prompts": [
     {"title": "Discuss", "bullets": [
       "What do members love and what do they skip? (attendance by class type and time)",
       "Combination of programming + logistics — program for 24 every day.",
       "Training cycles for 2027: block length, testing weeks, deload weeks, themed challenges",
       "Class types and timetable: anything to add, merge or drop?",
       "Scaling: are beginners and advanced members both well served in the same session?",
       "Coach input: how do coaches flag issues and ideas back to the founders (when, where, who)?",
       "Briefing: how does the team learn each block before it hits the floor?"]},
     {"title": "From the founders'' chat (26 Nov)", "bullets": [
       "Slightly shorter training blocks (phase one / phase two).",
       "Set blocks around school holidays, long weekends and events like NS Games, so we stop extending or shifting them mid-year.",
       "Logistics: every session has to work for 24, including the 5:30am class. Check flow and conditioning setups before publishing."]}],
   "tables": [
     {"key": "cycle", "title": "2027 program cycle",
      "columns": [{"key": "quarter", "label": "Quarter", "fixed": true}, {"key": "focus", "label": "Block focus"},
                  {"key": "testing", "label": "Testing / benchmark week"}, {"key": "theme", "label": "Member challenge or theme"}],
      "rows": [{"label": "Q1"}, {"label": "Q2"}, {"label": "Q3"}, {"label": "Q4"}]},
     {"key": "timetable", "title": "Timetable changes",
      "columns": [{"key": "change", "label": "Change"}, {"key": "why", "label": "Why"}, {"key": "start", "label": "Start", "type": "date"}],
      "add_rows": true}],
   "lists": [{"key": "decisions", "title": "Decisions"}, {"key": "notes", "title": "Notes"}],
   "todos": {"label": "Add task"}}', 7),

('planning', 'priorities', '2027 priorities', 'planning_block',
 'Pick no more than five from the pillar decisions. If everything is a priority, nothing is.', 15,
 '{"tables": [{"key": "priorities", "title": "Priorities",
     "columns": [{"key": "n", "label": "#", "fixed": true}, {"key": "priority", "label": "Priority"},
                 {"key": "pillar", "label": "Pillar", "type": "select", "options": ["Growth", "Team & workflows", "Events", "Group programming"]},
                 {"key": "owner", "label": "Owner", "type": "person"}, {"key": "done", "label": "Measure of done"}, {"key": "due", "label": "Due", "type": "date"}],
     "rows": [{"label": "1"}, {"label": "2"}, {"label": "3"}, {"label": "4"}, {"label": "5"}]}]}', 8),

('planning', 'q1_rocks', 'Q1 rocks', 'planning_block',
 'Done by 31 Mar 2027. These are real rocks — they show in the Rocks tab and Rock Review straight away.', null,
 '{"rocks": {"due": "2027-03-31"}}', 9),

('planning', 'targets', '2027 scorecard targets', 'planning_block',
 'Targets are reviewed with the founders before each month; misses go to IDS at the weekly meeting.', null,
 '{"tables": [{"key": "targets", "title": "Targets",
     "columns": [{"key": "measure", "label": "Measure", "fixed": true}, {"key": "owner", "label": "Owner", "type": "person"},
                 {"key": "q1", "label": "Q1"}, {"key": "q2", "label": "Q2"}, {"key": "q3", "label": "Q3"}, {"key": "q4", "label": "Q4"}],
     "rows": [{"label": "Rollover % (target 80%)", "values": {"owner": "GM"}},
              {"label": "Monthly churn", "values": {"owner": "GM"}},
              {"label": "Attendance / utilisation", "values": {"owner": "GM"}},
              {"label": "7+ days since last attendance (count)", "values": {"owner": "Lead Coaches"}},
              {"label": "Referrals", "values": {"owner": "Team"}},
              {"label": "Net growth (phase two)", "values": {"owner": "Founders → GM"}}],
     "add_rows": true}]}', 10);

insert into meeting_sections (meeting_type, key, title, kind, hint, board, sort_order) values
('planning', 'parking', 'Parking lot', 'ids',
 'Anything we can''t settle today. These go on the Leadership IDS board, so they come up at the next huddle.', 'leadership', 11);

insert into meeting_sections (meeting_type, key, title, kind, hint, config, sort_order) values
('planning', 'next_steps', 'Next steps', 'planning_block',
 'Before anyone leaves: who does what, by when.',
 '{"todos": {"label": "Add next step", "suggestions": [
     "Scribe tidies the plan and shares it within 48 hours",
     "Owners add their rocks to the Gym Calendar and weekly scorecard",
     "GM books the Q1 review / quarterly offsite",
     "Founders share the plan summary with the full team, including casuals"]}}', 12);
