-- ============================================================================
-- Home reminders + automations panel. Managers get a padlocked panel on Home
-- listing everything that pops up there automatically, with Active/Draft
-- switches, and can create their own conditional reminders.
--
--  home_card_settings  — Active/Draft for the built-in Home pop-up cards
--                        (Xero mapping, clients to allocate, …). No row = active.
--  reminders           — manager-made reminders. trigger 'client' fires once per
--                        matching client (program due, strategy session due,
--                        no visit in N days, birthday, red alert, no coach);
--                        trigger 'schedule' fires on a date / weekly / monthly.
--  reminder_completions — "Done" clicks. `occurrence` is what made it fire
--                        (the client's due date, last visit, the week's Monday…)
--                        so it comes back by itself once that changes.
-- ============================================================================

create table home_card_settings (
  key         text primary key,
  active      boolean not null default true,
  updated_by  uuid references staff(id) on delete set null default current_staff_id(),
  updated_at  timestamptz not null default now()
);

alter table home_card_settings enable row level security;
create policy "home card settings readable" on home_card_settings
  for select using (auth.uid() is not null);
create policy "managers manage home card settings" on home_card_settings
  for all using (is_manager()) with check (is_manager());

create table reminders (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  description        text,
  trigger_type       text not null check (trigger_type in ('client','schedule')),
  -- client triggers
  condition          text check (condition in
                       ('program_due','strategy_due','no_visit','birthday','red_alert','no_coach')),
  days               int check (days is null or days between 0 and 365),
  allocated_only     boolean not null default true,
  -- schedule triggers
  cadence            text check (cadence in ('once','daily','weekly','monthly')),
  schedule_date      date,      -- once
  schedule_day       int,       -- weekly: 1=Mon..7=Sun · monthly: 1..31
  -- who sees it
  audience           text not null default 'everyone'
                       check (audience in ('everyone','managers','staff','coach')),
  audience_staff_id  uuid references staff(id) on delete set null,
  active             boolean not null default false,   -- false = Draft
  sort_order         int not null default 0,
  created_by         uuid references staff(id) on delete set null default current_staff_id(),
  created_at         timestamptz not null default now(),
  check (trigger_type <> 'client' or condition is not null),
  check (trigger_type <> 'schedule' or cadence is not null),
  check (audience <> 'coach' or trigger_type = 'client'),
  check (audience <> 'staff' or audience_staff_id is not null)
);

alter table reminders enable row level security;
create policy "reminders readable" on reminders
  for select using (auth.uid() is not null);
create policy "managers manage reminders" on reminders
  for all using (is_manager()) with check (is_manager());

create table reminder_completions (
  id            uuid primary key default gen_random_uuid(),
  reminder_id   uuid not null references reminders(id) on delete cascade,
  client_id     uuid references clients(id) on delete cascade,
  occurrence    text not null,
  completed_by  uuid references staff(id) on delete set null default current_staff_id(),
  completed_at  timestamptz not null default now()
);
create unique index reminder_completions_once on reminder_completions
  (reminder_id, coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid), occurrence);

alter table reminder_completions enable row level security;
create policy "reminder completions readable" on reminder_completions
  for select using (auth.uid() is not null);
create policy "staff complete reminders" on reminder_completions
  for insert with check (auth.uid() is not null and completed_by = current_staff_id());
create policy "undo own completion or manager" on reminder_completions
  for delete using (completed_by = current_staff_id() or is_manager());
