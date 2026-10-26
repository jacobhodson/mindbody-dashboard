// metric_keys whose metric_actuals are written by a sync, not by staff — no
// "Update metric" control, no manager total edits, and linked tasks don't add
// to them (the sync would overwrite it, or the sale would count twice).
//   attendance_visits, revenue — Mindbody, nightly (scheduled-daily-refresh.js)
//   sales — GHL Leads pipeline opportunities marked won (scheduled-ghl-sync.js)
//   leads — GHL Leads pipeline opportunities created (scheduled-ghl-sync.js)
//   churn — cancellation notices: GHL form tag (ghl-cancellation.js) or a
//           manager-confirmed Mindbody termination (TerminationReviewCard)
export const AUTO_METRIC_SOURCES = {
  attendance_visits: 'Mindbody',
  revenue: 'Mindbody',
  sales: 'GHL',
  leads: 'GHL',
  churn: 'GHL',
};

// Caption under the card title for the GHL-fed ones (the Mindbody ones say
// so elsewhere on their cards).
export const AUTO_METRIC_CAPTIONS = {
  sales: 'Auto: GHL deals marked won',
  leads: 'Auto: new GHL Leads Pipeline opportunities',
  churn: 'Auto: cancellation notices (GHL form, or confirmed Mindbody terminations)',
};

export const isAutoMetric = (metricKey) => metricKey in AUTO_METRIC_SOURCES;
