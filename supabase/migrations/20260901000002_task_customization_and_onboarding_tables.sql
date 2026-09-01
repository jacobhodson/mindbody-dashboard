-- ============================================================================
-- Phase 1 extension: staff-created/typed tasks, a dedicated task-contact-log,
-- and moving onboarding's task list + per-client completions into Supabase.
--
-- Leaves task_completions RLS untouched (orthogonal to template ownership),
-- and leaves the existing Notion-backed contact log (useContactLog.js /
-- mb-contact-client.js, used by Red's List / Fringe) completely untouched —
-- task_contact_log below is a separate, purpose-built table for the new
-- "log a client contact" task type only.
-- ============================================================================

-- ── A1: task_templates — staff-created + typed tasks ───────────────────────
-- Two independent concepts: `scope` (existing) = who a completion is
-- assigned to; `owner_staff_id` (new) = who owns/can edit the template
-- itself. null = shared team template (manager-only writes, visible to
-- all). Non-null = a personal template, editable by its creator, visible
-- only to its creator + managers.

alter table task_templates
  add column task_type      text not null default 'checkbox' check (task_type in ('checkbox','contact_log')),
  add column owner_staff_id uuid references staff(id) on delete cascade;

drop policy "templates readable by team" on task_templates;
create policy "templates readable by owner or team" on task_templates
  for select using (owner_staff_id is null or owner_staff_id = current_staff_id() or is_manager());

drop policy "managers manage templates" on task_templates;
drop policy "managers update templates" on task_templates;
drop policy "managers delete templates" on task_templates;

create policy "create shared or own personal templates" on task_templates
  for insert with check (
    (owner_staff_id is null and is_manager()) or (owner_staff_id = current_staff_id())
  );
create policy "update own personal or managers update shared" on task_templates
  for update using (is_manager() or owner_staff_id = current_staff_id())
  with check ((owner_staff_id is null and is_manager()) or (owner_staff_id = current_staff_id()));
create policy "delete own personal or managers delete shared" on task_templates
  for delete using (is_manager() or owner_staff_id = current_staff_id());

-- ── A2: task_contact_log — logging for task_type='contact_log' tasks ───────

create table task_contact_log (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references staff(id) on delete cascade,
  completion_id uuid references task_completions(id) on delete set null,
  client_name   text not null,
  note          text,
  contacted_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
alter table task_contact_log enable row level security;

create policy "task contact log readable by team" on task_contact_log
  for select using (auth.uid() is not null);
create policy "log own contact entries" on task_contact_log
  for insert with check (staff_id = current_staff_id());
create policy "update own contact entries" on task_contact_log
  for update using (staff_id = current_staff_id() or is_manager())
  with check (staff_id = current_staff_id() or is_manager());
create policy "delete own contact entries" on task_contact_log
  for delete using (staff_id = current_staff_id() or is_manager());

-- ── A3: onboarding tables ───────────────────────────────────────────────────
-- Mirrors the task_templates/task_completions pattern: read-all, manager-
-- write templates; any staff can log a completion (with real attribution +
-- timestamp, unlike the single overwritable Netlify Blobs key it replaces).

create table onboarding_task_templates (
  id           uuid primary key default gen_random_uuid(),
  key          text unique not null,          -- matches the old ONBOARDING_TASKS ids
  week         int not null check (week between 1 and 4),
  label        text not null,
  description  text,
  script       text,                          -- may contain literal {{BUSINESS_NAME}} and [Name] tokens
  sort_order   int not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table onboarding_task_completions (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references onboarding_task_templates(id) on delete cascade,
  client_id    text not null,                 -- Mindbody client id, stored as text
  completed_by uuid not null references staff(id),
  completed_at timestamptz not null default now(),
  unique (template_id, client_id)
);

alter table onboarding_task_templates   enable row level security;
alter table onboarding_task_completions enable row level security;

create policy "onboarding templates readable by team" on onboarding_task_templates
  for select using (auth.uid() is not null);
create policy "managers manage onboarding templates" on onboarding_task_templates
  for all using (is_manager()) with check (is_manager());

create policy "onboarding completions readable by team" on onboarding_task_completions
  for select using (auth.uid() is not null);
create policy "any staff logs onboarding completion" on onboarding_task_completions
  for insert with check (completed_by = current_staff_id());
create policy "any staff deletes own onboarding completion, managers any" on onboarding_task_completions
  for delete using (completed_by = current_staff_id() or is_manager());

-- ── A4: seed the 18 existing onboarding tasks ───────────────────────────────
-- Content copied verbatim from src/utils/onboardingTasks.js, with every
-- interpolated ${BUSINESS_NAME} replaced by the literal token
-- {{BUSINESS_NAME}} (substituted client-side at render time now that this
-- text lives in the DB, not a JS template literal). [Name] is left exactly
-- as-is — it's already a manual per-client placeholder staff replace by hand.

insert into onboarding_task_templates (key, week, label, description, script, sort_order) values
  ('w1-pre-session', 1, 'Pre-session text', 'Send a warm welcome text before their very first session. Set expectations, build excitement, and let them know you''re personally looking out for them.', 'Hey [Name]! 👋 So stoked to welcome you to {{BUSINESS_NAME}}. Just wanted to reach out before your first session — wear comfy workout clothes, bring a water bottle, and most importantly, just show up and have fun. We''ll take care of everything else. See you soon! 💪', 1),
  ('w1-post-session', 1, 'Post-session follow-up', 'Check in after their first session to gather feedback, reinforce their decision to join, and address any concerns early.', 'Hey [Name]! How did you go in your first session? Hope you''re feeling the good kind of sore 😄 We''d love to know what you thought — what did you enjoy most? Any questions at all, don''t hesitate to ask. Honestly so stoked to have you here!', 2),
  ('w1-meeting-review', 1, 'Weekly meeting / goal review', 'Book and conduct their first weekly check-in to review their goals, clarify expectations, and make sure they feel supported.', 'Hey [Name], would love to jump on a quick 15-min call this week to touch base — review your first week, answer any questions, and make sure we''re setting you up for success. When works best for you this week?', 3),
  ('w1-nurture-checkin', 1, 'Nurture check-in', 'Mid-week personal check-in to show you care, keep them accountable, and address any concerns before they become reasons to stop coming.', 'Hey [Name]! Just checking in mid-week — how are you feeling? Getting your sessions in? 💪 Remember, showing up consistently in Week 1 sets the foundation for everything. Let me know if there''s anything I can do to support you!', 4),
  ('w1-coach-intros', 1, 'Coach introductions', 'Personally introduce the new client to each coach on the team so they feel welcomed by everyone, not just one person.', 'During their next session, introduce them to each coach by name. Something like: "Hey [Name], I want you to meet [Coach Name] — they''re one of our coaches and they''re amazing. Don''t hesitate to grab any of them if you need help or have a question."', 5),
  ('w1-voice-memo', 1, 'End-of-week voice memo', 'Record and send a personal voice message at the end of Week 1. This personal touch goes a long way in making clients feel seen.', 'Record a 30–45 second voice note:
"Hey [Name], it''s [Your Name] from {{BUSINESS_NAME}}! Just wanted to reach out at the end of your first week and say — you actually did it. You showed up. Week 1 is done and I honestly couldn''t be more proud. [Mention something specific — a session they crushed, a moment of effort]. Week 2 is where things start to click, and I''m so excited for you. See you soon!"', 6),
  ('w2-booking-text', 2, 'Booking text', 'Confirm their Week 2 sessions are booked. Early in Week 2 is when motivation can dip — a simple booking nudge keeps them on track.', 'Hey [Name]! Hope you''re recovering well from Week 1 — the soreness means it''s working 😄 Just checking: do you have your sessions booked for this week? If not, jump into the app now and lock them in. Consistency in Week 2 is where the magic starts to happen!', 7),
  ('w2-circle-back', 2, 'Circle back to why', 'Revisit their original reason for joining. Reconnecting them to their "why" is a powerful tool for long-term retention.', 'Hey [Name], I''ve been thinking about our first conversation — you mentioned [their reason for joining]. I just wanted to remind you that every session you''re doing right now is building directly towards that. How are you feeling about your progress so far? What''s feeling good?', 8),
  ('w2-member-intros', 2, 'Member introductions', 'Personally introduce the client to 2–3 established community members who would be a great fit. Community connection is one of the biggest retention drivers.', 'Think about which members would vibe well with this client. Introduce them in person or via a message:
"Hey [Member], meet [Name] — they''re in their second week and absolutely crushing it. I thought you two would get along great!"

Or in session: "[Name], have you met [Member]? They''ve been coming for [X months] — they''d be a great person to train alongside."', 9),
  ('w2-phone-call', 2, 'End-of-week phone call', 'Call the client at the end of Week 2 to celebrate their progress and — critically — book their strategy session for Week 3.', 'Call agenda:
1. Open with a genuine celebration: "Two weeks done — that''s huge!"
2. Ask: "How are you feeling physically? Mentally? What''s changed?"
3. Introduce the strategy session: "In Week 3 we do a deeper 1-on-1 — it''s where we map out your whole plan for life beyond the first month. It''s one of my favourite parts of the process."
4. Book it right now: "I''ve got [time] on [day] — does that work?"', 10),
  ('w3-strategy-nudge', 3, 'Strategy session booking nudge', 'Confirm the strategy session is locked in before Week 3 sessions begin. Don''t let it fall through the cracks.', 'Hey [Name]! Excited for your Week 3 — this is where things really start to click. Just confirming your strategy session is locked in for [date] at [time]. This is the one where we map out your long-term plan — come prepared to talk about your goals! See you then 🗓️', 11),
  ('w3-strategy-session', 3, 'Run strategy session', 'Conduct the full strategy session. This is the most important conversation in the onboarding journey — take your time and be genuinely curious.', 'Strategy Session Agenda:
1. Celebrate their 3-week journey and the specific sessions they''ve completed
2. Review their original goals — "How far have you come? What''s surprised you?"
3. Discuss their experience in detail: wins, challenges, what they enjoy
4. Paint the 90-day picture: "Where could you realistically be in 3 months if you keep this up?"
5. Walk through membership options — which is the right fit for their goals?
6. Address objections warmly and honestly
7. Sign them up, or book a follow-up if they need more time
8. Take a photo together if they''re comfortable', 12),
  ('w3-pipeline-post', 3, 'Post to #pipeline Slack', 'Share a brief update in the internal #pipeline Slack channel so the whole team is across this client''s progress.', 'Post to #pipeline:
📋 [Client Name] — Week 3
💪 [X] sessions completed
📅 Strategy session: [DONE / booked for DATE]
🎯 Goals: [brief summary of their goals]
💡 Notes: [any relevant context — objections, membership interest, personal details]
➡️ Next step: [specific action]', 13),
  ('w3-update-mindbody', 3, 'Update Mindbody profile', 'Update their Mindbody profile with notes from the strategy session. This ensures any coach who works with them has full context.', 'Add to their Mindbody client notes:
- Primary goals and motivation (their "why")
- Membership interest level and any objections raised
- Important personal details: injuries, work schedule, preferences
- Strategy session outcome: signed up / follow-up needed / date
- Ensure email, mobile, and emergency contact are up to date', 14),
  ('w3-send-resources', 3, 'Send resources', 'Share the nutrition guide and any other key resources that support their journey. Timing matters — send right after the strategy session while they''re motivated.', 'Hey [Name]! Loved our strategy session — I''m really excited about where you''re headed 🚀

As promised, here are some resources to support your journey:
📖 Nutrition Guide: [link]
📱 How to book sessions: [link]
🎯 [Any other relevant resource]

Any questions at all, just reply here. Let''s make Week 4 the best one yet!', 15),
  ('w4-selfie-video', 4, 'Selfie video message', 'Record a short, personal selfie video to celebrate Week 4 and their near-completion of the program. This is high-impact, personal, and memorable.', 'Record a 30–60 second selfie video (send via phone):
"Hey [Name]! It''s [Your Name]. I cannot believe we''re already in Week 4 — where has the time gone?! I just wanted to take a moment to tell you how genuinely proud I am of you. You turned up when it was hard. You pushed through [specific moment or win]. The community at {{BUSINESS_NAME}} is honestly lucky to have you, and I''m so excited about what comes next. Let''s make Week 4 the best one yet. I''ll see you in the gym!"', 16),
  ('w4-bingo-card', 4, 'Bingo card presentation', 'Review the {{BUSINESS_NAME}} Bingo Card with the client. Completing all 5 criteria earns them the {{BUSINESS_NAME}} shirt. Review each item, celebrate completed ones, and motivate them to finish the remaining ones.', 'Bingo Card — {{BUSINESS_NAME}} Shirt (all 5 required):
✅ 12 sessions completed in 28 days
✅ Bring a friend to a Saturday session
✅ Read the nutrition guide
✅ Leave a Google review
✅ Book a strategy session

Review each item with the client:
- Celebrate any already completed
- For incomplete items: "This one is totally within reach before the end of Week 4 — here''s how..."
- Build excitement: "The shirt is yours when you hit all 5 — and you''re [X] away!"', 17),
  ('w4-google-review', 4, 'Google review nudge', 'Ask for a Google review at the end of Week 4 when they''re at peak satisfaction. This is also a bingo card item — frame it as a win for them.', 'Hey [Name]! You have absolutely been smashing it these past 4 weeks and we''re so grateful you chose {{BUSINESS_NAME}} 🙏

If you''ve had a great experience, would you mind leaving us a quick Google review? It genuinely means the world to us — it helps other people like you find us and keeps our small community growing.

⭐ Leave a review here: [Google Review Link]

And yes — it also ticks off your Google review bingo card item 😄 No pressure at all, but we''d love to hear your story!', 18)
on conflict (key) do nothing;
