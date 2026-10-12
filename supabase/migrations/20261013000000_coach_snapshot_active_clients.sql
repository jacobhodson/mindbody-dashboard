-- ============================================================================
-- Client caseload in the coach snapshots: how many active clients each coach
-- has assigned on the Clients tab (clients.assigned_staff_id), captured
-- alongside revenue/wages so the Team tab can show caseload month by month.
--
-- "Active" = effective status (status_override, else the Mindbody status)
-- is Active or Trial — i.e. anyone not Inactive, the same total as the Team
-- tab's live Client Caseload view.
--
-- Written by scheduled-coach-snapshot.js's nightly run only: the current
-- month's ler_monthly row and today's coach_rolling30 row get the caseload
-- as of that night, so a month's figure is its last day's caseload once the
-- month rolls over. Nullable, not default 0 — there's no assignment history
-- to reconstruct earlier months from, so those stay null ("–", not zero),
-- and the ?months= backfill never touches this column.
-- ============================================================================

alter table ler_monthly     add column active_clients integer;
alter table coach_rolling30 add column active_clients integer;
