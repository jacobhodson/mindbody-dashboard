-- ============================================================================
-- Manager-managed membership packages (manual, not Mindbody-synced), plus a
-- "Group Program" caseload option alongside individual staff assignment.
--
-- Packages are deliberately NOT synced from Mindbody's /client/clientcontracts
-- endpoint — that's one Mindbody API call per client, and syncing all ~503
-- clients daily risks repeating the rate-limit incident from the visit-ledger
-- backfill. Package assignment changes rarely, so it's manual/manager-entered.
-- ============================================================================

create table membership_packages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  active     boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table membership_packages enable row level security;

create policy "packages readable by team" on membership_packages
  for select using (auth.uid() is not null);
create policy "managers manage packages" on membership_packages
  for all using (is_manager()) with check (is_manager());

alter table clients add column package_id uuid references membership_packages(id) on delete set null;
-- Alongside assigned_staff_id: a client's caseload is either a specific staff
-- member (assigned_staff_id set, assigned_group false), "Group Program"
-- (assigned_group true, assigned_staff_id null), or unassigned (both null/false).
alter table clients add column assigned_group boolean not null default false;
create index clients_package_id_idx on clients (package_id);
