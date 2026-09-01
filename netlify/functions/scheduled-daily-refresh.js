/**
 * Scheduled daily cache refresh — runs at 2:00 PM UTC = midnight AEST (Sydney standard time).
 * During daylight saving (AEDT, UTC+11) this fires at 1 AM Sydney — close enough.
 *
 * Calls Mindbody directly (same logic as the individual endpoints) rather than
 * HTTP-calling the other functions, which would create a timeout chain.
 */
import { getStore } from '@netlify/blobs';
import { createClient } from '@supabase/supabase-js';
import { getStaffToken, mbGet, ok, err } from './utils/mb-auth.js';
import {
  subDays, format, parseISO,
  startOfWeek, endOfWeek, subWeeks,
  startOfMonth, endOfMonth, subMonths,
  eachDayOfInterval,
} from 'date-fns';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export const config = {
  schedule: '0 14 * * *',  // 2pm UTC = midnight Sydney (AEST)
};

// ─── Minimal versions of each data fetch ───────────────────────────────────

async function fetchAttendance(token, daysBack = 6) {
  const now   = new Date();
  const start = subDays(now, daysBack);
  const startStr = format(start, "yyyy-MM-dd'T'00:00:00");
  const endStr   = format(now,   "yyyy-MM-dd'T'23:59:59");

  let allClasses = [], offset = 0;
  while (true) {
    const data = await mbGet('/class/classes', token, { StartDateTime: startStr, EndDateTime: endStr, Limit: 200, Offset: offset });
    allClasses = allClasses.concat(data.Classes || []);
    if ((data.Classes || []).length < 200 || offset >= 1800) break;
    offset += 200;
  }

  const byDate = {}, byDow = {};
  for (const cls of allClasses) {
    if (!cls.StartDateTime) continue;
    const d = parseISO(cls.StartDateTime);
    byDate[format(d, 'yyyy-MM-dd')] = (byDate[format(d, 'yyyy-MM-dd')] || 0) + (cls.TotalBooked || 0);
    byDow[format(d, 'EEE')]         = (byDow[format(d, 'EEE')]         || 0) + (cls.TotalBooked || 0);
  }

  const days  = eachDayOfInterval({ start, end: now });
  const daily = days.map((d) => ({ date: format(d, 'yyyy-MM-dd'), label: format(d, 'MMM d'), visits: byDate[format(d, 'yyyy-MM-dd')] || 0 }));
  const total = daily.reduce((s, d) => s + d.visits, 0);
  const peak  = daily.reduce((m, d) => d.visits > m.visits ? d : m, { visits: 0, label: '–' });

  return {
    period: '7days', daily,
    byDow: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day) => ({ day, visits: byDow[day] || 0 })),
    stats: { total7: total, avgDaily: Math.round(total / daily.length), peakDay: peak.label, peakVisits: peak.visits, dateRange: `${format(start,'dd MMM')} – ${format(now,'dd MMM yyyy')}` },
  };
}

async function fetchRevenue(token) {
  const now = new Date();
  const periods = {
    thisWeek:  { start: startOfWeek(now, { weekStartsOn: 1 }), end: now },
    lastWeek:  { start: startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }), end: endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }) },
    thisMonth: { start: startOfMonth(now), end: now },
    lastMonth: { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) },
  };

  let allSales = [], offset = 0;
  const fetchStart = format(periods.lastMonth.start, "yyyy-MM-dd'T'00:00:00");
  const fetchEnd   = format(now, "yyyy-MM-dd'T'23:59:59");
  while (true) {
    const data = await mbGet('/sale/sales', token, { StartSaleDateTime: fetchStart, EndSaleDateTime: fetchEnd, Limit: 200, Offset: offset });
    allSales = allSales.concat(data.Sales || []);
    if ((data.Sales || []).length < 200 || offset >= 1800) break;
    offset += 200;
  }

  const totals = { thisWeek: 0, lastWeek: 0, thisMonth: 0, lastMonth: 0 };
  const counts = { thisWeek: 0, lastWeek: 0, thisMonth: 0, lastMonth: 0 };
  for (const sale of allSales) {
    if (!sale.SaleDate) continue;
    const amount = (sale.PurchasedItems || []).reduce((s, i) => i.Returned ? s : s + (i.TotalAmount || 0), 0);
    if (amount <= 0) continue;
    for (const [key, range] of Object.entries(periods)) {
      const d = parseISO(sale.SaleDate);
      if (d >= range.start && d <= range.end) { totals[key] += amount; counts[key]++; }
    }
  }
  const r = (n) => Math.round(n * 100) / 100;
  return {
    thisWeek:  { total: r(totals.thisWeek),  count: counts.thisWeek  },
    lastWeek:  { total: r(totals.lastWeek),  count: counts.lastWeek  },
    thisMonth: { total: r(totals.thisMonth), count: counts.thisMonth },
    lastMonth: { total: r(totals.lastMonth), count: counts.lastMonth },
  };
}

