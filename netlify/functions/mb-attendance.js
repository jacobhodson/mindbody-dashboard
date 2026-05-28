import { getStaffToken, mbGet, ok, err, CORS } from './utils/mb-auth.js';
import { subDays, format, parseISO } from 'date-fns';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const token = await getStaffToken();
    const now = new Date();

    const startStr = format(subDays(now, 13), "yyyy-MM-dd'T'00:00:00");
    const endStr = format(now, "yyyy-MM-dd'T'23:59:59");

    // Paginate through all classes in the 14-day window
    let allClasses = [];
    let offset = 0;
    const limit = 200;

    while (true) {
      const data = await mbGet('/class/classes', token, {
        StartDateTime: startStr,
        EndDateTime: endStr,
        Limit: limit,
        Offset: offset,
      });
      const classes = data.Classes || [];
      allClasses = allClasses.concat(classes);
      if (classes.length < limit || offset >= 1800) break;
      offset += limit;
    }

    // Aggregate by calendar date
    const byDate = {};
    const byDayOfWeek = {};

    for (const cls of allClasses) {
      if (!cls.StartDateTime) continue;
      const d = parseISO(cls.StartDateTime);
      const dateKey = format(d, 'yyyy-MM-dd');
      const dow = format(d, 'EEE'); // Mon, Tue …

      byDate[dateKey] = (byDate[dateKey] || 0) + (cls.TotalBooked || 0);
      byDayOfWeek[dow] = (byDayOfWeek[dow] || 0) + (cls.TotalBooked || 0);
    }

    // Build daily series for the last 14 days (oldest → newest)
    const daily = Array.from({ length: 14 }, (_, i) => {
      const d = subDays(now, 13 - i);
      const dateKey = format(d, 'yyyy-MM-dd');
      return { date: dateKey, label: format(d, 'MMM d'), visits: byDate[dateKey] || 0 };
    });

    const dow_order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const byDow = dow_order.map((day) => ({ day, visits: byDayOfWeek[day] || 0 }));

    const last7 = daily.slice(7);
    const total7 = last7.reduce((s, d) => s + d.visits, 0);
    const avgDaily = Math.round(total7 / 7);
    const peak = last7.reduce((m, d) => (d.visits > m.visits ? d : m), { visits: 0, label: '–' });

    return ok({ daily, byDow, stats: { total7, avgDaily, peakDay: peak.label, peakVisits: peak.visits } });
  } catch (e) {
    console.error('mb-attendance:', e);
    return err(e.message);
  }
};
