// metric_keys whose metric_actuals are written by a sync, not by staff — no
// "Update metric" control, no manager total edits, and linked tasks don't add
// to them (the sync would overwrite it, or the sale would count twice).
//   attendance_visits, revenue — Mindbody, nightly (scheduled-daily-refresh.js)
//   sales — GHL Leads pipeline opportunities marked won (scheduled-ghl-sync.js)
export const AUTO_METRIC_SOURCES = {
  attendance_visits: 'Mindbody',
  revenue: 'Mindbody',
  sales: 'GHL',
};

export const isAutoMetric = (metricKey) => metricKey in AUTO_METRIC_SOURCES;
