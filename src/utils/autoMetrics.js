// metric_keys whose metric_actuals are written by a sync, not by staff — no
// "Update metric" control, no manager total edits, and linked tasks don't add
// to them (the sync would overwrite it, or the sale would count twice).
//   attendance_visits, revenue — Mindbody, nightly (scheduled-daily-refresh.js)
//   sales — GHL Leads pipeline opportunities marked won, plus Mindbody sales
//           added at allocation or on the Acquisition tab (mindbody_sales)
//   leads — GHL Leads pipeline opportunities created (scheduled-ghl-sync.js)
//   churn — cancellation notices: GHL form tag (ghl-cancellation.js) or a
//           manager-confirmed Mindbody termination (TerminationReviewCard)
export const AUTO_METRIC_SOURCES = {
  attendance_visits: 'Mindbody',
  revenue: 'Mindbody',
  sales: 'GHL + Mindbody',
  leads: 'GHL',
  churn: 'GHL',
};

// Caption under the card title for the GHL-fed ones (the Mindbody ones say
// so elsewhere on their cards).
export const AUTO_METRIC_CAPTIONS = {
  sales: 'Auto: GHL deals marked won + Mindbody sales counted at allocation',
  leads: 'Auto: new GHL Leads Pipeline opportunities',
  churn: 'Auto: cancellation notices (GHL form, or confirmed Mindbody terminations)',
};

export const isAutoMetric = (metricKey) => metricKey in AUTO_METRIC_SOURCES;
