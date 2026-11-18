-- Debit adjustments (replaces the "Debit Adjustments" Google Form).
-- Any staff member logs a suspension/holiday hold from Home; whoever holds
-- the Office admin duty (staff.is_office_admin — a responsibility flag, not
-- an access level, so it sits alongside coach/manager/admin) gets a Home card
-- + bell notification and ticks each one off once it's done in Mindbody.
-- Everyone can see the full log in the Admin tab.

-- ── Office admin duty flag ──
alter table staff add column if not exists is_office_admin boolean not null default false;
update staff set is_office_admin = true where lower(email) = 'admin@newstrength.com.au';

create or replace function is_office_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select is_office_admin from staff where auth_user_id = auth.uid() and active), false);
$$;

-- Same guard as 20261029000000_settings.sql, plus is_office_admin is a
-- manager-only change.
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

  if new.auth_user_id is distinct from old.auth_user_id or new.email is distinct from old.email then
    raise exception 'Email and login can only be changed from Settings';
  end if;

  if not me_manager then
    if not is_self then raise exception 'Not allowed'; end if;
    if new.role is distinct from old.role or new.active is distinct from old.active
       or new.is_coach is distinct from old.is_coach
       or new.is_office_admin is distinct from old.is_office_admin
       or new.xero_employee_id is distinct from old.xero_employee_id then
      raise exception 'Only managers can change access, coach/office admin status or payroll links';
    end if;
    return new;
  end if;

  if not me_admin and (old.role = 'admin' or new.role = 'admin')
     and (new.role is distinct from old.role or new.active is distinct from old.active or not is_self) then
    raise exception 'Only an admin (owner) can change admin access';
  end if;

  if is_self and (new.role is distinct from old.role or new.active is distinct from old.active) then
    raise exception 'You can''t change your own access level — ask another manager';
  end if;

  if old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active)
     and not exists (select 1 from staff where role = 'admin' and active and id <> old.id) then
    raise exception 'There must always be at least one admin';
  end if;

  return new;
end;
$$;

-- ── Debit adjustments ──
create table debit_adjustments (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid references clients(id) on delete set null,  -- picked from the roster when possible
  client_name      text not null,                                   -- always kept (typed or from the pick)
  kind             text not null default 'suspension' check (kind in ('suspension', 'holiday')),
  hold_start       date,
  return_date      date,
  notes            text,
  status           text not null default 'submitted' check (status in ('submitted', 'in_progress', 'processed', 'cancelled')),
  admin_note       text,
  submitted_by     uuid references staff(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  processed_by     uuid references staff(id) on delete set null,
  processed_at     timestamptz,
  check (return_date is null or hold_start is null or return_date >= hold_start)
);
create index debit_adjustments_status_idx on debit_adjustments (status, created_at desc);

-- Who submitted it is always the signed-in person; processed_* is stamped
-- whenever it moves to/away from Processed.
create or replace function debit_adjustments_stamp()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.submitted_by := current_staff_id(); end if;
    new.status := 'submitted';
    new.processed_by := null; new.processed_at := null;
    return new;
  end if;
  new.submitted_by := old.submitted_by;
  new.created_at   := old.created_at;
  new.updated_at   := now();
  if new.status = 'processed' and old.status <> 'processed' then
    new.processed_by := current_staff_id();
    new.processed_at := now();
  elsif new.status <> 'processed' then
    new.processed_by := null; new.processed_at := null;
  else
    new.processed_by := old.processed_by; new.processed_at := old.processed_at;
  end if;
  return new;
end;
$$;
create trigger debit_adjustments_stamp
  before insert or update on debit_adjustments
  for each row execute function debit_adjustments_stamp();

-- Submitters can only fix the details / cancel their own while it's still
-- waiting; office admins and managers can change anything.
create or replace function debit_adjustments_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null or is_office_admin() or is_manager() then return new; end if;
  if old.submitted_by is distinct from current_staff_id() or old.status <> 'submitted' then
    raise exception 'Only the office admin can update this once it''s being processed';
  end if;
  if new.status not in ('submitted', 'cancelled') or new.admin_note is distinct from old.admin_note then
    raise exception 'Only the office admin can process debit adjustments';
  end if;
  return new;
end;
$$;
create trigger debit_adjustments_guard
  before update on debit_adjustments
  for each row execute function debit_adjustments_guard();

alter table debit_adjustments enable row level security;
create policy "staff read debit adjustments" on debit_adjustments
  for select using (current_staff_id() is not null);
create policy "staff submit debit adjustments" on debit_adjustments
  for insert with check (current_staff_id() is not null);
create policy "staff update debit adjustments" on debit_adjustments
  for update using (is_office_admin() or is_manager() or submitted_by = current_staff_id());
create policy "managers delete debit adjustments" on debit_adjustments
  for delete using (is_manager());

-- ── Bell notification to the office admin(s) only ──
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('task_assigned','leave_decided','leave_requested','termination_review','debit_adjustment'));

create or replace function notify_debit_adjustment()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into notifications (recipient_staff_id, kind, title, body, link_tab, link_id, actor_staff_id)
  select s.id, 'debit_adjustment',
         'Debit adjustment to process',
         new.client_name || ' · ' || initcap(new.kind)
           || coalesce(' · from ' || to_char(new.hold_start, 'Dy FMDD Mon'), '')
           || coalesce(' to ' || to_char(new.return_date, 'Dy FMDD Mon'), '')
           || coalesce(' — logged by ' || staff_first_name(new.submitted_by), ''),
         'home', new.id, new.submitted_by
  from staff s
  where s.active and s.is_office_admin and s.id is distinct from new.submitted_by;
  return new;
end;
$$;
create trigger debit_adjustments_notify
  after insert on debit_adjustments
  for each row execute function notify_debit_adjustment();
