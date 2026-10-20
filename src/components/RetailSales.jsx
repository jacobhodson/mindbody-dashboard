import { useState, useMemo } from 'react';
import { format, subDays, parseISO } from 'date-fns';
import { ShoppingBag, ChevronRight, ChevronDown, ArrowUp, ArrowDown, Pencil, AlertTriangle } from 'lucide-react';
import { useRetailSales } from '../utils/useRetailSales.js';

function fmtAUD(n, cents = false) {
  if (n === null || n === undefined) return '–';
  const digits = cents ? 2 : 0;
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
const fmtPct = (n) => (n === null ? '–' : `${Math.round(n)}%`);

// Totals for a set of lines. Profit only counts lines with a cost set;
// `uncostedUnits` says how many units that left out, so a partial profit is
// flagged rather than passed off as the whole picture.
function summarise(lines) {
  let units = 0, revenue = 0, cost = 0, costedRevenue = 0, uncostedUnits = 0;
  for (const l of lines) {
    units += l.quantity;
    revenue += l.revenue;
    if (l.unit_cost === null) { uncostedUnits += l.quantity; continue; }
    cost += l.unit_cost * l.quantity;
    costedRevenue += l.revenue;
  }
  const hasCost = uncostedUnits < units;
  const profit = hasCost ? costedRevenue - cost : null;
  return {
    units, revenue, uncostedUnits,
    orders: new Set(lines.map((l) => l.sale_id)).size,
    cost: hasCost ? cost : null,
    profit,
    margin: hasCost && costedRevenue > 0 ? (profit / costedRevenue) * 100 : null,
  };
}

const flavourLabel = (l) => l.flavour || l.mb_flavour || `Product #${l.mb_product_id}`;

function Kpi({ label, value, sub, warn, loading }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-sm text-gray-600 mb-3">{label}</p>
      {loading ? (
        <div className="h-9 w-28 animate-pulse rounded-md bg-gray-200" />
      ) : (
        <>
          <p className="text-3xl font-bold tabular-nums text-gray-900 mb-1">{value}</p>
          {sub && <p className="text-xs text-gray-500">{sub}</p>}
          {warn && <p className="mt-1 flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="h-3 w-3" />{warn}</p>}
        </>
      )}
    </div>
  );
}

// Inline cost/flavour editor. `productIds` is one flavour, or every flavour
// of an item for the item-level "set cost for all".
function EditForm({ productIds, initialCost, initialFlavour, showFlavour, onSave, onCancel }) {
  const [cost, setCost]       = useState(initialCost ?? '');
  const [flavour, setFlavour] = useState(initialFlavour ?? '');
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (cost !== '' && (Number.isNaN(Number(cost)) || Number(cost) < 0)) { setErr('Cost must be 0 or more'); return; }
    setBusy(true);
    setErr(null);
    try {
      const changes = { unit_cost: cost === '' ? null : Number(cost) };
      if (showFlavour) changes.flavour = flavour.trim() || null;
      await onSave(productIds, changes);
      onCancel();
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  };

  const input = 'rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500';
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 py-1">
      {showFlavour && (
        <input value={flavour} onChange={(e) => setFlavour(e.target.value)} placeholder="Flavour" className={`${input} w-36`} autoFocus />
      )}
      <label className="flex items-center gap-1 text-xs text-gray-500">
        Unit cost $
        <input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} className={`${input} w-20 text-right`} autoFocus={!showFlavour} />
      </label>
      {productIds.length > 1 && <span className="text-[10px] text-gray-500">applies to all {productIds.length} flavours</span>}
      <button type="submit" disabled={busy} className="rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-emerald-500 disabled:opacity-50">Save</button>
      <button type="button" onClick={onCancel} className="text-[11px] text-gray-500 hover:text-gray-800">Cancel</button>
      {err && <span className="text-[11px] text-red-600">{err}</span>}
    </form>
  );
}

