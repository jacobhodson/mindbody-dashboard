-- ============================================================================
-- Schedules for scheduled-mb-mirror.js, the only Mindbody caller (2026-09-30).
--
-- The endpoint requires an `x-sync-secret` header matching Netlify's
-- MB_SYNC_SECRET env var. The same value lives in Supabase Vault as
-- 'mb_sync_secret' (created by hand with vault.create_secret, not in this
-- file, so it never lands in git).
--
-- All times UTC. Sydney is UTC+10 (AEST) / UTC+11 (AEDT).
--   :05 hourly 19:00–12:00  frequent  (~5/6am – 10/11pm Sydney)
--   14:10                   nightly   (just after Sydney midnight)
--   14:20, 14:30            contracts (budgeted; two passes cover ~250 clients)
--   14:40                   services
--   14:50                   scheduled-daily-refresh (was 14:00 — must read the
--                           mirror AFTER the nightly pass)
--   15:00 / 16:00           client-sync / coach-snapshot, unchanged
-- ============================================================================

create or replace function public.mb_mirror_call(p_mode text)
returns bigint
language sql
security definer
set search_path = public
as $$
  select net.http_get(
    url := 'https://newstrength-ops-dashboard.netlify.app/api/scheduled-mb-mirror?mode=' || p_mode,
    headers := jsonb_build_object(
      'x-sync-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'mb_sync_secret')
    ),
    timeout_milliseconds := 25000
  );
$$;
revoke all on function public.mb_mirror_call(text) from public, anon, authenticated;

select cron.schedule('newstrength-mb-mirror-frequent',  '5 19-23,0-12 * * *', $$select public.mb_mirror_call('frequent');$$);
select cron.schedule('newstrength-mb-mirror-nightly',   '10 14 * * *',        $$select public.mb_mirror_call('nightly');$$);
select cron.schedule('newstrength-mb-mirror-contracts', '20,30 14 * * *',     $$select public.mb_mirror_call('contracts');$$);
select cron.schedule('newstrength-mb-mirror-services',  '40 14 * * *',        $$select public.mb_mirror_call('services');$$);

-- Re-register with the new time (cron.schedule on an existing name updates it).
select cron.schedule(
  'newstrength-daily-refresh',
  '50 14 * * *',
  $$select net.http_get(url := 'https://newstrength-ops-dashboard.netlify.app/api/scheduled-daily-refresh', timeout_milliseconds := 25000);$$
);
