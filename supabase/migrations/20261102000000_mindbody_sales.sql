-- ============================================================================
-- Sales made directly through Mindbody, which never become a GHL won deal.
-- Scoreboard Sales is rewritten from synced data on every GHL sync, so these
-- need their own ledger rather than a +1 on metric_actuals (the sync would
-- wipe it). One row per client; syncSales() in utils/metric-sync.js adds them
-- to the GHL wins, counting a client with a won deal only once.
--
-- Staff read; written through ghl-lead.js with the service role.
-- ============================================================================

create table public.mindbody_sales (
  id            uuid primary key default gen_random_uuid(),
  mb_client_id  text not null unique,
  client_id     uuid references public.clients(id) on delete set null,
  name          text,
  sale_date     date not null,
  reconciled_opportunity_id text,  -- the won GHL deal for the same person, set by syncSales()
  created_by    uuid references public.staff(id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table public.mindbody_sales enable row level security;
create policy "staff read" on public.mindbody_sales for select using (current_staff_id() is not null);
