-- AI assistant (2026-11-06): the database half of the "Ask AI" panel.
--
-- Privacy model: netlify/functions/ai-chat.js calls these RPCs with the
-- signed-in person's own JWT (never the service role), so every query the
-- model writes runs as `authenticated` under that person's RLS — it can see
-- exactly what they could already see in the dashboard, nothing more.
-- Limited to managers/admins for now; dropping the is_manager() checks is
-- all a coach rollout needs.

create table if not exists ai_query_log (
  id         bigint generated always as identity primary key,
  staff_id   uuid references staff(id) on delete set null default current_staff_id(),
  query      text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_query_log_created_idx on ai_query_log (created_at desc);

alter table ai_query_log enable row level security;
-- Rows are only ever written by ai_run_query() below (as the caller), and
-- only admins (owners) can read them back.
drop policy if exists "admins read ai query log" on ai_query_log;
create policy "admins read ai query log" on ai_query_log for select using (is_admin());
drop policy if exists "managers log own ai queries" on ai_query_log;
create policy "managers log own ai queries" on ai_query_log for insert
  with check (is_manager() and staff_id = current_staff_id());

-- Tables and columns the caller can read, as compact text for the model's
-- system prompt. Skips tables with no SELECT policy at all (the raw mb_*
-- mirror, xero_connection…): RLS would return zero rows from them anyway.
create or replace function ai_schema()
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select string_agg(t.line, E'\n' order by t.relname)
  from (
    select c.relname,
           c.relname || '(' || string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod), ', ' order by a.attnum) || ')' as line
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where c.relkind in ('r', 'v', 'm')
      and c.relname <> 'ai_query_log'
      and has_table_privilege(c.oid, 'select')
      and (not c.relrowsecurity or exists (
        select 1 from pg_policy p where p.polrelid = c.oid and p.polcmd in ('r', '*')
      ))
    group by c.relname
  ) t
  where is_manager();
$$;

-- Runs one read-only SELECT as the caller and returns up to 200 rows as JSON.
--
-- Guards, in order:
--  * managers/admins only (for now);
--  * a single SELECT/WITH statement;
--  * a denylist of things that could step outside the caller's own RLS view:
--    set_config()/current_setting() (could rewrite request.jwt.claims and
--    impersonate another login), dynamic-SQL helpers (*_to_xml), system
--    catalogs (pg_*, information_schema — pg_stat_activity shows other
--    sessions' SQL), non-public schemas, U&"…" escaped identifiers;
--  * the transaction is switched to read-only before the query runs, so no
--    data-modifying CTE, function or extension (pg_net queues) can write;
--  * the `authenticated` role's own statement_timeout (8s) still applies.
-- Errors come back as {"error": …} instead of raising, so the model can
-- read the message and fix its SQL, and the log row survives.
create or replace function ai_run_query(query text)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  q      text := regexp_replace(btrim(coalesce(query, '')), ';\s*$', '');
  result jsonb;
begin
  if not is_manager() then
    raise exception 'The AI assistant is limited to managers';
  end if;
  if q !~* '^(select|with)\s' then
    return jsonb_build_object('error', 'Only a single SELECT (or WITH … SELECT) query is allowed');
  end if;
  if position(';' in q) > 0 then
    return jsonb_build_object('error', 'One statement at a time — remove the semicolons');
  end if;
  if q ~* '(set_config|current_setting|_to_xml|\mpg_|information_schema|\m(auth|storage|vault|net|cron|extensions|graphql|realtime|supabase_functions)\s*\.|u&|ai_run_query|\mdblink|\mlo_)' then
    return jsonb_build_object('error', 'That query uses a function, schema or catalog the assistant is not allowed to touch. Stick to the public tables listed in the schema.');
  end if;

  insert into ai_query_log (query) values (q);

  set local transaction_read_only = on;

  begin
    execute format(
      'select coalesce(jsonb_agg(r), ''[]''::jsonb) from (select * from (%s) as ai_q limit 200) as r',
      q
    ) into result;
  exception when others then
    return jsonb_build_object('error', sqlerrm);
  end;

  if length(result::text) > 60000 then
    return jsonb_build_object(
      'error', 'Result too large (' || jsonb_array_length(result) || ' rows, '
               || length(result::text) || ' chars). Select fewer columns, aggregate, or add a tighter LIMIT.'
    );
  end if;

  return jsonb_build_object('rows', result, 'row_count', jsonb_array_length(result), 'truncated_at_200', jsonb_array_length(result) = 200);
end;
$$;

revoke all on function ai_schema() from public, anon;
revoke all on function ai_run_query(text) from public, anon;
grant execute on function ai_schema() to authenticated;
grant execute on function ai_run_query(text) to authenticated;
