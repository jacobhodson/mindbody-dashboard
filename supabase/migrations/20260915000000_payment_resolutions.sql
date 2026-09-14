-- ============================================================================
-- Payment Issues (Failed Payments + On Account) resolution tracking, moved
-- off Notion (NOTION_PAYMENT_RESOLUTIONS_DB / mb-payment-resolutions.js) onto
-- Supabase, same pattern as the earlier contact_log migration. Plain unique
-- constraint on `key` so supabase-js's .upsert({onConflict:'key'}) works.
--
-- The 79 existing Notion rows were backfilled directly via the Supabase MCP
-- (not part of this file, since apply_migration's own guidance is not to
-- hardcode generated-id data migrations) — see git history of
-- usePaymentResolutions.js / mb-payment-resolutions.js for the shape moved
-- away from.
-- ============================================================================

create table payment_resolutions (
  id           uuid primary key default gen_random_uuid(),
  key          text unique not null,       -- dedupe key: failed payment's
                                            -- clientId|amountCents|last4, or
                                            -- on-account's onaccount-clientId|balanceCents
  status       text not null check (status in ('reprocessed', 'reconciled')),
  client_name  text,
  amount       numeric,
  card         text,
  payment_date text,                       -- pre-formatted display string (e.g. "14 Sep 2026"), not a real date
  resolved_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

alter table payment_resolutions enable row level security;

-- No ownership concept here — any signed-in staff member should be able to
-- mark or unmark any payment issue resolved, same reasoning as
-- metric_actuals' intentionally-open write policy.
create policy "payment resolutions readable by team" on payment_resolutions
  for select using (auth.uid() is not null);
create policy "any staff can log a payment resolution" on payment_resolutions
  for insert with check (auth.uid() is not null);
create policy "any staff can update a payment resolution" on payment_resolutions
  for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "any staff can delete a payment resolution" on payment_resolutions
  for delete using (auth.uid() is not null);
