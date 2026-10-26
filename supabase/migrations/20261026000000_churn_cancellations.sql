-- ============================================================================
-- Scoreboard Churn from cancellation notices (2026-10-26).
--
-- Churn = one cancellation notice, counted on the (Sydney) day it was given.
-- Notices arrive two ways:
--   ghl       – the member's cancellation form tags them "cancellation notice
--               given" in GHL; a GHL workflow posts that to
--               netlify/functions/ghl-cancellation.js
--   dashboard – a manager counts a Mindbody contract termination as churn
--               (members who ghost us never fill in the form). That also
--               tags them in GHL, so the GHL side runs the same way; the
--               webhook it fires lands as a duplicate and isn't counted twice.
--
-- contract_terminations is the manager review queue: Mindbody terminations
-- (from the mirror) that no GHL notice explains. A manager decides churn, or
-- not churn (a contract change — old one terminated, new one sold).
--
-- Everything is written by the service role (Netlify functions); staff read
-- notices, managers read the review queue.
-- ============================================================================

create table public.contract_terminations (
  id                uuid primary key default gen_random_uuid(),
  mb_client_id      text not null,
  name              text,
  termination_date  date not null,     -- Mindbody TerminationDate, or the day a Terminated status was first seen
  contracts         jsonb not null default '[]',  -- [{id, name}] terminated that day
  other_contract    text,              -- another contract still live after it → probably a contract change
  signal            text not null check (signal in ('contract','status')),
  status            text not null default 'pending'
                    check (status in ('pending','reconciled','churn','not_churn','baseline')),
  cancellation_id   uuid,
  decided_by        uuid references public.staff(id) on delete set null,
  decided_at        timestamptz,
  detected_at       timestamptz not null default now(),
  unique (mb_client_id, termination_date)
);
create index contract_terminations_pending on public.contract_terminations (status) where status = 'pending';

