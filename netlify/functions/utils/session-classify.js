// Session-type classifier shared by mb-pt-analytics.js and
// scheduled-client-sync.js — kept in one place so the two never drift.
//
// SP check must come BEFORE PT — "Semi Private Personal Training" contains
// "personal train" so would wrongly match pt first.
export function classifySession(name = '') {
  const s = name.toLowerCase();
  if (/semi.?private/.test(s) || /\bsp\b/.test(s) || /\bsp\d/.test(s) || /small.?private/.test(s) || /partner.?train/.test(s) || /2:1/.test(s) || /3:1/.test(s)) return 'sp';
  if (/personal\s*train/.test(s) || /\bpt\b/.test(s) || /\bpt\d/.test(s) || /1[:\s]1/.test(s) || /1on1/.test(s) || /individual\s*(coach|program)/.test(s)) return 'pt';
  if (/open.?gym/.test(s) || /open.?train/.test(s) || /gym.?access/.test(s) || s === 'open gym') return 'gym';
  return 'other';
}
