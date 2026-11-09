// Settings → Attendance rules (table attendance_type_rules), shared by
// mb-pt-analytics.js (Personal Training tab) and mb-attendance.js (Group
// Training attendance). A row exists only for a type a manager changed; no
// row = the built-in default, so with an empty table nothing changes.
import { createClient } from '@supabase/supabase-js';
import { classifySession } from './session-classify.js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// { appointment: Map(typeId -> included), class: Map(typeId -> included) }
export async function loadAttendanceRules() {
  const rules = { appointment: new Map(), class: new Map() };
  const { data, error } = await supabase.from('attendance_type_rules').select('kind, type_id, included');
  if (error) {
    // Fall back to defaults rather than failing the whole tab.
    console.warn('[attendance-rules] could not load, using defaults:', error.message);
    return rules;
  }
  for (const r of data || []) rules[r.kind]?.set(String(r.type_id), r.included);
  return rules;
}

// PT-tab category for an appointment: 'pt' | 'sp' | 'gym' | 'other'.
// Ticked in Settings → keeps its pt/sp classification, or 'pt' if the name
// doesn't read as either. Unticked → 'other', so it drops out of every PT
// count. Untouched → classifySession() as before.
export function ptCategory(rules, typeId, name) {
  const auto = classifySession(name || '');
  const rule = rules.appointment.get(String(typeId));
  if (rule === undefined) return auto;
  if (!rule) return 'other';
  return auto === 'pt' || auto === 'sp' ? auto : 'pt';
}

// Whether a class counts in Group Training attendance (default: yes).
export function classCounts(rules, cls) {
  const id = cls?.ClassDescription?.Id;
  if (id == null) return true;
  return rules.class.get(String(id)) !== false;
}
