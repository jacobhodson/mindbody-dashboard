-- ============================================================================
-- Leave Planner round 2:
--  1. Two leave categories only — Annual and Personal (sick, carer's,
--     compassionate, parental and other all fold into Personal), matching
--     Xero's own "Annual Leave" / "Personal/Carer's Leave" balances.
--  2. Request notes are private: only the person themselves and managers
--     can read them (moved to their own table so RLS can hide them — the
--     request itself stays visible to everyone so the team can plan).
--  3. leave_balances: Xero Payroll's accrued leave per person, written by
--     the xero-leave-balances function (service role); readable by the
--     person themselves and managers only.
-- ============================================================================

-- 1. Annual / Personal ────────────────────────────────────────────────────────
alter table leave_requests drop constraint leave_requests_leave_type_check;
update leave_requests set leave_type = 'personal' where leave_type <> 'annual';
alter table leave_requests add constraint leave_requests_leave_type_check
  check (leave_type in ('annual','personal'));

-- 2. Private notes ───────────────────────────────────────────────────────────
create table leave_request_notes (
  request_id uuid primary key references leave_requests(id) on delete cascade,
  notes      text not null,
  updated_at timestamptz not null default now()
);

insert into leave_request_notes (request_id, notes)
  select id, notes from leave_requests where nullif(trim(notes), '') is not null;
alter table leave_requests drop column notes;

-- Own request (or a manager).
create function can_see_leave_request(rid uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select is_manager() or exists (
    select 1 from leave_requests where id = rid and staff_id = current_staff_id()
  );
$$;

alter table leave_request_notes enable row level security;
create policy "own or manager reads leave notes" on leave_request_notes
  for select using (can_see_leave_request(request_id));
create policy "own or manager writes leave notes" on leave_request_notes
  for insert with check (can_see_leave_request(request_id));
create policy "own or manager updates leave notes" on leave_request_notes
  for update using (can_see_leave_request(request_id)) with check (can_see_leave_request(request_id));
create policy "own or manager deletes leave notes" on leave_request_notes
  for delete using (can_see_leave_request(request_id));

-- 3. Xero leave balances ─────────────────────────────────────────────────────
create table leave_balances (
  staff_id      uuid not null references staff(id) on delete cascade,
  leave_type_id text not null,           -- Xero LeaveTypeID
  leave_name    text not null,           -- e.g. "Annual Leave", "Personal/Carer's Leave"
  category      text check (category in ('annual','personal')),
  units         numeric(10,4) not null,  -- Xero NumberOfUnits
  unit_type     text not null default 'Hours',
  as_of         timestamptz not null default now(),
  primary key (staff_id, leave_type_id)
);

alter table leave_balances enable row level security;
create policy "own or manager reads leave balances" on leave_balances
  for select using (is_manager() or staff_id = current_staff_id());
-- No write policies: only the service role (xero-leave-balances.js) writes.
