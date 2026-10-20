-- ============================================================================
-- Weekly digest schedule — applied live 2026-10-20 via execute_sql.
--
-- Sunday 07:00 and 08:00 UTC = 6pm Sydney in daylight time (AEDT) and
-- standard time (AEST) respectively; weekly-digest.js only sends during the
-- 6pm Sydney hour, so exactly one of the two runs sends.
--
-- The real call carries ?key=<DIGEST_CRON_SECRET> (the Netlify env var). The
-- secret is deliberately NOT in this file — to recreate the job, substitute
-- it for <DIGEST_CRON_SECRET> below.
-- ============================================================================

select cron.schedule(
  'newstrength-weekly-digest',
  '0 7,8 * * 0',
  $$select net.http_get(url := 'https://newstrength-ops-dashboard.netlify.app/api/weekly-digest?key=<DIGEST_CRON_SECRET>', timeout_milliseconds := 25000);$$
);
