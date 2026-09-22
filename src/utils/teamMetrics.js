// Shared metric definitions for the Team tab's "By Metric" cross-coach
// comparison — one source of truth for label/formatting so TeamByMetric.jsx
// and anywhere else that lists these stays in sync.
export const TEAM_METRICS = [
  { key: 'ler',          label: 'LER',              format: (n) => (n == null ? '–' : `${n.toFixed(2)}x`) },
  { key: 'ptRevenue',    label: 'PT Revenue',       format: (n) => (n == null ? '–' : `$${Math.round(n).toLocaleString('en-AU')}`) },
  { key: 'ptSessions',   label: 'PT Sessions',      format: (n) => (n == null ? '–' : Math.round(n).toLocaleString('en-AU')) },
  { key: 'groupRevenue', label: 'Group Revenue',    format: (n) => (n == null ? '–' : `$${Math.round(n).toLocaleString('en-AU')}`) },
  { key: 'groupClasses', label: 'Group Classes',    format: (n) => (n == null ? '–' : Math.round(n).toLocaleString('en-AU')) },
  { key: 'grossRevenue', label: 'Total Revenue',    format: (n) => (n == null ? '–' : `$${Math.round(n).toLocaleString('en-AU')}`) },
  { key: 'taskRate',     label: 'Task Completion',  format: (n) => (n == null ? '–' : `${Math.round(n)}%`) },
];

// LER colour bands, used everywhere an LER figure is shown (Finance LER table,
// Team tab): 3x or more is green, 2.5x up to 3x is orange, under 2.5x is red.
// Judged on the real value, not the rounded display, so 2.96x reads orange.
export const LER_GREEN_AT  = 3;
export const LER_ORANGE_AT = 2.5;
export function lerTone(n) {
  if (n == null || Number.isNaN(Number(n))) return '';
  return n >= LER_GREEN_AT ? 'text-emerald-600' : n >= LER_ORANGE_AT ? 'text-orange-600' : 'text-red-600';
}
export const LER_KEY_TEXT = 'Colour key: green 3x+, orange 2.5x to under 3x, red under 2.5x.';

// Simple mean of the values that exist — null/undefined months (a coach who
// hadn't started yet, a month with no tasks assigned) are skipped rather than
// dragging the average down as zeros. null when there's nothing to average.
export function mean(values) {
  const present = values.filter((v) => v != null && !Number.isNaN(v));
  return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
}

// A coach-month with no revenue, no sessions or classes and no wage is "wasn't
// working yet" (e.g. someone who joined in August has all-zero rows for Jan–
// Jul), not a real $0 month — so it's treated as no data and skipped from
// averages rather than dragging them down. A month with a wage but no revenue
// still counts: they were paid and produced nothing.
export function hasActivity(row) {
  if (!row) return false;
  return Number(row.pt_revenue) > 0 || Number(row.group_revenue) > 0
    || Number(row.pt_sessions) > 0 || Number(row.group_classes) > 0
    || row.wages != null;
}

// Reads the relevant field off one ler_monthly row for a given metric key —
// everything except 'taskRate', which isn't in that table (see
// useTeamTaskStats.js instead).
export function valueForMetric(metricKey, snapshotRow) {
  if (!snapshotRow || !hasActivity(snapshotRow)) return null;
  switch (metricKey) {
    case 'ler':          return snapshotRow.ler;
    case 'ptRevenue':    return snapshotRow.pt_revenue;
    case 'ptSessions':   return snapshotRow.pt_sessions;
    case 'groupRevenue': return snapshotRow.group_revenue;
    case 'groupClasses': return snapshotRow.group_classes;
    case 'grossRevenue': return Number(snapshotRow.pt_revenue || 0) + Number(snapshotRow.group_revenue || 0);
    default:             return null;
  }
}