// Daily revenue — mb-revenue.js/fetchRevenue() above only returns 4 rolling
// windows, no true per-day breakdown. One paginated query across the whole
// range, bucketed by calendar day client-side (same pagination pattern as
// fetchRevenue), so a 30-day backfill is 1 query, not 30.
async function fetchDailyRevenue(token, daysBack) {
  const now   = new Date();
  const start = subDays(now, daysBack);

  let allSales = [], offset = 0;
  const fetchStart = format(start, "yyyy-MM-dd'T'00:00:00");
  const fetchEnd   = format(now,   "yyyy-MM-dd'T'23:59:59");
  while (true) {
    const data = await mbGet('/sale/sales', token, { StartSaleDateTime: fetchStart, EndSaleDateTime: fetchEnd, Limit: 200, Offset: offset });
    allSales = allSales.concat(data.Sales || []);
    if ((data.Sales || []).length < 200 || offset >= 1800) break;
    offset += 200;
  }

  const byDate = {};
  for (const sale of allSales) {
    if (!sale.SaleDate) continue;
    const amount = (sale.PurchasedItems || []).reduce((s, i) => i.Returned ? s : s + (i.TotalAmount || 0), 0);
    if (amount <= 0) continue;
    const dateStr = format(parseISO(sale.SaleDate), 'yyyy-MM-dd');
    byDate[dateStr] = (byDate[dateStr] || 0) + amount;
  }
  for (const k of Object.keys(byDate)) byDate[k] = Math.round(byDate[k] * 100) / 100;
  return byDate; // { 'yyyy-MM-dd': total }
}

// Upserts studio-wide (staff_id null) metric rows via manual check-then-
// write. There IS a partial unique index enforcing (metric_key, metric_date)
// for staff_id-null rows (20260901000004_metric_actuals_uniqueness_fix.sql),
// but Postgres/PostgREST can't use a *partial* index as an ON CONFLICT
// arbiter without the client specifying the index's WHERE predicate, which
// supabase-js's .upsert() has no way to pass — hence doing it by hand
// instead of relying on upsert/onConflict. The partial index still backstops
// this against any race.
async function upsertMetrics(rows) {
  for (const row of rows) {
    const { data: existing, error: selErr } = await supabase
      .from('metric_actuals').select('id')
      .eq('metric_key', row.metric_key).eq('metric_date', row.metric_date)
      .is('staff_id', null).maybeSingle();
    if (selErr) return { error: selErr };

    const { error: writeErr } = existing
      ? await supabase.from('metric_actuals')
          .update({ value: row.value, source: 'mindbody', synced_at: new Date().toISOString() })
          .eq('id', existing.id)
      : await supabase.from('metric_actuals')
          .insert({ ...row, staff_id: null, source: 'mindbody' });
    if (writeErr) return { error: writeErr };
  }
  return { error: null };
}

const BASE_URL = process.env.URL || 'http://localhost:8888';