const COLUMNS = [
  { key: 'name',    label: 'Product', align: 'left' },
  { key: 'units',   label: 'Sold' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'cost',    label: 'Unit cost', sortable: false },
  { key: 'profit',  label: 'Profit' },
  { key: 'margin',  label: 'Margin', sortable: false },
];

function sortRows(rows, sort) {
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sort.key === 'name') return a.name.localeCompare(b.name) * dir;
    // Uncosted rows (profit null) sink to the bottom either way.
    const av = a.stats[sort.key], bv = b.stats[sort.key];
    if (av === null && bv === null) return a.name.localeCompare(b.name);
    if (av === null) return 1;
    if (bv === null) return -1;
    return (av - bv) * dir || a.name.localeCompare(b.name);
  });
}

// Unit cost cell: one value when every flavour shares it, else "varies".
function costCell(lines) {
  const costs = [...new Set(lines.map((l) => l.unit_cost))];
  if (costs.length === 1) return costs[0] === null ? <span className="text-amber-700">not set</span> : fmtAUD(costs[0], true);
  return costs.includes(null) ? <span className="text-amber-700">partly set</span> : 'varies';
}

/**
 * Finances → Retail Sales. Retail line items come from the Mindbody sales
 * mirror (retail_sale_lines() — see 20261021000000_retail_sales.sql); unit
 * costs and flavour labels are entered here by managers. KPIs are always the
 * last 30 days; the table has its own period filter.
 */
