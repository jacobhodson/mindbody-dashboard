-- Sidebar "Quick links": a manager-curated list of external links (booking
-- pages, forms, docs) every logged-in staff member can open. Same RLS split
-- as membership_packages — team reads, managers add/remove.
create table quick_links (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,
  url        text not null check (url ~* '^https?://'),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table quick_links enable row level security;

create policy "quick links readable by team" on quick_links
  for select using (auth.uid() is not null);
create policy "managers manage quick links" on quick_links
  for all using (is_manager()) with check (is_manager());
