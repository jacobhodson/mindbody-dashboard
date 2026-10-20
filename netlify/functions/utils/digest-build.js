/**
 * Builds the weekly email digest — data loading (one bulk read per table,
 * service role) and the per-person email (subject / HTML / plain text).
 * Used by weekly-digest.js for both the Sunday send and manager previews.
 *
 * Everything in a person's digest is their own (tasks assigned to them or
 * personal tasks they own, rocks they own) except the Noticeboard, which is
 * for everyone, and the Scoreboard, which only managers get.
 */

export const DASHBOARD_URL = process.env.URL || 'https://newstrength-ops-dashboard.netlify.app';
const TZ = 'Australia/Sydney';

// ── dates (all yyyy-MM-dd, Sydney local) ────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
export function sydneyNow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24, weekday: parts.weekday };
}
const toDate = (iso) => new Date(`${iso}T00:00:00Z`);
const toIso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const addDaysIso = (iso, n) => { const d = toDate(iso); d.setUTCDate(d.getUTCDate() + n); return toIso(d); };
// The coming Sunday (today if it is Sunday) — previews use this so they show
// exactly what that Sunday's send will contain.
export const upcomingSunday = (iso) => addDaysIso(iso, (7 - toDate(iso).getUTCDay()) % 7);
const mondayOf = (iso) => { const d = toDate(iso); return addDaysIso(iso, -((d.getUTCDay() + 6) % 7)); };
const fmt = (iso, opts) => toDate(iso).toLocaleDateString('en-AU', { timeZone: 'UTC', ...opts });
const fmtShort = (iso) => fmt(iso, { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDayMonth = (iso) => fmt(iso, { day: 'numeric', month: 'short' });

/**
 * The digest's windows. It looks ahead to the Mon–Sun week containing
 * tomorrow (so on a Sunday evening: the week starting the next day), and the
 * scoreboard looks back at the full week before that plus month-to-date.
 */
export function digestWindows(today) {
  const weekStart = mondayOf(addDaysIso(today, 1));
  const weekEnd = addDaysIso(weekStart, 6);
  const lastStart = addDaysIso(weekStart, -7);
  const lastEnd = addDaysIso(weekStart, -1);
  const monthStart = `${lastEnd.slice(0, 7)}-01`;
  return { today, weekStart, weekEnd, lastStart, lastEnd, monthStart };
}

// ── data ────────────────────────────────────────────────────────────────────
export async function loadDigestData(supabase, win) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const q = async (p) => { const { data, error } = await p; if (error) throw new Error(error.message); return data || []; };

  const [staff, prefs, tasks, rocks, notices, targets, notifs] = await Promise.all([
    q(supabase.from('staff').select('id, full_name, email, role, active').eq('active', true)),
    q(supabase.from('digest_preferences').select('*')),
    q(supabase.from('task_templates').select('*').eq('active', true)),
    q(supabase.from('rocks').select('*').neq('status', 'done')),
    q(supabase.from('notices').select('*').eq('active', true).order('created_at', { ascending: false })),
    q(supabase.from('targets').select('*').or(`effective_to.is.null,effective_to.gte.${win.lastStart}`)),
    q(supabase.from('notifications').select('recipient_staff_id, title, body, created_at').eq('kind', 'task_assigned').gte('created_at', sevenDaysAgo)),
  ]);

  const onceIds = tasks.filter((t) => t.cadence === 'once' && t.due_date).map((t) => t.id);
  const completions = onceIds.length
    ? await q(supabase.from('task_completions').select('template_id, period_start').in('template_id', onceIds))
    : [];
  const metricKeys = [...new Set(targets.map((t) => t.metric_key))];
  const from = win.monthStart < win.lastStart ? win.monthStart : win.lastStart;
  const actuals = metricKeys.length
    ? await q(supabase.from('metric_actuals').select('metric_key, metric_date, value')
      .in('metric_key', metricKeys).gte('metric_date', from).lte('metric_date', win.lastEnd))
    : [];

  const done = new Set(completions.map((c) => `${c.template_id}|${c.period_start}`));
  return {
    staff, tasks, rocks, notices, targets, actuals, notifs,
    prefOff: new Set(prefs.filter((p) => !p.weekly_digest).map((p) => p.staff_id)),
    isDone: (t) => done.has(`${t.id}|${t.due_date}`),
    nameById: Object.fromEntries(staff.map((s) => [s.id, s.full_name])),
  };
}

// ── per-person content ──────────────────────────────────────────────────────
const isMine = (t, sid) => t.assigned_staff_id === sid || (!t.assigned_staff_id && t.scope === 'individual' && t.owner_staff_id === sid);
const ROCK_STATUS = { planned: 'Planned', doing: 'Doing', ongoing: 'Ongoing', on_hold: 'On hold' };

export function digestContent(person, data, win) {
  const isManager = person.role === 'manager' || person.role === 'admin';
  const rockTitle = Object.fromEntries(data.rocks.map((r) => [r.id, r.title]));
  const where = (t) => (t.rock_id ? `Rock: ${rockTitle[t.rock_id] || 'rock'}` : t.meeting_id ? 'Meeting to-do' : null);

  const mineOnce = data.tasks.filter((t) => t.cadence === 'once' && t.due_date && isMine(t, person.id) && !data.isDone(t));
  const overdue = mineOnce.filter((t) => t.due_date < win.weekStart).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const dueThisWeek = mineOnce.filter((t) => t.due_date >= win.weekStart && t.due_date <= win.weekEnd).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const recurring = data.tasks.filter((t) => t.cadence !== 'once' && isMine(t, person.id)).length;
  const newlyAssigned = data.notifs.filter((n) => n.recipient_staff_id === person.id);

  const rocks = data.rocks.filter((r) => r.owner_staff_id === person.id).map((r) => {
    const rt = data.tasks.filter((t) => t.rock_id === r.id && t.cadence === 'once');
    return { ...r, openTasks: rt.filter((t) => !data.isDone(t)).length, totalTasks: rt.length };
  });

  const notices = data.notices.map((n) => ({
    ...n, author: data.nameById[n.created_by] || null, isNew: Date.now() - new Date(n.created_at).getTime() < 7 * 86400000,
  }));

  let scoreboard = null;
  if (isManager) {
    const sum = (key, from, to) => data.actuals
      .filter((a) => a.metric_key === key && a.metric_date >= from && a.metric_date <= to)
      .reduce((s, a) => s + Number(a.value || 0), 0);
    const byKey = {};
    for (const t of data.targets) {
      if (t.scope !== 'team' || (t.effective_from && t.effective_from > win.lastEnd)) continue;
      const m = (byKey[t.metric_key] ||= { key: t.metric_key, label: t.label, direction: t.direction || 'at_least' });
      if (t.cadence === 'weekly') m.weekly = Number(t.target_value);
      if (t.cadence === 'monthly') m.monthly = Number(t.target_value);
    }
    scoreboard = Object.values(byKey).map((m) => {
      const hit = (actual, target) => (target == null ? null : m.direction === 'at_most' ? actual <= target : actual >= target);
      const week = sum(m.key, win.lastStart, win.lastEnd);
      const month = sum(m.key, win.monthStart, win.lastEnd);
      return { ...m, week, month, weekHit: hit(week, m.weekly), monthHit: hit(month, m.monthly) };
    }).sort((a, b) => a.label.localeCompare(b.label));
  }

  return { person, isManager, overdue, dueThisWeek, recurring, newlyAssigned, rocks, notices, scoreboard, where };
}

// ── rendering ───────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Same **bold** / *italic* / _underline_ markers as the dashboard's richText.js.
const rich = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\*(.+?)\*/g, '<em>$1</em>')
  .replace(/_(.+?)_/g, '<u>$1</u>')
  .replace(/\n/g, '<br>');