export default function RetailSales({ isManager }) {
  const { lines, loading, error, saveProducts } = useRetailSales();
  const [period, setPeriod]     = useState('last30');
  const [sort, setSort]         = useState({ key: 'revenue', dir: 'desc' });
  const [expanded, setExpanded] = useState(() => new Set());
  const [editing, setEditing]   = useState(null); // `item:<name>` | `product:<id>`

  const today   = format(new Date(), 'yyyy-MM-dd');
  const last30  = format(subDays(new Date(), 29), 'yyyy-MM-dd');
  const kpi     = useMemo(() => summarise(lines.filter((l) => l.sale_date >= last30 && l.sale_date <= today)), [lines, last30, today]);

  const months = useMemo(
    () => [...new Set(lines.map((l) => l.sale_date.slice(0, 7)))].sort().reverse(),
    [lines],
  );

  const periodLines = useMemo(() => {
    if (period === 'all') return lines;
    if (period === 'last30') return lines.filter((l) => l.sale_date >= last30 && l.sale_date <= today);
    return lines.filter((l) => l.sale_date.startsWith(period));
  }, [lines, period, last30, today]);

  // Item → flavour (Mindbody product id) rows. Items group on name; the
  // same name can appear under more than one product id (one per flavour).
  const items = useMemo(() => {
    const byName = new Map();
    for (const l of periodLines) {
      if (!byName.has(l.item_name)) byName.set(l.item_name, []);
      byName.get(l.item_name).push(l);
    }
    return [...byName.entries()].map(([name, itemLines]) => {
      const byProduct = new Map();
      for (const l of itemLines) {
        if (!byProduct.has(l.mb_product_id)) byProduct.set(l.mb_product_id, []);
        byProduct.get(l.mb_product_id).push(l);
      }
      const flavours = [...byProduct.entries()].map(([id, pl]) => ({
        id, name: flavourLabel(pl[0]), flavour: pl[0].flavour, mbFlavour: pl[0].mb_flavour,
        unitCost: pl[0].unit_cost, lines: pl, stats: summarise(pl),
      }));
      return { name, lines: itemLines, flavours, stats: summarise(itemLines) };
    });
  }, [periodLines]);

  const sorted = useMemo(() => sortRows(items, sort), [items, sort]);
  // Every product id seen per item across all loaded months — the item-level
  // "set cost for all flavours" must reach flavours not sold in this period.
  const productIdsByName = useMemo(() => {
    const m = new Map();
    for (const l of lines) {
      if (!m.has(l.item_name)) m.set(l.item_name, new Set());
      m.get(l.item_name).add(l.mb_product_id);
    }
    return m;
  }, [lines]);
  const totals = useMemo(() => summarise(periodLines), [periodLines]);

  const toggleSort = (key) => setSort((s) => (s.key === key
    ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  const toggleExpand = (name) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });

  const marginWarn = (s) => (s.uncostedUnits > 0 && s.units > 0
    ? `${s.uncostedUnits} of ${s.units} sold have no cost set — profit excludes them`
    : null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShoppingBag className="h-4 w-4 text-emerald-600" />
        <h3 className="text-sm font-semibold text-gray-900">Retail sales</h3>
        <span className="text-xs text-gray-500">From Mindbody · costs entered here</span>
      </div>

      {error && <p className="text-xs text-red-600">Could not load retail sales: {error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi label="Sales · last 30 days" value={kpi.units.toLocaleString()} sub={`${kpi.orders} orders`} loading={loading} />
        <Kpi label="Revenue · last 30 days" value={fmtAUD(kpi.revenue)} loading={loading} />
        <Kpi
          label="Profit · last 30 days"
          value={kpi.profit === null ? '–' : fmtAUD(kpi.profit)}
          sub={kpi.profit === null ? 'Add unit costs below to see profit' : `${fmtPct(kpi.margin)} margin`}
          warn={kpi.profit === null ? null : marginWarn(kpi)}
          loading={loading}
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <p className="text-xs text-gray-500">
            Click a product to see its flavours{isManager ? ', and the pencil to set unit costs' : ''}.
          </p>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-lg border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="last30">Last 30 days</option>
            {months.map((m) => <option key={m} value={m}>{format(parseISO(`${m}-01`), 'MMMM yyyy')}</option>)}
            <option value="all">All (last 12 months)</option>
          </select>
        </div>

        {loading ? (
          <div className="h-32 animate-pulse rounded-lg bg-gray-100" />
        ) : !sorted.length ? (
          <p className="py-8 text-center text-xs text-gray-500">No retail sales in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  {COLUMNS.map((c) => (
                    <th key={c.key} className={`py-2 px-2 font-medium whitespace-nowrap ${c.align === 'left' ? 'text-left pl-0' : 'text-right'}`}>
                      {c.sortable === false ? c.label : (
                        <button onClick={() => toggleSort(c.key)} className={`inline-flex items-center gap-0.5 hover:text-gray-900 ${sort.key === c.key ? 'text-gray-900' : ''}`}>
                          {c.label}
                          {sort.key === c.key && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((item) => {
                  const open = expanded.has(item.name);
                  const itemKey = `item:${item.name}`;
                  return (
                    <ItemRows
                      key={item.name}
                      item={item}
                      allProductIds={[...(productIdsByName.get(item.name) || [])]}
                      open={open}
                      sort={sort}
                      isManager={isManager}
                      editing={editing}
                      itemKey={itemKey}
                      onToggle={() => toggleExpand(item.name)}
                      onEdit={setEditing}
                      onSave={saveProducts}
                    />
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 font-semibold text-gray-900">
                  <td className="py-2 pr-2">Total</td>
                  <td className="px-2 py-2 text-right tabular-nums">{totals.units}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtAUD(totals.revenue, true)}</td>
                  <td />
                  <td className="px-2 py-2 text-right tabular-nums">{fmtAUD(totals.profit, true)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtPct(totals.margin)}</td>
                </tr>
              </tfoot>
            </table>
            {marginWarn(totals) && totals.profit !== null && (
              <p className="mt-2 flex items-center gap-1 text-[11px] text-amber-700"><AlertTriangle className="h-3 w-3" />{marginWarn(totals)}.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ItemRows({ item, allProductIds, open, sort, isManager, editing, itemKey, onToggle, onEdit, onSave }) {
  const s = item.stats;
  const flavours = sortRows(item.flavours, sort);
  const sharedCost = new Set(item.flavours.map((f) => f.unitCost)).size === 1 ? item.flavours[0].unitCost : null;

  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50">
        <td className="py-2 pr-2">
          <button onClick={onToggle} className="inline-flex items-center gap-1 font-medium text-gray-900">
            {open ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
            {item.name}
            <span className="font-normal text-gray-400">· {item.flavours.length} {item.flavours.length === 1 ? 'flavour' : 'flavours'}</span>
          </button>
        </td>
        <td className="px-2 py-2 text-right tabular-nums">{s.units}</td>
        <td className="px-2 py-2 text-right tabular-nums">{fmtAUD(s.revenue, true)}</td>
        <td className="px-2 py-2 text-right tabular-nums">
          <span className="inline-flex items-center gap-1">
            {costCell(item.lines)}
            {isManager && (
              <button onClick={() => onEdit(itemKey)} title="Set unit cost for all flavours" className="text-gray-400 hover:text-gray-700">
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </span>
        </td>
        <td className={`px-2 py-2 text-right tabular-nums ${s.profit < 0 ? 'text-red-600' : ''}`}>
          {fmtAUD(s.profit, true)}{s.profit !== null && s.uncostedUnits > 0 && <span className="text-amber-700" title={`${s.uncostedUnits} sold with no cost set`}>*</span>}
        </td>
        <td className="px-2 py-2 text-right tabular-nums">{fmtPct(s.margin)}</td>
      </tr>
      {editing === itemKey && (
        <tr className="border-b border-gray-100 bg-emerald-50/40">
          <td colSpan={6} className="px-2">
            <EditForm productIds={allProductIds} initialCost={sharedCost} showFlavour={false} onSave={onSave} onCancel={() => onEdit(null)} />
          </td>
        </tr>
      )}
      {open && flavours.map((f) => {
        const key = `product:${f.id}`;
        const fs = f.stats;
        return (
          <FlavourRow
            key={f.id}
            f={f}
            fs={fs}
            isManager={isManager}
            isEditing={editing === key}
            onEdit={() => onEdit(key)}
            onCancel={() => onEdit(null)}
            onSave={onSave}
          />
        );
      })}
    </>
  );
}

function FlavourRow({ f, fs, isManager, isEditing, onEdit, onCancel, onSave }) {
  return (
    <>
      <tr className="border-b border-gray-100 bg-gray-50/60 text-gray-700">
        <td className="py-1.5 pl-6 pr-2">
          <span className="inline-flex items-center gap-1">
            {f.name}
            {!f.flavour && !f.mbFlavour && <span className="text-[10px] text-gray-400">(name it with the pencil)</span>}
          </span>
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">{fs.units}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{fmtAUD(fs.revenue, true)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">
          <span className="inline-flex items-center gap-1">
            {f.unitCost === null ? <span className="text-amber-700">not set</span> : fmtAUD(f.unitCost, true)}
            {isManager && (
              <button onClick={onEdit} title="Edit flavour name and unit cost" className="text-gray-400 hover:text-gray-700">
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </span>
        </td>
        <td className={`px-2 py-1.5 text-right tabular-nums ${fs.profit < 0 ? 'text-red-600' : ''}`}>{fmtAUD(fs.profit, true)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{fmtPct(fs.margin)}</td>
      </tr>
      {isEditing && (
        <tr className="border-b border-gray-100 bg-emerald-50/40">
          <td colSpan={6} className="pl-6 pr-2">
            <EditForm
              productIds={[f.id]}
              initialCost={f.unitCost}
              initialFlavour={f.flavour ?? f.mbFlavour ?? ''}
              showFlavour
              onSave={onSave}
              onCancel={onCancel}
            />
          </td>
        </tr>
      )}
    </>
  );
}
