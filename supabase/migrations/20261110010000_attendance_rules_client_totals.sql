-- Client totals follow Settings → Attendance (attendance_type_rules).
--
-- clients.total_pt_sessions / total_classes_attended / last_visit_date now
-- count an appointment when its type is ticked for the PT tab and a class
-- when its type is ticked for Group Training. No rule = the old behaviour
-- (appointments: session_category pt/sp; classes: all).
--
-- Saving a rule recomputes every client straight away (statement trigger),
-- so client pages don't wait for the nightly sync.

create or replace function public.recompute_client_visit_totals(p_client_ids uuid[] default null)
returns integer
language sql
as $$
  with targets as (
    select c.id from public.clients c
    where p_client_ids is null or c.id = any(p_client_ids)
  ),
  excluded_class_types as (
    select type_id from public.attendance_type_rules where kind = 'class' and not included
  ),
  cls as (
    select v.client_id, count(*) as n, max(v.class_date) as last_date
    from public.client_class_visits v
    join targets t on t.id = v.client_id
    left join public.mb_classes m on m.id = v.mindbody_class_id::text
    where v.signed_in
      and coalesce(m.raw->'ClassDescription'->>'Id', '') not in (select type_id from excluded_class_types)
    group by v.client_id
  ),
  appt_rules as (
    select type_id, included from public.attendance_type_rules where kind = 'appointment'
  ),
  appt as (
    select v.client_id, count(*) as n, max(v.appointment_date) as last_date
    from public.client_appointment_visits v
    join targets t on t.id = v.client_id
    left join appt_rules r on r.type_id = v.session_type_id
    where coalesce(r.included, v.session_category in ('pt', 'sp'), false)
      and v.status in ('Completed', 'Arrived')
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

create or replace function public.attendance_rules_recompute_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_client_visit_totals(null);
  return null;
end;
$$;

drop trigger if exists attendance_rules_recompute_totals on public.attendance_type_rules;
create trigger attendance_rules_recompute_totals
  after insert or update or delete on public.attendance_type_rules
  for each statement execute function public.attendance_rules_recompute_totals();
