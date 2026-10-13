-- ============================================================================
-- Client mix: how many clients are on Group / PT / Online memberships right
-- now, the onboarding pipeline, and what % of active clients are on Red's
-- List — shown live on the Operations tab and snapshotted weekly as a lead
-- metric (Scorecard → Lead Metrics).
--
-- "Active client" = at least one contract that's in date, not terminated
-- and not suspended (AutopayStatus 'Active'). So someone with a suspended
-- old package but a live new one counts; someone whose only contract is
-- suspended doesn't. Matches Mindbody's own Active count (219 on
-- 2026-10-13), with 23 suspended-only clients excluded.
-- ============================================================================

-- Active contracts, one row per (client, contract), read from the Mindbody
-- mirror (mb_client_contracts, refreshed nightly by scheduled-mb-mirror.js —
-- Active/Suspended clients only). mb_* tables are service-role only, so this
-- is the one window staff get onto them: client id + contract name, no
-- contract text or payment detail. Categorising Group/PT/Online happens in
-- src/utils/clientMix.js so the browser and the snapshot job share it.
create or replace function public.active_member_contracts()
returns table (client_id text, contract_name text)
language sql
stable
security definer
set search_path = public
as $$
  select m.client_id, c->>'ContractName'
  from mb_client_contracts m, jsonb_array_elements(m.contracts) c
  where (current_staff_id() is not null or auth.role() = 'service_role')
    and c->>'AutopayStatus' = 'Active'
    and (c->>'StartDate')::date <= current_date
    and (c->>'EndDate')::date   >= current_date
    and ((c->>'TerminationDate') is null or (c->>'TerminationDate')::date > current_date);
$$;

revoke all on function public.active_member_contracts() from public, anon;
grant execute on function public.active_member_contracts() to authenticated, service_role;

-- One row per Mon–Sun week. scheduled-client-mix-snapshot.js re-upserts the
-- week containing yesterday (Sydney) every night, so a week's row ends up
-- holding its Sunday-night figures once Monday's run moves on — same
-- "keep refreshing until the period rolls over" pattern as ler_monthly.
create table public.weekly_client_snapshots (
  week_start       date primary key,
  group_clients    integer not null,
  pt_clients       integer not null,
  online_clients   integer not null,
  other_clients    integer not null,
  active_clients   integer not null,
  pipeline_clients integer not null,
  red_clients      integer not null,
  red_pct          numeric,
  captured_on      date not null,
  updated_at       timestamptz not null default now()
);

alter table public.weekly_client_snapshots enable row level security;

create policy "staff read weekly client snapshots"
  on public.weekly_client_snapshots for select
  to authenticated
  using (current_staff_id() is not null);

-- 15:35 UTC = 2:35am Sydney (AEDT) — after the mirror's nightly contracts
-- pass (14:20/14:30) and client sync (15:00), before the coach snapshot (16:00).
select cron.schedule(
  'newstrength-client-mix-snapshot',
  '35 15 * * *',
  $$select net.http_get(url := 'https://newstrength-ops-dashboard.netlify.app/api/scheduled-client-mix-snapshot', timeout_milliseconds := 25000);$$
);