create table public.cancellations (
  id              uuid primary key default gen_random_uuid(),
  notice_date     date not null,       -- the churn day
  source          text not null check (source in ('ghl','dashboard')),
  ghl_contact_id  text,
  mb_client_id    text,
  name            text,
  email           text,
  phone           text,
  reason          text,
  payload         jsonb,               -- the full GHL webhook body
  termination_id  uuid references public.contract_terminations(id) on delete set null,
  duplicate_of    uuid references public.cancellations(id) on delete set null,  -- repeat notice; not counted
  created_by      uuid references public.staff(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index cancellations_notice_date on public.cancellations (notice_date) where duplicate_of is null;
create index cancellations_contact on public.cancellations (ghl_contact_id);
create index cancellations_mb_client on public.cancellations (mb_client_id);

alter table public.contract_terminations
  add constraint contract_terminations_cancellation_fk
  foreign key (cancellation_id) references public.cancellations(id) on delete set null;

alter table public.contract_terminations enable row level security;
alter table public.cancellations         enable row level security;
create policy "managers read" on public.contract_terminations for select using (is_manager());
create policy "staff read"    on public.cancellations         for select using (current_staff_id() is not null);

-- ── Matching a notice to a Mindbody client ────────────────────────────────
-- Email first, then the last 9 digits of mobile/home phone; Active/Suspended
-- clients win ties.
create function public.match_mb_client(p_email text, p_phone text)
returns text
language sql
stable
security definer set search_path = public
as $$
  with q as (
    select nullif(lower(trim(p_email)), '') email,
           nullif(right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9), '') phone
  )
  select r.id
  from mb_clients_raw r, q
  where (q.email is not null and lower(trim(r.raw->>'Email')) = q.email)
     or (length(q.phone) = 9 and q.phone in (
           right(regexp_replace(coalesce(r.raw->>'MobilePhone', ''), '\D', '', 'g'), 9),
           right(regexp_replace(coalesce(r.raw->>'HomePhone', ''), '\D', '', 'g'), 9)))
  order by (q.email is not null and lower(trim(r.raw->>'Email')) = q.email) desc,
           (r.raw->>'Status' in ('Active', 'Suspended')) desc
  limit 1;
$$;

-- ── Detect + reconcile ────────────────────────────────────────────────────
-- Run by scheduled-ghl-sync.js every 15 min and after each new notice.
-- A termination is explained by a notice for the same client given up to
-- 120 days before it (notice → Mindbody cancel ~4 weeks later) or 14 after.
create function public.refresh_churn_review(p_status text default 'pending')
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  today date := (now() at time zone 'Australia/Sydney')::date;
  n_contract int;
  n_status int;
  n_reconciled int;
begin
  update cancellations set mb_client_id = match_mb_client(email, phone)
  where mb_client_id is null and (email is not null or phone is not null);

  -- (a) contracts carrying a TerminationDate (one row per client per day)
  with c as (
    select cc.client_id, j, j->>'Id' cid, left(j->>'TerminationDate', 10)::date td
    from mb_client_contracts cc, jsonb_array_elements(cc.contracts) j
  ), term as (
    select client_id, td,
           jsonb_agg(jsonb_build_object('id', cid, 'name', j->>'ContractName') order by cid) contracts,
           array_agg(cid) ids
    from c where td is not null
    group by client_id, td
  )
  insert into contract_terminations (mb_client_id, name, termination_date, contracts, other_contract, signal, status)
  select t.client_id,
         nullif(trim(concat_ws(' ', r.raw->>'FirstName', r.raw->>'LastName')), ''),
         t.td, t.contracts,
         (select o.j->>'ContractName' from c o
          where o.client_id = t.client_id and not (o.cid = any(t.ids))
            and (o.td is null or o.td > t.td)
            and left(o.j->>'EndDate', 10)::date >= t.td
          order by o.j->>'StartDate' desc limit 1),
         'contract', p_status
  from term t
  left join mb_clients_raw r on r.id = t.client_id
  where not exists (select 1 from contract_terminations x
                    where x.mb_client_id = t.client_id and x.termination_date between t.td - 30 and t.td + 30)
  on conflict (mb_client_id, termination_date) do nothing;
  get diagnostics n_contract = row_count;

  -- (b) client went Terminated before the nightly contracts pass saw a
  -- TerminationDate (the mirror stops refreshing contracts once a client is
  -- Terminated, so their last snapshot still shows the contract as live)
  insert into contract_terminations (mb_client_id, name, termination_date, contracts, signal, status)
  select r.id,
         nullif(trim(concat_ws(' ', r.raw->>'FirstName', r.raw->>'LastName')), ''),
         today,
         (select coalesce(jsonb_agg(jsonb_build_object('id', j->>'Id', 'name', j->>'ContractName')), '[]')
          from jsonb_array_elements(cc.contracts) j
          where j->>'TerminationDate' is null and left(j->>'EndDate', 10)::date >= today - 7),
         'status', p_status
  from mb_clients_raw r
  join mb_client_contracts cc on cc.client_id = r.id
  where r.raw->>'Status' = 'Terminated'
    and exists (select 1 from jsonb_array_elements(cc.contracts) j
                where j->>'TerminationDate' is null and left(j->>'EndDate', 10)::date >= today - 7)
    and not exists (select 1 from contract_terminations x
                    where x.mb_client_id = r.id
                      and (x.detected_at >= cc.synced_at or x.termination_date >= today - 30))
  on conflict (mb_client_id, termination_date) do nothing;
  get diagnostics n_status = row_count;

  update contract_terminations t
  set status = 'reconciled', cancellation_id = c.id, decided_at = now()
  from cancellations c
  where t.status = 'pending' and c.duplicate_of is null
    and c.mb_client_id = t.mb_client_id
    and c.notice_date between t.termination_date - 120 and t.termination_date + 14;
  get diagnostics n_reconciled = row_count;

  return jsonb_build_object('newContract', n_contract, 'newStatus', n_status, 'reconciled', n_reconciled,
    'pending', (select count(*) from contract_terminations where status = 'pending'));
end;
$$;

revoke all on function public.refresh_churn_review(text) from public, anon, authenticated;
revoke all on function public.match_mb_client(text, text) from public, anon, authenticated;

-- ── Bell notification for managers ────────────────────────────────────────
-- Fires on insert by the service role (no actor), unlike the other kinds.
-- Silent when a notice already explains it (the usual case: form first,
-- Mindbody termination ~4 weeks later) — refresh_churn_review() matches
-- notices to clients before inserting, then reconciles the row.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('task_assigned','leave_decided','leave_requested','termination_review'));

create function public.notify_termination_review()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status <> 'pending' then return new; end if;
  if exists (select 1 from cancellations c
             where c.duplicate_of is null and c.mb_client_id = new.mb_client_id
               and c.notice_date between new.termination_date - 120 and new.termination_date + 14) then
    return new;
  end if;
  insert into notifications (recipient_staff_id, kind, title, body, link_tab)
  select s.id, 'termination_review',
         'Mindbody termination to review',
         coalesce(new.name, 'Client ' || new.mb_client_id)
           || coalesce(' · ' || (select string_agg(e->>'name', ', ') from jsonb_array_elements(new.contracts) e), '')
           || ' · ' || to_char(new.termination_date, 'Dy FMDD Mon')
           || ' — no cancellation notice in GHL',
         'home'
  from staff s
  where s.active and s.role in ('manager','admin') and s.auth_user_id is not null;
  return new;
end;
$$;

create trigger contract_terminations_notify after insert on public.contract_terminations
  for each row execute function notify_termination_review();

-- Everything Mindbody already shows as terminated predates this and was
-- counted by hand — record it as baseline so only new terminations queue.
select public.refresh_churn_review('baseline');
