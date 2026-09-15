-- ============================================================================
-- Drives scheduled-daily-refresh.js and scheduled-client-sync.js from
-- Supabase instead of Netlify's own Scheduled Functions feature.
--
-- Confirmed live (2026-09-21): registering a `schedule` in netlify.toml
-- does get Netlify's own API (searchSiteFunctions) to report a real
-- schedule, and blocks direct HTTP invocation with 403 as a genuine
-- scheduled function would — but neither function auto-fired even once in
-- the 5 days since registering it (clients.synced_at / metric_actuals'
-- synced_at were both stuck exactly where a manual test-curl left them).
-- Whatever the root cause, this is a proven-reliable alternative: pg_cron
-- fires on schedule inside Postgres itself, pg_net makes the actual HTTP
-- call out to the (now plain, non-"scheduled") Netlify function endpoint.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2pm UTC = midnight Sydney standard time (AEST) — matches
-- scheduled-daily-refresh.js's own original comment/intent.
select cron.schedule(
  'newstrength-daily-refresh',
  '0 14 * * *',
  $$select net.http_get(url := 'https://newstrength-ops-dashboard.netlify.app/api/scheduled-daily-refresh', timeout_milliseconds := 25000);$$
);

-- 3pm UTC = 1am Sydney — an hour after the daily refresh, same stagger
-- scheduled-client-sync.js's own comment already called for.
select cron.schedule(
  'newstrength-client-sync',
  '0 15 * * *',
  $$select net.http_get(url := 'https://newstrength-ops-dashboard.netlify.app/api/scheduled-client-sync', timeout_milliseconds := 25000);$$
);
