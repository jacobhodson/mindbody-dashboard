// Shared metric definitions for the Team tab's "By Metric" cross-coach
// comparison — one source of truth for label/formatting so TeamByMetric.jsx
// and anywhere else that lists these stays in sync.
export const TEAM_METRICS = [
  { key: 'ler',          label: 'LER',              format: (n) => (n == null ? '–' : `${n.toFixed(2)}x`) },
  { key: 'ptRevenue',    label: 'PT Revenue',       format: (n) => (n == null ? '–' : `$${Math.round(n).toLocaleString('en-AU')}`) },
  { key: 'ptSessions',   label: 'PT Sessions',      format: (n) => (n == null ? '–' : Math.round(n).toLocaleString('en-AU')) },
  { key: 'groupRevenue', label: 'Group Revenue',    format: (n) => (n == null ? '–' : `$${Math.round(n).toLocaleString('en-AU')}`) },
  { key: 'groupClasses', label: 'Group Classes',    format: (n) => (n == null ? '–' : Math.round(n).toLocaleString('en-AU')) },
  { key: 'taskRate',     label: 'Task Completion',  format: (n) => (n == null ? '–' : `${Math.round(n)}%`) },
];

// Simple mean of the values that exist — null/undefined months (a coach who
// hadn't started yet, a month with no tasks assigned) are skipped rather than
// dragging the average down as zeros. null when there's nothing to average.
export function mean(values) {
  const present = values.filter((v) => v != null && !Number.isNaN(v));
  return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
}

// Reads the relevant field off one ler_monthly row for a given metric key —
// everything except 'taskRate', which isn't in that table (see
// useTeamTaskStats.js instead).
export function valueForMetric(metricKey, snapshotRow) {
  if (!snapshotRow) return null;
  switch (metricKey) {
    case 'ler':          return snapshotRow.ler;
    case 'ptRevenue':    return snapshotRow.pt_revenue;
    case 'ptSessions':   return snapshotRow.pt_sessions;
    case 'groupRevenue': return snapshotRow.group_revenue;
    case 'groupClasses': return snapshotRow.group_classes;
    default:             return null;
  }
}
