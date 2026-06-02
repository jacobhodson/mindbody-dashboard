/**
 * Scheduled daily cache refresh — runs at 2:00 PM UTC = midnight AEST (Sydney standard time).
 * During daylight saving (AEDT, UTC+11) this fires at 1 AM Sydney — close enough.
 *
 * Netlify picks up the schedule via the exported `config` object.
 */
import { getStore } from '@netlify/blobs';

const STORE_KEY = 'dashboard-snapshot';
const BASE_URL  = process.env.URL || 'https://newstrength-ops-dashboard.netlify.app';

export const config = {
  schedule: '0 14 * * *',  // 2pm UTC = midnight Sydney (AEST)
};

export const handler = async () => {
  console.log('[scheduled-daily-refresh] Starting at', new Date().toISOString());

  const [att, ana, pay, rev] = await Promise.allSettled([
    fetch(`${BASE_URL}/api/mb-attendance`).then((r) => r.json()),
    fetch(`${BASE_URL}/api/mb-client-analytics`).then((r) => r.json()),
    fetch(`${BASE_URL}/api/mb-payments`).then((r) => r.json()),
    fetch(`${BASE_URL}/api/mb-revenue`).then((r) => r.json()),
  ]);

  const snapshot = {
    attendance:      att.status === 'fulfilled' ? att.value : null,
    clientAnalytics: ana.status === 'fulfilled' ? ana.value : null,
    payments:        pay.status === 'fulfilled' ? pay.value : null,
    revenue:         rev.status === 'fulfilled' ? rev.value : null,
    cachedAt:        new Date().toISOString(),
  };

  const store = getStore('dashboard-cache');
  await store.set(STORE_KEY, JSON.stringify(snapshot));

  console.log('[scheduled-daily-refresh] Snapshot cached at', snapshot.cachedAt);
  return { statusCode: 200 };
};
