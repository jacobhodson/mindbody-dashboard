-- ============================================================================
-- Onboarding rollover decisions, moved off Notion (NOTION_ROLLOVER_DB /
-- mb-onboarding-rollover.js) onto Supabase — same pattern as contact_log and
-- payment_resolutions. Also the reason for this round: a decision now
-- carries which product/pathway the client was on AT DECISION TIME
-- (short_product/is_straight_in), because mb-onboarding.js's live pipeline
-- only shows clients within their rolling 27-day window — once a client
-- ages out, they vanish from that view, so a rollover-rate computed by
-- joining decisions against "the current pipeline" would silently lose the
-- straight-in exclusion (and everything else about their product) the
-- moment their window closes. Recording it on the decision itself makes
-- historical reporting correct regardless of pipeline churn.
--
-- "Straight-in membership" is the new third onboarding pathway (alongside
-- the 5 existing trial products): a client who joined straight onto a full
-- membership, still runs through the same 4-week onboarding board/tasks,
-- but never has a rollover decision to make (they didn't start on a
-- time-limited trial) — is_straight_in = true clients are recorded here
-- only if a 'removed' override is needed, never with a rollover decision,
-- and any rollover-rate query must exclude is_straight_in = true rows
-- entirely (neither counted as rolling over nor not).
-- ============================================================================

create table onboarding_rollover_decisions (
  id                 uuid primary key default gen_random_uuid(),
  mindbody_client_id text not null unique,
  client_id          uuid references clients(id) on delete set null,
  decision           text not null check (decision in ('rollover', 'no-rollover', 'removed')),
  short_product      text,       -- '3-Session' | '14-Day' | '4-Week' | 'Strong Dad' | 'Strong Mum' | 'Straight-In' | null (unknown/pre-migration)
  is_straight_in     boolean not null default false,
  product            text,       -- full Mindbody product name, for display/debugging
  decided_by         uuid references staff(id) on delete set null,
  decided_at         timestamptz not null default now(),
  created_at         timestamptz not null default now()
);

create index onboarding_rollover_decisions_decided_at_idx on onboarding_rollover_decisions (decided_at);

alter table onboarding_rollover_decisions enable row level security;

-- Same openness as contact_log/payment_resolutions/metric_actuals — the
-- Onboarding board already lets any signed-in staff make this call today
-- (OnboardingTab.jsx passes no isManager gate around it), so RLS matches
-- existing behaviour rather than introducing a new restriction.
create policy "rollover decisions readable by team" on onboarding_rollover_decisions
  for select using (auth.uid() is not null);
create policy "any staff can log a rollover decision" on onboarding_rollover_decisions
  for insert with check (auth.uid() is not null);
create policy "any staff can update a rollover decision" on onboarding_rollover_decisions
  for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "any staff can delete a rollover decision" on onboarding_rollover_decisions
  for delete using (auth.uid() is not null);
