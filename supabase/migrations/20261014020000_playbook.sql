-- ============================================================================
-- Playbook hub — the team's SOPs / handbooks (replacing "The Newstrength
-- Playbook" in Notion). A tree of pages: top-level pages are the sections
-- (Marketing, Sales, Admin…), anything under them is an SOP. Content is
-- Tiptap JSON; content_text is a plain-text copy kept for search.
-- ============================================================================

create table playbook_pages (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid references playbook_pages(id) on delete cascade,
  title        text not null,
  icon         text,                       -- an emoji, optional
  content      jsonb,
  content_text text not null default '',
  visibility   text not null default 'all' check (visibility in ('all','managers')),
  sort_order   int not null default 0,
  created_by   uuid references staff(id) on delete set null default current_staff_id(),
  updated_by   uuid references staff(id) on delete set null default current_staff_id(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index playbook_pages_parent_idx on playbook_pages (parent_id, sort_order);

create function playbook_pages_touch()
returns trigger
language plpgsql
as $$
begin
  -- Only real edits count as "updated" — reordering/moving doesn't.
  if (new.title, new.icon, new.content, new.visibility) is distinct from
     (old.title, old.icon, old.content, old.visibility) then
    new.updated_at := now();
    new.updated_by := coalesce(current_staff_id(), new.updated_by);
  end if;
  return new;
end;
$$;

create trigger playbook_pages_touch before update on playbook_pages
  for each row execute function playbook_pages_touch();

alter table playbook_pages enable row level security;
-- A managers-only page hides itself; the UI also hides everything beneath
-- it, and new pages under one default to managers-only.
create policy "playbook readable by audience" on playbook_pages
  for select using (auth.uid() is not null and (visibility = 'all' or is_manager()));
create policy "managers manage playbook" on playbook_pages
  for all using (is_manager()) with check (is_manager());

-- Renumber a set of sibling pages 0..n in the given order (menu reordering).
-- Runs as the caller, so the managers-only update policy still applies.
create function reorder_playbook_pages(p_ids uuid[])
returns void
language sql
as $$
  update playbook_pages p set sort_order = o.ord - 1
  from unnest(p_ids) with ordinality as o(id, ord)
  where p.id = o.id;
$$;

-- "How to" link from a task / onboarding action to its SOP.
alter table task_templates
  add column playbook_page_id uuid references playbook_pages(id) on delete set null;
alter table onboarding_task_templates
  add column playbook_page_id uuid references playbook_pages(id) on delete set null;

-- Images pasted/uploaded into SOPs. Public-read bucket (an <img> can't send
-- the Supabase session) with random file names; only managers can upload.
insert into storage.buckets (id, name, public)
values ('playbook-media', 'playbook-media', true)
on conflict (id) do nothing;

create policy "managers upload playbook media" on storage.objects
  for insert to authenticated with check (bucket_id = 'playbook-media' and is_manager());
create policy "managers delete playbook media" on storage.objects
  for delete to authenticated using (bucket_id = 'playbook-media' and is_manager());
