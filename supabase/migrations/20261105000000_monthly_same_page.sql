-- ============================================================================
-- Monthly Same-Page Meeting: a third meeting type, keyed by the first of the
-- month and managers only (every policy on meetings / meeting_sections /
-- meeting_items already reads "team or is_manager()", so a new type is
-- manager-gated with no policy changes).
--
-- meeting_sections.config holds per-kind settings editable in build mode:
--   items        { lists: [{ key, title }] } — split a section into titled
--                sub-lists, stored in meeting_items as '<section key>:<list key>'
--   scorecard_30 { hidden_metrics: [metric_key], rollover_target: 80 }
--
-- New kinds: scorecard_30 (automatic rolling-30-day review) and carry (items
-- to carry over, shown again on the next meeting).
-- rocks.priority is the PRIORITY column from the Same-Page rock review.
-- ============================================================================

alter table meetings drop constraint meetings_meeting_type_check;
alter table meetings add constraint meetings_meeting_type_check
  check (meeting_type in ('team','leadership','monthly'));

alter table meeting_sections drop constraint meeting_sections_meeting_type_check;
alter table meeting_sections add constraint meeting_sections_meeting_type_check
  check (meeting_type in ('team','leadership','monthly'));

alter table meeting_sections drop constraint meeting_sections_kind_check;
alter table meeting_sections add constraint meeting_sections_kind_check check (kind in
  ('items','cascade_in','cascade_out','scorecard','scorecard_30','rocks','ids','last_todos','todos','rating','reds','carry'));

alter table meeting_sections add column config jsonb not null default '{}'::jsonb;

alter table rocks add column priority text check (priority in ('high','medium','low'));

insert into meeting_sections (meeting_type, key, title, kind, hint, config, sort_order) values
  ('monthly', 'scorecard', '30-Day Scorecard Review', 'scorecard_30',
     'Updates automatically. Discuss anything off track.',
     '{"hidden_metrics": [], "rollover_target": 80}', 0),
  ('monthly', 'headlines', 'Operations Headlines', 'items',
     'From the GM.',
     '{"lists": [{"key": "going_well", "title": "What''s going well"},
                 {"key": "not_going_well", "title": "What''s not going well"},
                 {"key": "decisions", "title": "Decisions for the founders"}]}', 1),
  ('monthly', 'rocks', 'Rock Review', 'rocks',
     'Priority, owner, status and notes for each active rock.', '{}', 2),
  ('monthly', 'team_review', 'Team Review', 'items', null,
     '{"lists": [{"key": "capacity", "title": "Capacity"},
                 {"key": "hiring", "title": "Hiring"},
                 {"key": "performance", "title": "Performance"},
                 {"key": "wellbeing", "title": "Wellbeing"},
                 {"key": "upcoming_leave", "title": "Upcoming leave"}]}', 3),
  ('monthly', 'ops_risks', 'Operations & Risks', 'items', null,
     '{"lists": [{"key": "systems", "title": "Systems"},
                 {"key": "compliance", "title": "Compliance"},
                 {"key": "venue", "title": "Venue"},
                 {"key": "equipment", "title": "Equipment"},
                 {"key": "insurance", "title": "Insurance"},
                 {"key": "financials", "title": "Financials"}]}', 4),
  ('monthly', 'next_30', 'Next 30 Days', 'todos',
     'Top 3 priorities and who owns each.', '{}', 5),
  ('monthly', 'carry', 'Carry to Next Month', 'carry',
     'These show again on next month''s meeting.', '{}', 6);