const plain = (s) => String(s ?? '').replace(/\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_/g, '$1$2$3');
const num = (n) => (Number.isInteger(n) ? n.toLocaleString('en-AU') : n.toFixed(1));

const C = { green: '#059669', ink: '#111827', muted: '#6b7280', line: '#e5e7eb', red: '#dc2626', amber: '#b45309', bg: '#f3f4f6' };
const section = (title, inner) => `
  <tr><td style="padding:20px 28px 4px;">
    <h2 style="margin:0 0 10px;font-size:15px;color:${C.ink};">${title}</h2>
    ${inner}
  </td></tr>`;
const empty = (msg) => `<p style="margin:0;font-size:13px;color:${C.muted};">${msg}</p>`;
const row = (main, sub, right = '', rightColor = C.muted) => `
  <tr>
    <td style="padding:8px 0;border-bottom:1px solid ${C.line};font-size:14px;color:${C.ink};">
      ${main}${sub ? `<div style="font-size:12px;color:${C.muted};margin-top:2px;">${sub}</div>` : ''}
    </td>
    <td style="padding:8px 0 8px 12px;border-bottom:1px solid ${C.line};font-size:12px;color:${rightColor};text-align:right;white-space:nowrap;vertical-align:top;">${right}</td>
  </tr>`;
