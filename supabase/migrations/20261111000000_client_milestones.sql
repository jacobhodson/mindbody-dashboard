-- Milestones (Coaching → Milestones tab).
--
-- Mindbody shows milestone icons on class rosters, but the API exposes no
-- milestone field or lifetime visit count, so we count visits ourselves from
-- the mirror: signed-in class visits (mb_classes.visits) plus Completed /
-- Arrived appointments (mb_appointments). Every visit type counts, like
-- Mindbody's own roster icon; Settings → Attendance rules don't apply here.
--
-- The counts are only "lifetime" as far back as the mirror holds visits: run
-- scheduled-mb-mirror.js's backfill (visits=1) from the Mindbody start date
-- to fill the gap.

alter table app_settings
  add column milestone_targets int[] not null
    default '{10,25,50,100,150,200,250,300,400,500,750,1000}';

-- One row per client who has visited in the last 120 days.
--   total_visits  lifetime visits as far as the mirror goes
--   visits_28d    pace, so the UI can estimate when the next milestone lands
--   recent_hits   [{n, date}] milestones reached in the last 35 days
--   history_from  earliest class whose visits the mirror holds (same on every
--                 row); the UI warns while this is later than the gym's start
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
                       and v.ts > (select ts from now_local) - interval '35 days'),
           '[]'::jsonb),
         (select min(local_ts)::date from mb_classes where visits_synced_at is not null)
  from visits v
  where current_staff_id() is not null
  group by v.cid
  having max(v.ts) > (select ts from now_local) - interval '120 days';
$$;

revoke all on function public.client_visit_milestones() from public, anon;
grant execute on function public.client_visit_milestones() to authenticated;
