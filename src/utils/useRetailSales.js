import { useState, useEffect, useCallback } from 'react';
import { format, subMonths, startOfMonth } from 'date-fns';
import { supabase } from '../lib/supabaseClient.js';

// How far back Retail Sales loads — enough for the month filter to reach a
// year back. Retail is a few dozen lines a month, so this stays small.
const MONTHS_BACK = 12;

/**
 * Retail line items (retail_sale_lines() RPC — reads the mb_sales mirror,
 * joined to retail_products' cost/flavour) plus saveProduct() for the
 * manager's cost/flavour edits. Each line is one Mindbody product id, which
 * is one flavour of an item.
 */
export function useRetailSales() {
  const [lines, setLines]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    setError(null);
    const from = format(startOfMonth(subMonths(new Date(), MONTHS_BACK)), 'yyyy-MM-dd');
    const to   = format(new Date(), 'yyyy-MM-dd');
    let all = [], offset = 0;
    // PostgREST caps responses at 1000 rows — page through.
    while (true) {
      const { data, error: err } = await supabase
        .rpc('retail_sale_lines', { p_from: from, p_to: to })
        .range(offset, offset + 999);
      if (err) { setError(err.message); setLoading(false); return; }
      all = all.concat(data || []);
      if (!data || data.length < 1000) break;
      offset += 1000;
    }
    setLines(all.map((l) => ({
      ...l,
      quantity:  Number(l.quantity),
      revenue:   Number(l.revenue),
      unit_cost: l.unit_cost == null ? null : Number(l.unit_cost),
    })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // `changes` per product id: { flavour?, unit_cost? }. Upserts on the
  // primary key, so only the fields passed are written.
  const saveProducts = useCallback(async (productIds, changes) => {
    const rows = productIds.map((id) => ({ mb_product_id: id, ...changes, updated_at: new Date().toISOString() }));
    const { error: err } = await supabase.from('retail_products').upsert(rows, { onConflict: 'mb_product_id' });
    if (err) throw new Error(err.message);
    await load();
  }, [load]);

  return { lines, loading, error, saveProducts };
}
