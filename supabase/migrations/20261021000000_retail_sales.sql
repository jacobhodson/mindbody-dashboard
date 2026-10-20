-- ============================================================================
-- Retail sales (Finances tab → RetailSales.jsx).
--   retail_products   — manager-entered unit cost + flavour label per
--                       Mindbody product id. Each flavour of an item is its
--                       own Mindbody product id (e.g. True Protein WPI has
--                       ten), so cost and flavour live at that level.
--   retail_sale_lines — every retail line item from the mb_sales mirror in a
--                       date range, joined to its cost and flavour. mb_* is
--                       service-role only, so this is security definer and
--                       checks is_manager() itself (Finances is manager-only).
-- Retail = a non-service item with a real (positive) CategoryId; the negative
-- categories are memberships/contracts that show up as non-service only when
-- returned. Returned lines are excluded.
-- Flavour falls back to Mindbody's own product Color/Size names, mirrored
-- nightly into mb_reference key 'products' (scheduled-mb-mirror.js).
-- ============================================================================

create table retail_products (
  mb_product_id integer primary key,
  flavour       text,
  unit_cost     numeric(10, 2) check (unit_cost is null or unit_cost >= 0),
  updated_at    timestamptz not null default now()
);
alter table retail_products enable row level security;
create policy "managers read retail products" on retail_products
  for select using (is_manager());
create policy "managers insert retail products" on retail_products
  for insert with check (is_manager());
create policy "managers update retail products" on retail_products
  for update using (is_manager()) with check (is_manager());

create or replace function retail_sale_lines(p_from date, p_to date)
returns table (
  sale_id         text,
  sale_date       date,
  mb_product_id   integer,
  item_name       text,
  flavour         text,
  mb_flavour      text,
  quantity        numeric,
  revenue         numeric,
  unit_cost       numeric
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_manager() then
    raise exception 'managers only';
  end if;

  return query
  with products as (
    select (p->>'ProductId')::integer as pid,
           nullif(concat_ws(' · ',
             nullif(trim(p->'Color'->>'Name'), ''),
             nullif(trim(p->'Size'->>'Name'), '')), '') as mb_flavour
    from mb_reference r, jsonb_array_elements(r.raw) p
    where r.key = 'products' and p->>'ProductId' ~ '^\d+$'
  )
  select s.id,
         s.local_ts::date,
         (i->>'Id')::integer,
         trim(i->>'Description'),
         rp.flavour,
         pr.mb_flavour,
         coalesce((i->>'Quantity')::numeric, 1),
         coalesce((i->>'TotalAmount')::numeric, 0),
         rp.unit_cost
  from mb_sales s
  cross join lateral jsonb_array_elements(s.raw->'PurchasedItems') i
  left join retail_products rp on rp.mb_product_id = (i->>'Id')::integer
  left join products pr on pr.pid = (i->>'Id')::integer
  where s.local_ts >= p_from
    and s.local_ts < p_to + 1
    and i->>'IsService' = 'false'
    and coalesce((i->>'CategoryId')::integer, 0) > 0
    and coalesce((i->>'Returned')::boolean, false) = false
    and i->>'Id' ~ '^\d+$';
end;
$$;
revoke all on function retail_sale_lines(date, date) from public, anon;
grant execute on function retail_sale_lines(date, date) to authenticated;
