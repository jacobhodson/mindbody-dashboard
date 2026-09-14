-- ============================================================================
-- Let any signed-in staff member (not just managers) claim/assign a client's
-- caseload (assigned_staff_id/assigned_group) — needed for the new "New
-- Clients to Allocate" Home panel, which the owner wants actionable by
-- whoever on the team gets to it first, not manager-gated like the rest of
-- the Clients tab's inline editing (package/next-programme-due/status,
-- still manager-only via the existing "managers update clients" RLS policy).
--
-- A plain new UPDATE policy can't scope itself to just these two columns —
-- RLS is row-level, not column-level — so this uses the same controlled-
-- bypass pattern as handle_new_auth_user()/is_manager(): a SECURITY DEFINER
-- function that only ever touches assigned_staff_id/assigned_group, callable
-- by any authenticated user. The existing "managers update clients" row
-- policy is untouched, so package/status/due-date edits are still
-- manager-only.
-- ============================================================================

create function assign_client_caseload(
  p_client_id uuid,
  p_staff_id  uuid default null,
  p_group     boolean default false
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_staff_id is not null and p_group then
    raise exception 'cannot set both a staff id and group';
  end if;

  update clients
    set assigned_staff_id = case when p_group then null else p_staff_id end,
        assigned_group    = coalesce(p_group, false),
        updated_at        = now()
  where id = p_client_id;
end;
$$;

revoke all on function assign_client_caseload(uuid, uuid, boolean) from public;
grant execute on function assign_client_caseload(uuid, uuid, boolean) to authenticated;
