-- ============================================================================
-- Red's List daily history: which client ids were on Red's List each night.
--
-- Written by scheduled-client-mix-snapshot.js (nightly, 2:35am Sydney): the
-- default 7-day `reds` from mb-client-analytics minus onboarding clients —
-- i.e. exactly the list Red's List shows on load that day (snapshot_date =
-- the Sydney date of the run). Read by mb-client-analytics (service role)
-- for the Fringe Clients "Back from Red" flag, which until this table has
-- 30 days of history falls back to inferring it from weekly attendance.
--
-- Service role writes only; staff can read.
-- ============================================================================

create table public.reds_daily (
  snapshot_date date    not null,
  client_id     text    not null,
  long_lapsed   boolean not null default false,
  primary key (snapshot_date, client_id)
);

create index reds_daily_client_idx on public.reds_daily (client_id, snapshot_date);

alter table public.reds_daily enable row level security;

create policy "staff read reds daily"
  on public.reds_daily for select
  to authenticated
  using (is_manager() or current_staff_id() is not null);
