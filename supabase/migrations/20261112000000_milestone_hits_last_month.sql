-- Milestones tab gained a "Last month" view: recent_hits now covers
-- everything since the 1st of last month (was the last 35 days).

create or replace function public.client_visit_milestones()
returns table (
  mindbody_id  text,
  total_visits bigint,
  visits_28d   bigint,
  last_visit   date,
  recent_hits  jsonb,
  history_from date
)
language sql
stable
security definer
set search_path = public
as $$
  with now_local as (select (now() at time zone 'Australia/Sydney') ts),
  class_visits as (
    select distinct on (v->>'ClientId', c.id)
           v->>'ClientId' cid, c.local_ts ts
    from mb_classes c
    cross join lateral jsonb_array_elements(coalesce(c.visits, '[]'::jsonb)) v
    where (v->>'SignedIn')::boolean
      and c.local_ts <= (select ts from now_local)
  ),
  appt_visits as (
    select raw->>'ClientId' cid, local_ts ts
    from mb_appointments
    where raw->>'Status' in ('Completed', 'Arrived')
      and local_ts <= (select ts from now_local)
  ),
  visits as (
    select cid, ts, row_number() over (partition by cid order by ts) n
    from (select * from class_visits union all select * from appt_visits) u
    where cid is not null
  ),
  targets as (select unnest(milestone_targets) t from app_settings)
  select v.cid,
         count(*),
         count(*) filter (where v.ts > (select ts from now_local) - interval '28 days'),
         max(v.ts)::date,
         coalesce(
           jsonb_agg(jsonb_build_object('n', v.n, 'date', v.ts::date) order by v.n)
             filter (where v.n in (select t from targets)
                       and v.ts >= date_trunc('month', (select ts from now_local)) - interval '1 month'),
           '[]'::jsonb),
         (select min(local_ts)::date from mb_classes where visits_synced_at is not null)
  from visits v
  where current_staff_id() is not null
  group by v.cid
  having max(v.ts) > (select ts from now_local) - interval '120 days';
$$;

revoke all on function public.client_visit_milestones() from public, anon;
grant execute on function public.client_visit_milestones() to authenticated;
