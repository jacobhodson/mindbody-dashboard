-- ============================================================================
-- Xero integration: OAuth connection storage, staff->Xero employee mapping,
-- manager-only wage overrides, and the accumulating monthly LER history
-- table. See newstrength-ops-dashboard-project memory for the full design
-- rationale (2026-09-19/20).
-- ============================================================================

-- Xero OAuth connection (one row, this account only connects to one Xero
-- org). Deliberately NO RLS policies at all beyond enabling RLS itself —
-- that locks out anon/authenticated entirely; only the service role key
-- (used server-side in Netlify functions, which bypasses RLS) can ever
-- read or write a refresh token. Nothing about this table should ever be
-- reachable from the browser.
create table xero_connection (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null,
  tenant_name       text,
  access_token      text,
  refresh_token     text not null,
  token_expires_at  timestamptz,
  connected_by      uuid references staff(id) on delete set null,
  connected_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table xero_connection enable row level security;

-- Links a staff row to its Xero Payroll employee record, for wage lookups.
-- Not sensitive on its own (just a linking id), so the existing "staff
-- readable by team" policy covering the whole table is fine here.
alter table staff add column xero_employee_id text;

-- Standing manual "effective wage" override for LER purposes only (never
-- touches real payroll) — e.g. a manager whose Xero wage is a profit-share
-- salary, not face-to-face coaching value. Kept OFF the staff table on
-- purpose (that table is readable by every signed-in staff member —
-- compensation figures don't belong there) as its own manager-only table.
-- Both current managers (Jacob, Nathan) already satisfy is_manager(), so
-- no new self-service mechanism is needed beyond the existing role.
create table staff_wage_overrides (
  staff_id       uuid primary key references staff(id) on delete cascade,
  effective_wage numeric not null,
  note           text,
  updated_by     uuid references staff(id) on delete set null,
  updated_at     timestamptz not null default now()
);
alter table staff_wage_overrides enable row level security;
create policy "wage overrides manager only" on staff_wage_overrides
  for all using (is_manager()) with check (is_manager());

-- One row per staff member per calendar month — the accumulating history
-- "this month/last month/rolling 3-6-12mo average" reads from. Populated
-- by a scheduled snapshot job (not built yet — needs a live Xero
-- connection first) combining mb-pt-analytics.js/mb-group-performance.js's
-- revenue with Xero payroll wages. History before this table starts
-- populating isn't recoverable — mb-pt-analytics.js/mb-group-performance.js
-- only ever look at a live ~2-month rolling window, nothing further back
-- is preserved anywhere today.
create table ler_monthly (
  id             uuid primary key default gen_random_uuid(),
  staff_id       uuid references staff(id) on delete cascade,
  month          date not null,  -- always the 1st of the month
  pt_revenue     numeric not null default 0,
  group_revenue  numeric not null default 0,
  wages          numeric,
  wages_source   text check (wages_source in ('xero', 'override')),
  ler            numeric,        -- (pt_revenue+group_revenue)/wages, null if wages null/0
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (staff_id, month)
);
alter table ler_monthly enable row level security;
-- Compensation-adjacent (wages), so manager-only — matches
-- GroupPerformanceTable.jsx's precedent of gating $-per-coach views.
create policy "ler monthly readable by managers" on ler_monthly
  for select using (is_manager());
