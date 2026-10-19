-- ============================================================================
-- Header notification bell. One row per recipient; only the recipient can
-- read, mark read or clear their own. Rows are written by triggers (security
-- definer), never by the client, so they fire however the change was made:
--   task_assigned   — someone else assigns you a task (Home, rock, meeting)
--   leave_decided   — a manager approves/declines your leave
--   leave_requested — (managers) a team member requests leave, or changes
--                     decided leave so it needs re-approval
-- Changes with no signed-in actor (SQL imports, service-role jobs) don't
-- notify anyone.
-- ============================================================================

create table notifications (
  id                 uuid primary key default gen_random_uuid(),
  recipient_staff_id uuid not null references staff(id) on delete cascade,
  kind               text not null check (kind in ('task_assigned','leave_decided','leave_requested')),
  title              text not null,
  body               text,
  link_tab           text,          -- dashboard tab key to open
  link_id            uuid,          -- e.g. a rock id for the rocks tab
  actor_staff_id     uuid references staff(id) on delete set null,
  created_at         timestamptz not null default now(),
  read_at            timestamptz
);
create index notifications_recipient_idx on notifications (recipient_staff_id, created_at desc);

alter table notifications enable row level security;
create policy "own notifications readable" on notifications
  for select using (recipient_staff_id = current_staff_id());
create policy "own notifications mark read" on notifications
  for update using (recipient_staff_id = current_staff_id())
  with check (recipient_staff_id = current_staff_id());
create policy "own notifications clear" on notifications
  for delete using (recipient_staff_id = current_staff_id());

create function staff_first_name(sid uuid)
returns text
language sql
stable
security definer set search_path = public
as $$
  select coalesce(split_part(full_name, ' ', 1), 'Someone') from staff where id = sid;
$$;

create function leave_range_text(s date, e date)
returns text
language sql
immutable
as $$
  select case when s = e then to_char(s, 'Dy FMDD Mon')
              else to_char(s, 'FMDD Mon') || ' – ' || to_char(e, 'FMDD Mon YYYY') end;
$$;

-- ── tasks ───────────────────────────────────────────────────────────────────
create function notify_task_assigned()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  actor uuid := current_staff_id();
  where_txt text;
begin
  if new.assigned_staff_id is null or actor is null or new.assigned_staff_id = actor then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.assigned_staff_id is not distinct from new.assigned_staff_id then
    return new;
  end if;

  where_txt := case
    when new.rock_id is not null then 'Rock: ' || coalesce((select title from rocks where id = new.rock_id), 'a rock')
    when new.meeting_id is not null then 'Meeting to-do'
    else null end;

  insert into notifications (recipient_staff_id, kind, title, body, link_tab, link_id, actor_staff_id)
  values (
    new.assigned_staff_id, 'task_assigned',
    staff_first_name(actor) || ' assigned you a task',
    new.label
      || coalesce(' · ' || where_txt, '')
      || coalesce(' · due ' || to_char(new.due_date, 'Dy FMDD Mon'), ''),
    case when new.rock_id is not null then 'rocks' when new.meeting_id is not null then 'meetings' else 'home' end,
    new.rock_id,
    actor
  );
  return new;
end;
$$;

create trigger task_templates_notify after insert or update on task_templates
  for each row execute function notify_task_assigned();

-- ── leave ───────────────────────────────────────────────────────────────────
create function notify_leave()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  actor uuid := current_staff_id();
  range_txt text := leave_range_text(new.start_date, new.end_date);
  type_txt text := case new.leave_type when 'annual' then 'Annual' else 'Personal' end;
begin
  if actor is null then return new; end if;

  -- Decision on someone's leave → tell them.
  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and new.status in ('approved','declined') and new.staff_id <> actor then
    insert into notifications (recipient_staff_id, kind, title, body, link_tab, actor_staff_id)
    values (
      new.staff_id, 'leave_decided',
      'Your leave was ' || new.status,
      new.title || ' · ' || type_txt || ' · ' || range_txt || ' (by ' || staff_first_name(actor) || ')',
      'hr', actor
    );
  end if;

  -- New pending request, or decided leave edited back to pending → managers.
  if new.status = 'pending' and (tg_op = 'INSERT' or (old.status is distinct from 'pending' and actor = new.staff_id)) then
    insert into notifications (recipient_staff_id, kind, title, body, link_tab, actor_staff_id)
    select s.id, 'leave_requested',
           staff_first_name(new.staff_id) || case when tg_op = 'INSERT' then ' requested leave' else ' changed leave — needs re-approval' end,
           new.title || ' · ' || type_txt || ' · ' || range_txt,
           'hr', actor
    from staff s
    where s.active and s.role in ('manager','admin') and s.auth_user_id is not null
      and s.id <> actor and s.id <> new.staff_id;
  end if;
  return new;
end;
$$;

create trigger leave_requests_notify after insert or update on leave_requests
  for each row execute function notify_leave();
