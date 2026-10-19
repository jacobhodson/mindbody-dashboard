-- Team Meeting "Client Reach-outs" becomes the live Group Training Red's
-- List (contactable in place) instead of free-text entries. New section
-- kind 'reds' — see meetingAgendas.js / MeetingsTab.jsx's RedsSection.
-- Existing reach_outs meeting_items are kept and shown read-only.

alter table meeting_sections drop constraint meeting_sections_kind_check;
alter table meeting_sections add constraint meeting_sections_kind_check check (kind in
  ('items','cascade_in','cascade_out','scorecard','rocks','ids','last_todos','todos','rating','reds'));

update meeting_sections set kind = 'reds'
where meeting_type = 'team' and key = 'reach_outs' and kind = 'items';
