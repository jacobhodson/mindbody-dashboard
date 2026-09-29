-- ============================================================================
-- Raw Mindbody mirror (2026-09-30).
--
-- Mindbody bills per API call, and every dashboard page load / tab switch
-- used to hit it live (hundreds of calls each — /class/classvisits per
-- class, /client/clientcontracts per client, ...). Now ONLY
-- scheduled-mb-mirror.js talks to Mindbody: it copies the raw API objects
-- into these tables on a schedule, and every mb-* endpoint reads them back
-- through utils/mb-mirror.js's mirrorGet(), a drop-in for mbGet() that
-- answers the same paths/params from here instead.
--
-- `raw` is the untouched Mindbody JSON object so the existing endpoint
-- logic keeps working unchanged. `local_ts` columns hold Mindbody's own
-- site-local wall-clock time (its datetimes carry no offset), so date-range
-- filters compare like-for-like with the "yyyy-MM-ddTHH:mm:ss" strings the
-- endpoints already pass as params.
--
-- No RLS policies on purpose: service role (Netlify functions) only — same
-- lockdown as xero_connection.
-- ============================================================================

create table if not exists public.mb_sales (
  id         text primary key,
  local_ts   timestamp not null,
  raw        jsonb not null,
  synced_at  timestamptz not null default now()
);
create index if not exists mb_sales_local_ts_idx on public.mb_sales (local_ts);

create table if not exists public.mb_classes (
  id                text primary key,
  local_ts          timestamp not null,
  raw               jsonb not null,
  visits            jsonb,          -- raw /class/classvisits Visits[]; null = not fetched yet
  visits_synced_at  timestamptz,
  visits_final      boolean not null default false, -- fetched after the class ended; no more intraday refetches
  synced_at         timestamptz not null default now()
);
create index if not exists mb_classes_local_ts_idx on public.mb_classes (local_ts);

create table if not exists public.mb_appointments (
  id         text primary key,
  local_ts   timestamp not null,
  raw        jsonb not null,
  synced_at  timestamptz not null default now()
);
create index if not exists mb_appointments_local_ts_idx on public.mb_appointments (local_ts);

create table if not exists public.mb_transactions (
  id         text primary key,
  local_ts   timestamp not null,
  raw        jsonb not null,
  synced_at  timestamptz not null default now()
);
create index if not exists mb_transactions_local_ts_idx on public.mb_transactions (local_ts);

create table if not exists public.mb_clients_raw (
  id         text primary key,      -- Mindbody client Id
  raw        jsonb not null,
  synced_at  timestamptz not null default now()
);

-- Per-client lists (one Mindbody call per client to refresh) — synced
-- oldest-first under a time budget so a run never overshoots Netlify's 26s.
create table if not exists public.mb_client_contracts (
  client_id  text primary key,
  contracts  jsonb not null,
  synced_at  timestamptz not null default now()
);

create table if not exists public.mb_client_services (
  client_id  text primary key,
  services   jsonb not null,        -- ActiveOnly=true list
  synced_at  timestamptz not null default now()
);

-- Small reference lists (e.g. 'sessiontypes').
create table if not exists public.mb_reference (
  key        text primary key,
  raw        jsonb not null,
  synced_at  timestamptz not null default now()
);

-- One row per sync run, so API usage is visible without waiting for a bill.
create table if not exists public.mb_sync_log (
  id          bigserial primary key,
  mode        text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  api_calls   int,
  ok          boolean,
  detail      jsonb
);
create index if not exists mb_sync_log_started_idx on public.mb_sync_log (started_at desc);

alter table public.mb_sales            enable row level security;
alter table public.mb_classes          enable row level security;
alter table public.mb_appointments     enable row level security;
alter table public.mb_transactions     enable row level security;
alter table public.mb_clients_raw      enable row level security;
alter table public.mb_client_contracts enable row level security;
alter table public.mb_client_services  enable row level security;
alter table public.mb_reference        enable row level security;
alter table public.mb_sync_log         enable row level security;
