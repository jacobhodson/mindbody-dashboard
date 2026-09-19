-- ============================================================================
-- Two additions to the coach-performance snapshot layer:
--
-- 1. Per-MONTH wage overrides. staff_wage_overrides (2026-09-20) is a single
--    standing figure per staff member — fine for a permanent profit-share
--    salary, but a manager also needs to correct one specific month (a
--    bonus, unpaid leave, a payroll run booked in the wrong month). Month-
--    specific rows take precedence; the standing row stays as the default
--    for any month without one; Xero payroll is the fallback after that.
--
-- 2. coach_rolling30 — one row per coach per day, holding the trailing
--    30-day equivalent of an ler_monthly row (revenue, sessions/classes,
--    wages, LER), written by scheduled-coach-snapshot.js each night. Rows
--    accumulate, so there's also a history of "rolling 30-day LER" over
--    time, not just today's figure.
-- ============================================================================

create table staff_wage_overrides_monthly (
  id             uuid primary key default gen_random_uuid(),
  staff_id       uuid not null references staff(id) on delete cascade,
  month          date not null,  -- always the 1st of the month
  effective_wage numeric not null,
  note           text,
  updated_by     uuid references staff(id) on delete set null,
  updated_at     timestamptz not null default now(),
  unique (staff_id, month)
);
alter table staff_wage_overrides_monthly enable row level security;
create policy "monthly wage overrides manager only" on staff_wage_overrides_monthly
  for all using (is_manager()) with check (is_manager());

-- The Xero-sourced wage for that month, kept alongside the effective
-- `wages` figure, so clearing an override can fall back to it without
-- another Xero call.
alter table ler_monthly add column xero_wages numeric;
update ler_monthly set xero_wages = wages where wages_source = 'xero';

create table coach_rolling30 (
  id             uuid primary key default gen_random_uuid(),
  staff_id       uuid not null references staff(id) on delete cascade,
  as_of          date not null,   -- the window is the 30 days ending on this date
  pt_revenue     numeric not null default 0,
  pt_sessions    integer not null default 0,
  group_revenue  numeric not null default 0,
  group_classes  integer not null default 0,
  wages          numeric,
  wages_source   text check (wages_source in ('xero', 'override', 'mixed')),
  ler            numeric,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (staff_id, as_of)
);
alter table coach_rolling30 enable row level security;
create policy "rolling30 readable by managers" on coach_rolling30
  for select using (is_manager());

-- Recomputes wages / wages_source / ler on every ler_monthly row for a month
-- using the override chain: month-specific override -> standing override ->
-- Xero. Called after a manager changes an override so the Team tab and LER
-- table reflect it immediately rather than at the next nightly run.
create or replace function refresh_ler_month(p_month date)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not is_manager() then raise exception 'managers only'; end if;

  update ler_monthly l set
    wages        = x.wage,
    wages_source = case when x.is_override then 'override' when x.wage is not null then 'xero' else null end,
    ler          = case when x.wage > 0 then round((l.pt_revenue + l.group_revenue) / x.wage, 2) else null end,
    updated_at   = now()
  from (
    select l2.id,
           coalesce(m.effective_wage, s.effective_wage, l2.xero_wages) as wage,
           (m.effective_wage is not null or s.effective_wage is not null) as is_override
    from ler_monthly l2
    left join staff_wage_overrides_monthly m on m.staff_id = l2.staff_id and m.month = l2.month
    left join staff_wage_overrides s         on s.staff_id = l2.staff_id
    where l2.month = date_trunc('month', p_month)::date
  ) x
  where l.id = x.id;
end;
$$;

-- p_wage null clears that month's override.
create or replace function set_monthly_wage_override(p_staff_id uuid, p_month date, p_wage numeric, p_note text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
begin
  if not is_manager() then raise exception 'managers only'; end if;

  if p_wage is null then
    delete from staff_wage_overrides_monthly where staff_id = p_staff_id and month = v_month;
  else
    insert into staff_wage_overrides_monthly (staff_id, month, effective_wage, note, updated_by)
    values (p_staff_id, v_month, p_wage, p_note, current_staff_id())
    on conflict (staff_id, month) do update
      set effective_wage = excluded.effective_wage,
          note           = excluded.note,
          updated_by     = excluded.updated_by,
          updated_at     = now();
  end if;

  perform refresh_ler_month(v_month);
end;
$$;

revoke all on function refresh_ler_month(date) from public;
revoke all on function set_monthly_wage_override(uuid, date, numeric, text) from public;
grant execute on function refresh_ler_month(date) to authenticated;
grant execute on function set_monthly_wage_override(uuid, date, numeric, text) to authenticated;
