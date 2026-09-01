-- ============================================================================
-- Newstrength Operations schema — phase 1 (team tasks/targets) + phase 2 stub
-- (historical Mindbody metrics). Run once in the Supabase SQL Editor, or via
-- `supabase db push` once this project is linked.
-- ============================================================================

-- ── staff ───────────────────────────────────────────────────────────────────
-- One row per team member. auth_user_id links to Supabase Auth (auth.users);
-- a new row is created automatically here when someone signs in for the
-- first time (see trigger below), so you never insert into this table by hand
-- except to promote someone to manager/admin.

create table staff (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  full_name    text not null,
  email        text unique not null,
  role         text not null default 'coach' check (role in ('coach','manager','admin')),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ── task_templates ──────────────────────────────────────────────────────────
-- The reusable definitions of recurring tasks. scope='team' = one shared
-- checklist item for the whole gym per period; scope='individual' = every
-- active staff member gets their own copy each period.

create table task_templates (
  id           uuid primary key default gen_random_uuid(),
  key          text unique not null,
  label        text not null,
  description  text,
  scope        text not null check (scope in ('individual','team')),
  cadence      text not null check (cadence in ('daily','weekly','monthly')),
  target_type  text not null default 'boolean' check (target_type in ('boolean','count','numeric')),
  target_value numeric default 1,
  unit         text,
  sort_order   int not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ── task_completions ────────────────────────────────────────────────────────
-- The historical log. One row per template x staff x period, ever. Checking
-- a box again is an upsert on the unique constraint, not a new row, so a
-- period's status is always a single source of truth while still being kept
-- forever once the period rolls over (nothing gets deleted).

create table task_completions (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references task_templates(id) on delete cascade,
  staff_id     uuid references staff(id) on delete set null, -- null = team-level entry
  period_start date not null,       -- the day / Monday of week / 1st of month
  period_type  text not null check (period_type in ('daily','weekly','monthly')),
  value        numeric not null default 1,
  note         text,
  logged_at    timestamptz not null default now(),
  unique (template_id, staff_id, period_start)
);

-- ── targets ──────────────────────────────────────────────────────────────────
-- Numeric KPI goals (revenue, new members, PT sessions...), separate from the
-- checklist. effective_to = null means "still active"; closing one out
-- instead of editing it keeps old targets intact for historical comparisons.

create table targets (
  id             uuid primary key default gen_random_uuid(),
  metric_key     text not null,
  label          text,
  scope          text not null check (scope in ('individual','team')),
  staff_id       uuid references staff(id) on delete cascade, -- null = team-wide
  cadence        text not null check (cadence in ('daily','weekly','monthly')),
  target_value   numeric not null,
  effective_from date not null default current_date,
  effective_to   date,
  created_at     timestamptz not null default now()
);

-- ── metric_actuals (phase 2) ───────────────────────────────────────────────
-- Daily actuals, eventually populated by scheduled-daily-refresh.js instead
-- of (or alongside) the Netlify Blobs cache it overwrites today. Empty until
-- we wire that up — table exists now so `targets` can join against it later
-- without another migration.

create table metric_actuals (
  id          uuid primary key default gen_random_uuid(),
  metric_key  text not null,
  staff_id    uuid references staff(id) on delete cascade, -- null = studio-wide
  metric_date date not null,
  value       numeric not null,
  source      text not null default 'mindbody',
  synced_at   timestamptz not null default now(),
  unique (metric_key, staff_id, metric_date)
);

-- ============================================================================
-- Auto-create a staff row the first time someone signs in via Supabase Auth
-- ============================================================================

create function handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into staff (auth_user_id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email)
  on conflict (email) do update set auth_user_id = excluded.auth_user_id;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table staff             enable row level security;
alter table task_templates    enable row level security;
alter table task_completions  enable row level security;
alter table targets           enable row level security;
alter table metric_actuals    enable row level security;

-- Helper: is the signed-in user a manager/admin?
create function is_manager()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from staff
    where auth_user_id = auth.uid() and role in ('manager','admin') and active
  );
$$;

-- Helper: staff.id for the signed-in user
create function current_staff_id()
returns uuid
language sql
security definer set search_path = public
stable
as $$
  select id from staff where auth_user_id = auth.uid();
$$;

-- staff: everyone signed in can see the active roster; you can edit your own
-- name; only managers can change roles/activate/deactivate people.
create policy "staff readable by team" on staff
  for select using (auth.uid() is not null);
create policy "staff can update own name" on staff
  for update using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());
create policy "managers manage staff" on staff
  for all using (is_manager()) with check (is_manager());

-- task_templates: everyone reads active templates; only managers write.
create policy "templates readable by team" on task_templates
  for select using (auth.uid() is not null);
create policy "managers manage templates" on task_templates
  for insert with check (is_manager());
create policy "managers update templates" on task_templates
  for update using (is_manager()) with check (is_manager());
create policy "managers delete templates" on task_templates
  for delete using (is_manager());

-- task_completions: everyone reads (team visibility/leaderboard); you can
-- log your own individual tasks or any team-scope task; managers can log or
-- correct on anyone's behalf.
create policy "completions readable by team" on task_completions
  for select using (auth.uid() is not null);
create policy "log own or team tasks" on task_completions
  for insert with check (
    is_manager()
    or staff_id = current_staff_id()
    or staff_id is null
  );
create policy "update own or team tasks" on task_completions
  for update using (
    is_manager()
    or staff_id = current_staff_id()
    or staff_id is null
  ) with check (
    is_manager()
    or staff_id = current_staff_id()
    or staff_id is null
  );

-- targets: everyone reads; only managers write.
create policy "targets readable by team" on targets
  for select using (auth.uid() is not null);
create policy "managers manage targets" on targets
  for all using (is_manager()) with check (is_manager());

-- metric_actuals: everyone reads for reporting; nobody writes from the
-- client — only the service_role key (used server-side in the scheduled
-- Netlify function) can insert, and RLS is bypassed for that key by design.
create policy "actuals readable by team" on metric_actuals
  for select using (auth.uid() is not null);
