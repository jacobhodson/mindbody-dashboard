-- Strategy session log: staff record a strategy session against a client
-- (date + notes) from the client profile. Same RLS split as client_notes —
-- any staff can log their own, edit/delete is the author or a manager.
--
-- clients.last_strategy_session is a denormalised max(session_date), kept
-- current by trigger so ClientsList can filter/sort without a second query.
-- The roster sync upserts only its own columns, so it never touches this.
create table strategy_sessions (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id) on delete cascade,
  staff_id     uuid references staff(id) on delete set null,
  session_date date not null default current_date,
  notes        text,
  created_at   timestamptz not null default now()
);
create index strategy_sessions_client_id_idx on strategy_sessions (client_id, session_date desc);
alter table strategy_sessions enable row level security;

create policy "strategy sessions readable by team" on strategy_sessions
  for select using (auth.uid() is not null);
create policy "log own strategy sessions" on strategy_sessions
  for insert with check (staff_id = current_staff_id());
create policy "update own strategy sessions" on strategy_sessions
  for update using (staff_id = current_staff_id() or is_manager())
  with check (staff_id = current_staff_id() or is_manager());
create policy "delete own strategy sessions" on strategy_sessions
  for delete using (staff_id = current_staff_id() or is_manager());

alter table clients add column last_strategy_session date;

-- SECURITY DEFINER: coaches have no UPDATE path on clients (see
-- 20260908010000_clients_and_visit_ledger.sql), but logging a session
-- must still refresh the client's denormalised date.
create or replace function refresh_last_strategy_session() returns trigger
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  for cid in
    select distinct x from unnest(array[
      case when tg_op <> 'INSERT' then old.client_id end,
      case when tg_op <> 'DELETE' then new.client_id end
    ]) as x where x is not null
  loop
    update clients
       set last_strategy_session = (select max(session_date) from strategy_sessions where client_id = cid)
     where id = cid;
  end loop;
  return null;
end $$;

create trigger strategy_sessions_refresh_last
  after insert or update or delete on strategy_sessions
  for each row execute function refresh_last_strategy_session();
