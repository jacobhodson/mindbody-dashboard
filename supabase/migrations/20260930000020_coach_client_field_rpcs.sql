-- ============================================================================
-- Open the rest of the Clients tab's inline editing (package, next-programme-
-- due, status override) to any signed-in staff member, not just managers —
-- coaches need to maintain these for their own caseload.
--
-- Same controlled-bypass pattern as assign_client_caseload(): RLS is row-
-- level, so a permissive UPDATE policy would also open every Mindbody-
-- mirrored column on the row. Each SECURITY DEFINER function below touches
-- exactly one column. The "managers update clients" policy is unchanged,
-- and creating/renaming packages ("managers manage packages") stays
-- manager-only — coaches pick from the existing list.
-- ============================================================================

create function set_client_package(p_client_id uuid, p_package_id uuid default null)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update clients set package_id = p_package_id, updated_at = now() where id = p_client_id;
end;
$$;

create function set_client_next_program_due(p_client_id uuid, p_due date default null)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update clients set next_program_due = p_due, updated_at = now() where id = p_client_id;
end;
$$;

-- null clears the override, falling back to the Mindbody-synced `status`.
create function set_client_status_override(p_client_id uuid, p_status text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_status is not null and p_status not in ('Active', 'Inactive', 'Trial') then
    raise exception 'invalid status override: %', p_status;
  end if;
  update clients set status_override = p_status, updated_at = now() where id = p_client_id;
end;
$$;

revoke all on function set_client_package(uuid, uuid)            from public;
revoke all on function set_client_next_program_due(uuid, date)   from public;
revoke all on function set_client_status_override(uuid, text)    from public;
grant execute on function set_client_package(uuid, uuid)          to authenticated;
grant execute on function set_client_next_program_due(uuid, date) to authenticated;
grant execute on function set_client_status_override(uuid, text)  to authenticated;
