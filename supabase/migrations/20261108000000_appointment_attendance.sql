-- Count PT / Semi Private appointments as attendance alongside group classes.
--
-- 1. recompute_client_visit_totals(): set-based replacement for
--    scheduled-client-sync.js's old per-client loop (3 trans-Pacific round
--    trips per client — too slow now the appointment ledger re-syncs a
--    trailing window instead of one day). An appointment counts as attended
--    when it's PT/SP and its status is Completed or Arrived (Arrived = signed
--    in but not yet closed out; it was previously not counted at all).
--    p_client_ids null = every client.
-- 2. One-off catch-up: the ledger only ever captured an appointment's status
--    the day after it ran, so later corrections in Mindbody (NoShow ->
--    Completed was the common one, ~130 rows since September) never landed.
--    Pull current statuses from the mirror, then recompute everyone.

create or replace function public.recompute_client_visit_totals(p_client_ids uuid[] default null)
returns integer
language sql
as $$
  with targets as (
    select c.id from public.clients c
    where p_client_ids is null or c.id = any(p_client_ids)
  ),
  cls as (
    select v.client_id, count(*) as n, max(v.class_date) as last_date
    from public.client_class_visits v join targets t on t.id = v.client_id
    where v.signed_in
    group by v.client_id
  ),
  appt as (
    select v.client_id, count(*) as n, max(v.appointment_date) as last_date
    from public.client_appointment_visits v join targets t on t.id = v.client_id
    where v.session_category in ('pt', 'sp') and v.status in ('Completed', 'Arrived')
    group by v.client_id
  ),
  upd as (
    update public.clients c set
      total_classes_attended = coalesce(cls.n, 0),
      total_pt_sessions      = coalesce(appt.n, 0),
      last_visit_date        = nullif(greatest(coalesce(cls.last_date, '-infinity'::date), coalesce(appt.last_date, '-infinity'::date)), '-infinity'::date),
      updated_at             = now()
    from targets t
    left join cls  on cls.client_id  = t.id
    left join appt on appt.client_id = t.id
    where c.id = t.id
      and (c.total_classes_attended is distinct from coalesce(cls.n, 0)
        or c.total_pt_sessions      is distinct from coalesce(appt.n, 0)
        or c.last_visit_date        is distinct from nullif(greatest(coalesce(cls.last_date, '-infinity'::date), coalesce(appt.last_date, '-infinity'::date)), '-infinity'::date))
    returning 1
  )
  select count(*)::integer from upd;
$$;

revoke all on function public.recompute_client_visit_totals(uuid[]) from public, anon, authenticated;
grant execute on function public.recompute_client_visit_totals(uuid[]) to service_role;

update public.client_appointment_visits v
set status = a.raw->>'Status', synced_at = now()
from public.mb_appointments a
where a.id = v.mindbody_appointment_id
  and a.raw->>'Status' is not null
  and v.status is distinct from a.raw->>'Status';

select public.recompute_client_visit_totals(null);
