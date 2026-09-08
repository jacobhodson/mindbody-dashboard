-- ============================================================================
-- Clients database: Mindbody roster mirror, full attendance/PT visit ledger,
-- staff-authored client notes, and client_id linkage on contact_log/task_templates.
-- ============================================================================

-- ── clients ──────────────────────────────────────────────────────────────
create table clients (
  id                              uuid primary key default gen_random_uuid(),
  mindbody_id                     text not null unique,
  first_name                      text,
  last_name                       text,
  middle_name                     text,
  email                           text,
  mobile_phone                    text,
  home_phone                      text,
  work_phone                      text,
  birth_date                      date,
  gender                          text,
  status                          text,
  active                          boolean,
  address_line1                   text,
  address_line2                   text,
  city                            text,
  postal_code                     text,
  country                         text,
  state                           text,
  emergency_contact_name          text,
  emergency_contact_email         text,
  emergency_contact_phone         text,
  emergency_contact_relationship  text,
  creation_date                   timestamptz,
  first_class_date                date,
  first_appointment_date          date,
  mb_last_modified                timestamptz,
  account_balance                 numeric,
  suspension_info                 jsonb,
  red_alert                       text,
  yellow_alert                    text,
  referred_by                     text,
  photo_url                       text,
  mindbody_notes                  text,           -- READ-ONLY mirror of Mindbody's native Notes field
  last_formula_notes              text,
  synced_at                       timestamptz,

  -- Our own fields — never touched by the roster sync payload (see
  -- scheduled-client-sync.js: the upsert JSON simply omits these columns,
  -- so PostgREST's generated ON CONFLICT DO UPDATE SET never overwrites them).
  assigned_staff_id               uuid references staff(id) on delete set null,
  next_program_due                date,
  total_classes_attended          int not null default 0,
  total_pt_sessions               int not null default 0,
  last_visit_date                 date,

  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);
create index clients_assigned_staff_idx on clients (assigned_staff_id);
create index clients_next_program_idx   on clients (next_program_due);
create index clients_name_idx           on clients (last_name, first_name);

-- ── client_class_visits ─────────────────────────────────────────────────
-- Natural key (client_id, mindbody_class_id) has no NULLs in either column,
-- so this is a plain (non-partial) unique constraint — safe to use directly
-- as a native upsert onConflict arbiter (see the metric_actuals partial-index
-- gotcha from an earlier round, which doesn't apply here).
create table client_class_visits (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references clients(id) on delete cascade,
  mindbody_class_id     text not null,   -- the ClassID used to fetch /class/classvisits
  mindbody_visit_id     text,            -- populated only if a Mindbody visit-level id exists; nullable
  class_name            text,
  service_name          text,
  staff_name            text,
  class_date            date not null,
  class_start_datetime  timestamptz,
  signed_in             boolean not null default false,
  late_cancelled        boolean not null default false,
  synced_at             timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  unique (client_id, mindbody_class_id)
);
create index client_class_visits_client_idx on client_class_visits (client_id, class_date desc);

-- ── client_appointment_visits ───────────────────────────────────────────
-- mindbody_appointment_id (Mindbody's appointment Id) is confirmed stable
-- and present on every appointment record — plain unique constraint.
create table client_appointment_visits (
  id                          uuid primary key default gen_random_uuid(),
  client_id                   uuid not null references clients(id) on delete cascade,
  mindbody_appointment_id     text not null unique,
  session_type_id             text,
  session_type_name           text,
  session_category            text,     -- 'pt' | 'sp' | 'gym' | 'other'
  staff_name                  text,
  appointment_date            date not null,
  appointment_start_datetime  timestamptz,
  status                      text,     -- 'Completed' | 'NoShow' | 'LateCancelled' | 'Cancelled' | ...
  synced_at                   timestamptz not null default now(),
  created_at                  timestamptz not null default now()
);
create index client_appointment_visits_client_idx on client_appointment_visits (client_id, appointment_date desc);

-- ── client_notes ────────────────────────────────────────────────────────
-- Staff-authored notes (NOT the Mindbody Notes mirror — that's clients.mindbody_notes).
create table client_notes (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  staff_id    uuid references staff(id) on delete set null,
  note        text not null,     -- RichTextField markdown-style text
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index client_notes_client_idx on client_notes (client_id, created_at desc);

-- ── linkage columns ─────────────────────────────────────────────────────
alter table contact_log add column client_id uuid references clients(id) on delete set null;
create index contact_log_client_id_idx on contact_log (client_id);

alter table task_templates add column client_id uuid references clients(id) on delete set null;
create index task_templates_client_id_idx on task_templates (client_id);

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table clients                    enable row level security;
alter table client_class_visits        enable row level security;
alter table client_appointment_visits  enable row level security;
alter table client_notes               enable row level security;

-- clients: everyone signed in reads; only managers write from the app (the
-- daily sync writes via the service_role key, which bypasses RLS entirely —
-- same convention as metric_actuals). This is also what makes
-- assigned_staff_id/next_program_due manager-only in practice: a coach's
-- browser session has no UPDATE path on this table at all.
create policy "clients readable by team" on clients
  for select using (auth.uid() is not null);
create policy "managers update clients" on clients
  for update using (is_manager()) with check (is_manager());

-- ledger tables: read-only from the app; only the service_role sync job inserts.
create policy "class visits readable by team" on client_class_visits
  for select using (auth.uid() is not null);
create policy "appointment visits readable by team" on client_appointment_visits
  for select using (auth.uid() is not null);

-- client_notes: any signed-in staff can add a note; edit/delete restricted
-- to the author or a manager — mirrors contact_log's ownership pattern.
create policy "notes readable by team" on client_notes
  for select using (auth.uid() is not null);
create policy "log own client notes" on client_notes
  for insert with check (staff_id = current_staff_id());
create policy "update own client notes" on client_notes
  for update using (staff_id = current_staff_id() or is_manager())
  with check (staff_id = current_staff_id() or is_manager());
create policy "delete own client notes" on client_notes
  for delete using (staff_id = current_staff_id() or is_manager());