const table = (rows) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>`;

export function renderDigest(c, win, { preview = false } = {}) {
  const first = (c.person.full_name || '').split(' ')[0] || 'there';
  const range = `${fmtDayMonth(win.weekStart)} – ${fmtDayMonth(win.weekEnd)}`;
  const taskCount = c.overdue.length + c.dueThisWeek.length;
  const subject = `Your week ahead (${range})${taskCount ? ` · ${taskCount} task${taskCount === 1 ? '' : 's'}` : ''}`;

  // Tasks
  let tasksHtml = '';
  if (c.overdue.length) {
    tasksHtml += `<p style="margin:0 0 4px;font-size:12px;font-weight:bold;color:${C.red};text-transform:uppercase;">Overdue</p>`
      + table(c.overdue.map((t) => row(esc(t.label), esc(c.where(t) || ''), `due ${fmtShort(t.due_date)}`, C.red)).join(''));
  }
  if (c.dueThisWeek.length) {
    tasksHtml += `<p style="margin:${c.overdue.length ? '14px' : '0'} 0 4px;font-size:12px;font-weight:bold;color:${C.muted};text-transform:uppercase;">Due this week</p>`
      + table(c.dueThisWeek.map((t) => row(esc(t.label), esc(c.where(t) || ''), fmtShort(t.due_date))).join(''));
  }
  if (c.newlyAssigned.length) {
    tasksHtml += `<p style="margin:14px 0 4px;font-size:12px;font-weight:bold;color:${C.muted};text-transform:uppercase;">New this week</p>`
      + table(c.newlyAssigned.map((n) => row(esc(n.body || n.title), esc(n.title))).join(''));
  }
  if (!tasksHtml) tasksHtml = empty('Nothing due and nothing overdue — nice.');
  if (c.recurring) tasksHtml += `<p style="margin:10px 0 0;font-size:12px;color:${C.muted};">Plus ${c.recurring} recurring task${c.recurring === 1 ? '' : 's'} on your Home checklist.</p>`;

  // Rocks
  const rocksHtml = c.rocks.length
    ? table(c.rocks.map((r) => row(
      esc(r.title),
      [ROCK_STATUS[r.status] || r.status, r.due_date ? `due ${fmtShort(r.due_date)}` : null, r.totalTasks ? `${r.openTasks} of ${r.totalTasks} tasks open` : 'no tasks yet'].filter(Boolean).join(' · '),
      r.on_track ? 'On track' : 'Off track',
      r.on_track ? C.green : C.red,
    )).join(''))
    : empty("You don't own any active rocks.");

  // Noticeboard
  const noticesHtml = c.notices.length
    ? c.notices.map((n) => `
      <div style="margin:0 0 10px;padding:10px 12px;border-left:3px solid ${C.green};background:#ecfdf5;border-radius:4px;font-size:14px;color:${C.ink};">
        ${n.isNew ? `<span style="font-size:11px;font-weight:bold;color:${C.green};">NEW · </span>` : ''}${rich(n.message)}
        ${n.author ? `<div style="font-size:12px;color:${C.muted};margin-top:4px;">— ${esc(n.author)}</div>` : ''}
      </div>`).join('')
    : empty('No notices on the board.');

  // Scoreboard (managers)
  const mark = (hit) => (hit == null ? '' : hit ? ` <span style="color:${C.green};">✓</span>` : ` <span style="color:${C.red};">✗</span>`);
  const scoreHtml = c.scoreboard && (c.scoreboard.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
        <tr style="color:${C.muted};font-size:11px;text-transform:uppercase;">
          <td style="padding:4px 0;">Metric</td>
          <td style="padding:4px 0;text-align:right;">Last week (${fmtDayMonth(win.lastStart)}–${fmtDayMonth(win.lastEnd)})</td>
          <td style="padding:4px 0;text-align:right;">${fmt(win.lastEnd, { month: 'long' })} to date</td>
        </tr>
        ${c.scoreboard.map((m) => `
          <tr>
            <td style="padding:8px 0;border-top:1px solid ${C.line};color:${C.ink};">${esc(m.label)}${m.direction === 'at_most' ? ` <span style="color:${C.muted};font-size:11px;">(lower is better)</span>` : ''}</td>
            <td style="padding:8px 0;border-top:1px solid ${C.line};text-align:right;color:${C.ink};">${num(m.week)}${m.weekly != null ? ` / ${num(m.weekly)}` : ''}${mark(m.weekHit)}</td>
            <td style="padding:8px 0;border-top:1px solid ${C.line};text-align:right;color:${C.ink};">${num(m.month)}${m.monthly != null ? ` / ${num(m.monthly)}` : ''}${mark(m.monthHit)}</td>
          </tr>`).join('')}
      </table>`
    : empty('No scoreboard targets set.'));

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${C.line};">
        ${preview ? `<tr><td style="padding:8px 28px;background:#fef3c7;color:${C.amber};font-size:12px;">Preview — this is what ${esc(first)} would get on Sunday.</td></tr>` : ''}
        <tr><td style="padding:22px 28px;background:${C.green};color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">Newstrength · Weekly digest</div>
          <div style="font-size:22px;font-weight:bold;margin-top:4px;">Hey ${esc(first)}, here's your week ahead</div>
          <div style="font-size:13px;opacity:0.9;margin-top:2px;">${range}</div>
        </td></tr>
        ${section('My tasks', tasksHtml)}
        ${section('My rocks', rocksHtml)}
        ${section('Noticeboard', noticesHtml)}
        ${scoreHtml ? section('Scoreboard', scoreHtml) : ''}
        <tr><td style="padding:24px 28px 28px;" align="center">
          <a href="${DASHBOARD_URL}" style="display:inline-block;background:${C.green};color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:11px 22px;border-radius:8px;">Open the dashboard</a>
        </td></tr>
      </table>
      <p style="max-width:600px;margin:12px auto 0;font-size:11px;color:${C.muted};text-align:center;">
        You get this every Sunday evening. To stop it, open the bell in the dashboard and switch off the weekly email digest.
      </p>
    </td></tr>
  </table>
