-- ============================================================================
-- Settings tab: owner (admin) role, staff self-edit lock-down, per-role tab
-- access, and app-wide branding.
--
-- Roles: coach < manager < admin. 'admin' is the owner — the only level that
-- can manage API connections (Settings → Integrations), grant/revoke admin,
-- or edit an admin's row. Managers can add staff, make other managers and
-- edit which tabs each role sees.
-- ============================================================================

create or replace function is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from staff
    where auth_user_id = auth.uid() and role = 'admin' and active
  );
$$;

-- ── staff: guard role/access changes ────────────────────────────────────────
-- RLS alone can't say "you may update your own row, but only your name":
-- the old "staff can update own name" policy let anyone set their own role.
-- This trigger enforces the column-level rules for every signed-in caller.
-- Server-side functions (service role, auth.uid() null) are trusted and skip
-- it — they do their own checks (see staff-admin.js).

create or replace function guard_staff_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  me_admin   boolean := is_admin();
  me_manager boolean := is_manager();
  is_self    boolean := old.auth_user_id = auth.uid();
begin
  if auth.uid() is null then return new; end if;

  -- Login identity is only ever changed server-side.
  if new.auth_user_id is distinct from old.auth_user_id or new.email is distinct from old.email then
    raise exception 'Email and login can only be changed from Settings';
  end if;

  if not me_manager then
    if not is_self then raise exception 'Not allowed'; end if;
    if new.role is distinct from old.role or new.active is distinct from old.active
       or new.is_coach is distinct from old.is_coach
       or new.xero_employee_id is distinct from old.xero_employee_id then
      raise exception 'Only managers can change access, coach status or payroll links';
    end if;
    return new;
  end if;

  -- Managers (non-admin) can't touch the owner level at all.
  if not me_admin and (old.role = 'admin' or new.role = 'admin')
     and (new.role is distinct from old.role or new.active is distinct from old.active or not is_self) then
    raise exception 'Only an admin (owner) can change admin access';
  end if;

  -- No locking yourself out.
  if is_self and (new.role is distinct from old.role or new.active is distinct from old.active) then
    raise exception 'You can''t change your own access level — ask another manager';
  end if;

  -- Always keep at least one active admin.
  if old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active)
     and not exists (select 1 from staff where role = 'admin' and active and id <> old.id) then
    raise exception 'There must always be at least one admin';
  end if;

  return new;
end;
$$;

create trigger staff_guard_update
  before update on staff
  for each row execute function guard_staff_update();

-- Managers inserting staff directly (rather than via staff-admin.js) can't
-- mint admins.
create or replace function guard_staff_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is not null and new.role = 'admin' and not is_admin() then
    raise exception 'Only an admin (owner) can create admins';
  end if;
  return new;
end;
$$;

create trigger staff_guard_insert
  before insert on staff
  for each row execute function guard_staff_insert();

-- Nobody deletes staff from the browser — deactivate instead, so task,
-- contact-log and payroll history stays attached to a real person.
drop policy "managers manage staff" on staff;
create policy "managers insert staff" on staff
  for insert with check (is_manager());
create policy "managers update staff" on staff
  for update using (is_manager()) with check (is_manager());

-- ── role_tab_access ─────────────────────────────────────────────────────────
-- Which sidebar tabs each role sees. No row = the tab's built-in default
-- (Dashboard.jsx TABS: managerOnly tabs hidden from coaches). Admins always
-- see everything and Settings is always visible, so neither is stored here.
-- This is visibility only: sensitive data (wages, LER, Finances) stays
-- manager-gated by RLS regardless of what this table says.

create table role_tab_access (
  role       text not null check (role in ('coach','manager')),
  tab_key    text not null,
  allowed    boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references staff(id) on delete set null,
  primary key (role, tab_key)
);

alter table role_tab_access enable row level security;
create policy "tab access readable by team" on role_tab_access
  for select using (auth.uid() is not null);
create policy "managers manage tab access" on role_tab_access
  for all using (is_manager()) with check (is_manager());

-- ── app_settings ────────────────────────────────────────────────────────────
-- One row of app-wide settings. Branding now; configurable business rules
-- (Fringe/Red's List thresholds, membership keywords…) get columns here
-- later. When the dashboard goes multi-gym this becomes one row per gym.
-- Readable without signing in: the login page shows the logo and names.

create table app_settings (
  id            boolean primary key default true check (id),
  business_name text not null default 'Newstrength',
  system_name   text not null default 'Operations Dashboard',
  logo_url      text,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references staff(id) on delete set null
);
insert into app_settings (id) values (true);

alter table app_settings enable row level security;
create policy "app settings readable by anyone" on app_settings
  for select using (true);
create policy "managers update app settings" on app_settings
  for update using (is_manager()) with check (is_manager());

-- Logo uploads: public bucket, managers write.
insert into storage.buckets (id, name, public) values ('branding', 'branding', true)
  on conflict (id) do nothing;
create policy "managers upload branding" on storage.objects
  for insert with check (bucket_id = 'branding' and is_manager());
create policy "managers delete branding" on storage.objects
  for delete using (bucket_id = 'branding' and is_manager());

-- mb_sync_log has RLS on but no policy; Settings → Integrations (admin only)
-- reads the last sync from it.
create policy "admins read mb sync log" on mb_sync_log
  for select using (is_admin());
