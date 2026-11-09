-- Cancelled appointments (PT tab → Cancelled Sessions).
--
-- Mindbody's API never returns a cancelled appointment: it just drops out of
-- /appointment/staffappointments (confirmed live 2026-11-09 — neither
-- staffappointments?AppointmentIds= nor /client/clientvisits returns one,
-- and the webhook payload carries only the appointment id). So
-- scheduled-mb-mirror.js detects them by disappearance: an mb_appointments
-- row inside a re-synced window that the fetch no longer returns is copied
-- here, then removed from the mirror.
--
-- Mindbody doesn't say who cancelled either, so `cancelled_by` is set by
-- staff in the dashboard (null = not tagged yet). last_seen_at is the last
-- sync that still saw the booking, detected_at the sync that noticed it was
-- gone — the cancellation happened between the two (an hour apart in
-- daytime, wider overnight and for the first backfill).

create table if not exists public.appointment_cancellations (
  appointment_id     text primary key,
  client_mindbody_id text,
  session_type_id    text,
  session_type_name  text,
  session_category   text,          -- pt | sp | gym | other (utils/session-classify.js)
  staff_mindbody_id  text,
  staff_name         text,
  start_local        timestamp not null,  -- Sydney wall clock, same as mb_appointments.local_ts
  last_status        text,          -- status the last time it was seen (Booked, Confirmed, NoShow…)
  last_seen_at       timestamptz,
  detected_at        timestamptz not null default now(),
  cancelled_by       text check (cancelled_by in ('client', 'staff')),
  tagged_by          uuid references public.staff(id) on delete set null,
  tagged_at          timestamptz,
  raw                jsonb
);

create index if not exists appointment_cancellations_start_idx on public.appointment_cancellations (start_local);
create index if not exists appointment_cancellations_client_idx on public.appointment_cancellations (client_mindbody_id);

alter table public.appointment_cancellations enable row level security;

drop policy if exists "cancellations readable by team" on public.appointment_cancellations;
create policy "cancellations readable by team" on public.appointment_cancellations
  for select using (auth.uid() is not null);

drop policy if exists "cancellations taggable by team" on public.appointment_cancellations;
create policy "cancellations taggable by team" on public.appointment_cancellations
  for update using (current_staff_id() is not null) with check (current_staff_id() is not null);

-- Staff may only change the tag; rows are written by the mirror (service role).
revoke insert, update, delete on public.appointment_cancellations from anon, authenticated;
grant select on public.appointment_cancellations to authenticated;
grant update (cancelled_by) on public.appointment_cancellations to authenticated;

create or replace function public.appointment_cancellations_stamp_tag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cancelled_by is distinct from old.cancelled_by then
    new.tagged_by := case when new.cancelled_by is null then null else current_staff_id() end;
    new.tagged_at := case when new.cancelled_by is null then null else now() end;
  end if;
  return new;
end;
$$;

drop trigger if exists appointment_cancellations_stamp_tag on public.appointment_cancellations;
create trigger appointment_cancellations_stamp_tag
  before update on public.appointment_cancellations
  for each row execute function public.appointment_cancellations_stamp_tag();