</body></html>`;

  const line = (s) => `- ${s}`;
  const text = [
    `Hey ${first}, here's your week ahead (${range})`,
    '',
    'MY TASKS',
    ...(c.overdue.length ? ['Overdue:', ...c.overdue.map((t) => line(`${t.label} (due ${fmtShort(t.due_date)})`))] : []),
    ...(c.dueThisWeek.length ? ['Due this week:', ...c.dueThisWeek.map((t) => line(`${t.label} (${fmtShort(t.due_date)})`))] : []),
    ...(c.newlyAssigned.length ? ['New this week:', ...c.newlyAssigned.map((n) => line(n.body || n.title))] : []),
    ...(!c.overdue.length && !c.dueThisWeek.length && !c.newlyAssigned.length ? ['Nothing due and nothing overdue.'] : []),
    '',
    'MY ROCKS',
    ...(c.rocks.length ? c.rocks.map((r) => line(`${r.title} — ${r.on_track ? 'on track' : 'off track'}, ${r.openTasks}/${r.totalTasks} tasks open`)) : ["You don't own any active rocks."]),
    '',
    'NOTICEBOARD',
    ...(c.notices.length ? c.notices.map((n) => line(plain(n.message))) : ['No notices.']),
    ...(c.scoreboard ? ['', 'SCOREBOARD (last week / month to date)', ...c.scoreboard.map((m) => line(`${m.label}: ${num(m.week)}${m.weekly != null ? `/${num(m.weekly)}` : ''} · ${num(m.month)}${m.monthly != null ? `/${num(m.monthly)}` : ''}`))] : []),
    '',
    `Open the dashboard: ${DASHBOARD_URL}`,
  ].join('\n');

  return { subject, html, text };
}
