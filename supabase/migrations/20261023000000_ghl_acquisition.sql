-- ============================================================================
-- Acquisition tab: GoHighLevel (GHL) mirror (2026-10-23).
--
-- Same shape as the Mindbody mirror: scheduled-ghl-sync.js is the only
-- reader of GHL's API for list data and copies it here; the dashboard reads
-- these tables. Writes to GHL (notes, new contacts/opportunities) go through
-- ghl-lead.js, which also writes the result back into these tables so the
-- board updates without waiting for the next sync.
--
-- Staff can read; only the service role writes.
-- ============================================================================

create table public.ghl_pipelines (
  id         text primary key,
  name       text not null,
  location_id text,                       -- for "Open in GHL" links
  stages     jsonb not null default '[]',  -- [{id, name, position}]
  synced_at  timestamptz not null default now()
);

create table public.ghl_opportunities (
  id                    text primary key,
  pipeline_id           text not null,
  stage_id              text,
  status                text,              -- open | won | lost | abandoned
  name                  text,
  contact_id            text,
  source                text,
  monetary_value        numeric,
  assigned_to           text,
  created_at            timestamptz,
  updated_at            timestamptz,
  last_stage_change_at  timestamptz,
  raw                   jsonb not null,
  synced_at             timestamptz not null default now()
);
create index ghl_opportunities_pipeline_created on public.ghl_opportunities (pipeline_id, created_at desc);
create index ghl_opportunities_contact on public.ghl_opportunities (contact_id);

create table public.ghl_contacts (
  id                 text primary key,
  name               text,
  email              text,
  phone              text,
  source             text,
  tags               text[] not null default '{}',
  attribution        jsonb,               -- attributionSource (first touch)
  last_attribution   jsonb,               -- lastAttributionSource
  date_added         timestamptz,
  raw                jsonb not null,
  synced_at          timestamptz not null default now()
);

-- One row per new Mindbody account checked against GHL (by email, then
-- phone). ghl_contact_id null = no GHL contact found = goes in the
-- "New Mindbody accounts not in GHL" queue until someone adds or dismisses it.
create table public.ghl_mb_matches (
  mb_client_id    text primary key,
  ghl_contact_id  text,
  matched_by      text,                   -- email | phone | added
  checked_at      timestamptz not null default now()
);

-- Leads the dashboard itself put into GHL (Mindbody sign-ups, referrals) and
-- Mindbody accounts someone chose to skip. `kind` is what makes those
-- leads countable as organic/referral regardless of what GHL's source says.
create table public.ghl_lead_links (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null check (kind in ('mindbody', 'referral', 'dismissed')),
  mb_client_id        text,
  ghl_contact_id      text,
  ghl_opportunity_id  text,
  referred_by         text,
  created_by          uuid references public.staff(id),
  created_at          timestamptz not null default now()
);
create unique index ghl_lead_links_mb_client on public.ghl_lead_links (mb_client_id) where mb_client_id is not null;

create table public.ghl_sync_log (
  id           bigint generated always as identity primary key,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  ok           boolean,
  api_calls    int,
  detail       jsonb
);

alter table public.ghl_pipelines     enable row level security;
alter table public.ghl_opportunities enable row level security;
alter table public.ghl_contacts      enable row level security;
alter table public.ghl_mb_matches    enable row level security;
alter table public.ghl_lead_links    enable row level security;
alter table public.ghl_sync_log      enable row level security;

create policy "staff read" on public.ghl_pipelines     for select using (current_staff_id() is not null);
create policy "staff read" on public.ghl_opportunities for select using (current_staff_id() is not null);
create policy "staff read" on public.ghl_contacts      for select using (current_staff_id() is not null);
create policy "staff read" on public.ghl_lead_links    for select using (current_staff_id() is not null);
create policy "staff read" on public.ghl_sync_log      for select using (current_staff_id() is not null);
-- ghl_mb_matches: no policies — only ghl-lead.js (service role) reads it.

-- ── Schedule: every 15 min, ~6am–10pm Sydney. Reuses the mirror's secret.
create or replace function public.ghl_sync_call()
returns bigint
language sql
security definer
set search_path = public
as $$
  select net.http_get(
    url := 'https://newstrength-ops-dashboard.netlify.app/api/scheduled-ghl-sync',
    headers := jsonb_build_object(
      'x-sync-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'mb_sync_secret')
    ),
    timeout_milliseconds := 25000
  );
$$;
revoke all on function public.ghl_sync_call() from public, anon, authenticated;

select cron.schedule('newstrength-ghl-sync', '*/15 19-23,0-12 * * *', $$select public.ghl_sync_call();$$);
