-- ============================================================================
-- Extends ler_monthly (still unpopulated — created 2026-09-20, no snapshot
-- job existed yet) with the volume columns the new Team tab needs alongside
-- the dollar figures it already had: session/class counts, not just revenue.
-- Still one row per staff x calendar month — this is genuinely the same
-- grain as PT/Group "coach performance", not a separate concept, so it's
-- extended in place rather than splitting into parallel tables.
--
-- Populated going forward by scheduled-coach-snapshot.js (new), which
-- re-upserts the CURRENT month's row every day it runs — a month's row
-- naturally stops changing (is "sealed") the moment the calendar rolls over
-- and the job starts upserting the new month instead, no explicit
-- month-end logic needed. Same unrecoverable-history caveat as before:
-- PT/Group revenue and Xero payroll are both only ever visible live for a
-- ~2-month window, so months before this job starts running can't be
-- backfilled.
-- ============================================================================

alter table ler_monthly
  add column pt_sessions   integer not null default 0,
  add column group_classes integer not null default 0;