// ─── Handler ────────────────────────────────────────────────────────────────
//
// Normal cron trigger (no query params): syncs yesterday's attendance +
// revenue into metric_actuals, plus the existing Blobs cache refresh.
//
// Manual HTTP invocation with ?backfillDays=N: one-time backfill of the last
// N complete days into metric_actuals. The cron trigger never passes query
// params, so this path only ever runs when deliberately curled.

export const handler = async (event) => {
  const backfillDays = Number(event?.queryStringParameters?.backfillDays) || 0;
  console.log('[scheduled-daily-refresh] Starting at', new Date().toISOString(), backfillDays ? `(backfill ${backfillDays}d)` : '');

  try {
    const token = await getStaffToken();

    if (backfillDays > 0) {
      // eachDayOfInterval/the sales window are both inclusive of "now", so
      // daysBack=backfillDays already yields backfillDays+1 days (today
      // included) — excluding today below leaves exactly backfillDays
      // complete days, no extra +1 needed here.
      const [att, dailyRev] = await Promise.all([
        fetchAttendance(token, backfillDays),
        fetchDailyRevenue(token, backfillDays),
      ]);
      const today = format(new Date(), 'yyyy-MM-dd');
      const rows = [];
      for (const d of att.daily) {
        if (d.date === today) continue;
        rows.push({ metric_key: 'attendance_visits', metric_date: d.date, value: d.visits });
      }
      for (const [dateStr, total] of Object.entries(dailyRev)) {
        if (dateStr === today) continue;
        rows.push({ metric_key: 'revenue', metric_date: dateStr, value: total });
      }
      const { error } = await upsertMetrics(rows);
      if (error) return err(error.message);
      return ok({ backfilled: rows.length, days: backfillDays });
    }

    // Attendance + revenue: fetched inline (simpler logic, avoids HTTP chain)
    // clientAnalytics + payments: delegate to their own endpoints (complex N+1 logic)
    const [att, rev, ana, pay] = await Promise.allSettled([
      fetchAttendance(token),
      fetchRevenue(token),
      fetch(`${BASE_URL}/api/mb-client-analytics`).then(r => r.json()),
      fetch(`${BASE_URL}/api/mb-payments`).then(r => r.json()),
    ]);

    const snapshot = {
      attendance:      att.status === 'fulfilled' ? att.value : null,
      revenue:         rev.status === 'fulfilled' ? rev.value : null,
      clientAnalytics: ana.status === 'fulfilled' ? ana.value : null,
      payments:        pay.status === 'fulfilled' ? pay.value : null,
      cachedAt:        new Date().toISOString(),
    };

    // Blobs cache write and the metric_actuals sync are independent — Blobs
    // is currently broken (MissingBlobsEnvironmentError, a pre-existing
    // issue), and it must not take the metric sync down with it if it throws.
    try {
      const store = getStore('dashboard-cache');
      await store.set('dashboard-snapshot', JSON.stringify(snapshot));
    } catch (blobsErr) {
      console.error('[scheduled-daily-refresh] Blobs cache write failed:', blobsErr.message);
    }

    // Sync yesterday's completed-day numbers into metric_actuals.
    if (att.status === 'fulfilled') {
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
      const yAtt = att.value.daily.find((d) => d.date === yesterday);
      const dailyRev = await fetchDailyRevenue(token, 2).catch(() => ({}));
      const rows = [];
      if (yAtt) rows.push({ metric_key: 'attendance_visits', metric_date: yesterday, value: yAtt.visits });
      if (dailyRev[yesterday] != null) rows.push({ metric_key: 'revenue', metric_date: yesterday, value: dailyRev[yesterday] });
      const { error: syncErr } = await upsertMetrics(rows);
      if (syncErr) console.error('[scheduled-daily-refresh] metric_actuals sync failed:', syncErr.message);
    }

    console.log(
      '[scheduled-daily-refresh] Done.',
      `att=${att.status} rev=${rev.status} ana=${ana.status} pay=${pay.status}`,
    );
  } catch (e) {
    console.error('[scheduled-daily-refresh] Failed:', e.message);
    return err(e.message);
  }
  return { statusCode: 200 };
};
