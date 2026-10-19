-- ============================================================================
-- HR → Leave Planner, replacing the Notion "Annual Leave Planner" database.
--
-- One row per person per leave block (Notion allowed several people on one
-- entry; those were split on import). Everyone signed in can see everyone's
-- leave — the point is knowing who's away. Staff request their own leave;
-- managers can add/edit anyone's and are the only ones who approve/decline
-- or tick "balance updated" (the Xero leave balance has been adjusted).
-- ============================================================================

create table leave_requests (
  id              uuid primary key default gen_random_uuid(),
  staff_id        uuid not null references staff(id) on delete cascade,
  title           text not null,
  leave_type      text not null default 'annual'
                  check (leave_type in ('annual','sick','parental','carers','compassionate','other')),
  start_date      date not null,
  end_date        date not null,
  work_days       numeric(5,1),
  notes           text,
  status          text not null default 'pending'
                  check (status in ('pending','approved','declined')),
  decided_by      uuid references staff(id) on delete set null,
  decided_at      timestamptz,
  balance_updated boolean not null default false,
  notion_page_id  text,
  created_by      uuid references staff(id) on delete set null default current_staff_id(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint leave_dates_ordered check (end_date >= start_date),
  constraint leave_notion_unique unique (notion_page_id, staff_id)
);
create index leave_requests_dates_idx on leave_requests (start_date, end_date);
create index leave_requests_staff_idx on leave_requests (staff_id);

-- Only managers decide. A non-manager can't set status/balance themselves,
-- and changing the dates or type of an already-decided request sends it back
-- to pending so a manager sees it again.
create function leave_requests_guard()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if not is_manager() then
    if tg_op = 'INSERT' then
      new.status := 'pending';
      new.balance_updated := false;
      new.decided_by := null;
      new.decided_at := null;
    else
      new.balance_updated := old.balance_updated;
      if new.start_date is distinct from old.start_date
         or new.end_date is distinct from old.end_date
         or new.leave_type is distinct from old.leave_type
         or new.work_days is distinct from old.work_days then
        new.status := 'pending';
        new.decided_by := null;
        new.decided_at := null;
      else
        new.status := old.status;
        new.decided_by := old.decided_by;
        new.decided_at := old.decided_at;
      end if;
    end if;
  elsif tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'pending' then
      new.decided_by := null;
      new.decided_at := null;
    else
      new.decided_by := coalesce(new.decided_by, current_staff_id());
      new.decided_at := coalesce(new.decided_at, now());
    end if;
  end if;
  return new;
end;
$$;

create trigger leave_requests_guard before insert or update on leave_requests
  for each row execute function leave_requests_guard();

alter table leave_requests enable row level security;
create policy "leave readable by team" on leave_requests
  for select using (auth.uid() is not null);
create policy "staff request own leave" on leave_requests
  for insert with check (is_manager() or staff_id = current_staff_id());
create policy "own or manager updates leave" on leave_requests
  for update using (is_manager() or staff_id = current_staff_id())
  with check (is_manager() or staff_id = current_staff_id());
create policy "own or manager deletes leave" on leave_requests
  for delete using (is_manager() or staff_id = current_staff_id());
