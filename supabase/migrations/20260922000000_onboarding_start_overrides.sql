-- ============================================================================
-- Manual start-date correction for onboarding pipeline clients.
--
-- mb-onboarding.js derives each client's onboarding start date from either
-- their trial-product sale date or (straight-in members) creation_date —
-- neither is always right: a sale can be logged a day or two off, or a
-- client's actual first week gets pushed back (an extension, a late start).
-- This table lets any staff correct that per client, keyed by Mindbody ID
-- since onboarding clients aren't otherwise a persistent row anywhere (same
-- reason onboarding_rollover_decisions is keyed this way).
--
-- Same round: mb-onboarding.js's week math moves from a rolling exact-7-day
-- window (start date's own time-of-day) to real Monday-Sunday calendar
-- weeks, matching every other "this week" convention in the app
-- (mb-revenue.js, coachPerformance). A start_date here doesn't need to be a
-- Monday — the week it falls in is what counts — but the Onboarding board's
-- drag-and-drop always writes the Monday of the target week, since "which
-- week" is the whole point of that gesture.
-- ============================================================================

create table onboarding_start_overrides (
  id                  uuid primary key default gen_random_uuid(),
  mindbody_client_id  text not null unique,
  start_date          date not null,
  set_by              uuid references staff(id) on delete set null,
  updated_at          timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

alter table onboarding_start_overrides enable row level security;

-- Same openness as onboarding_rollover_decisions — the Onboarding board
-- already lets any signed-in staff make pipeline calls today, and these
-- corrections (a coach fixing their own client's start date) are exactly
-- that kind of day-to-day call, not a manager approval.
create policy "start overrides readable by team" on onboarding_start_overrides
  for select using (auth.uid() is not null);
create policy "any staff can set a start override" on onboarding_start_overrides
  for insert with check (auth.uid() is not null);
create policy "any staff can update a start override" on onboarding_start_overrides
  for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "any staff can delete a start override" on onboarding_start_overrides
  for delete using (auth.uid() is not null);
