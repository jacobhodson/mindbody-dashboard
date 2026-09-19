-- ============================================================================
-- Drives scheduled-coach-snapshot.js from the same pg_cron + pg_net
-- mechanism as 20260921000000_scheduled_job_cron.sql (Netlify's own
-- Scheduled Functions never actually fired, confirmed live — see that
-- migration's comment for the full story).
--
-- 4pm UTC = 2am Sydney (AEST) — an hour after newstrength-client-sync
-- (3pm UTC), same stagger reasoning: this job also touches Xero (payroll),
-- and Xero's refresh_token is single-use, so overlapping runs that both
-- try to refresh it risk invalidating each other's token mid-request.
-- ============================================================================

select cron.schedule(
  'newstrength-coach-snapshot',
  '0 16 * * *',
  $$select net.http_get(url := 'https://newstrength-ops-dashboard.netlify.app/api/scheduled-coach-snapshot', timeout_milliseconds := 25000);$$
);
