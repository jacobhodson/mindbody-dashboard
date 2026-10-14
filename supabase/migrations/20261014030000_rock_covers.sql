-- Rock cover images (the Rocks gallery cards + full-page header, like
-- Notion page covers). `cover` is either a public image URL or a preset
-- gradient token 'gradient:<n>' (see src/utils/rocks.js); null = plain.
alter table rocks add column cover text;

-- Public-read bucket (an <img> can't send the Supabase session) with random
-- file names. Any signed-in staff member can upload, since a rock's owner
-- (not just managers) can change its cover; the rocks row itself is still
-- protected by the rocks update policy.
insert into storage.buckets (id, name, public)
values ('rock-covers', 'rock-covers', true)
on conflict (id) do nothing;

create policy "staff upload rock covers" on storage.objects
  for insert to authenticated with check (bucket_id = 'rock-covers' and current_staff_id() is not null);
create policy "managers delete rock covers" on storage.objects
  for delete to authenticated using (bucket_id = 'rock-covers' and is_manager());
