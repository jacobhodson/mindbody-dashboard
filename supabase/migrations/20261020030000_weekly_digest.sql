-- ============================================================================
-- Weekly email digest (netlify/functions/weekly-digest.js), Sunday 6pm
-- Sydney time, via Resend.
--   digest_preferences — per-person on/off (no row = on). Each person sets
--                        their own; managers can read everyone's.
--   digest_sends       — one row per person per week actually sent; the
--                        unique key makes a retried cron run a no-op.
-- pg_cron only knows UTC, and Sydney flips between UTC+10 and UTC+11, so the
-- job fires at both 07:00 and 08:00 UTC on Sundays and the function only
-- sends when it's the 6pm hour in Sydney.
-- ============================================================================

create table digest_preferences (
  staff_id      uuid primary key references staff(id) on delete cascade,
  weekly_digest boolean not null default true,
  updated_at    timestamptz not null default now()
);
alter table digest_preferences enable row level security;
create policy "own or manager reads digest prefs" on digest_preferences
  for select using (is_manager() or staff_id = current_staff_id());
create policy "own digest prefs insert" on digest_preferences
  for insert with check (staff_id = current_staff_id());
create policy "own digest prefs update" on digest_preferences
  for update using (staff_id = current_staff_id()) with check (staff_id = current_staff_id());

-- The shared admin login isn't a person — off by default.
insert into digest_preferences (staff_id, weekly_digest)
  select id, false from staff where lower(email) = 'admin@newstrength.com.au'
  on conflict do nothing;

create table digest_sends (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references staff(id) on delete cascade,
  week_start date not null,           -- Monday of the week the digest looks ahead to
  email      text not null,
  resend_id  text,
  sent_at    timestamptz not null default now(),
  constraint digest_sends_once unique (staff_id, week_start)
);
alter table digest_sends enable row level security;
create policy "managers read digest sends" on digest_sends
  for select using (is_manager());
-- No write policies: only the service role (weekly-digest.js) writes.
