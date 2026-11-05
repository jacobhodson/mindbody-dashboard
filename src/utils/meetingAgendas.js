// The meeting agendas: the two weekly ones mirror the Notion templates they
// replace (MONDAY TEAM MEETING and Leadership Huddle), and the monthly one is
// the Same-Page Meeting template. `cadence` (default weekly) sets how often a
// type's meeting comes round and how it's dated. The live agendas are
// the `meeting_sections` table (editable in the Meetings tab's build mode —
// see useMeetingSections.js); the `sections` below are the original seed,
// used only as a fallback if that table can't be read. `kind` picks which
// component renders the section in MeetingsTab.jsx:
//   items       — free-form entries people add (stored in meeting_items under
//                 `key`, or `key:listKey` when config.lists splits it into sub-lists)
//   cascade_in  — the Leadership Huddle's agreed message for this week (read-only)
//   cascade_out — the two cascade lists the huddle fills in
//   scorecard   — the live Scoreboard for the period before the meeting
//   scorecard_30 — automatic rolling-30-day review; off-track metrics get a discussion list
//   rocks       — rock review (status / on-track; monthly adds priority + notes)
//   ids         — the IDS issues board for `board`
//   last_todos  — to-dos from previous meetings of this type
//   todos       — to-dos created in this meeting
//   rating      — 1–10 rating + one improvement
//   reds        — the live Group Training Red's List, contactable in place
//   carry       — items to carry over; the previous meeting's show here too

export const MEETING_TYPES = {
  team: {
    label: 'Team Meeting',
    sections: [
      { key: 'wins', title: 'Wins', minutes: 5, kind: 'items',
        hint: 'Share one personal and one professional highlight each.' },
      { key: 'cascade', title: 'Cascade from Leadership', minutes: 3, kind: 'cascade_in',
        hint: "GM delivers the agreed message from this week's Leadership Huddle." },
      { key: 'scorecard', title: 'Team Scorecard Review', kind: 'scorecard',
        hint: "Last week's numbers against target. Anything off track goes to IDS." },
      { key: 'pipeline', title: 'FEO Pipeline Party', kind: 'items',
        hint: 'Review everyone in the pipeline to hit 80% rollovers. 🟢 on track = skip · 🟠🔴 = discuss + assign.' },
      { key: 'headlines', title: 'Client Headlines', kind: 'items',
        hint: 'Any significant client information from the past week.' },
      { key: 'reach_outs', title: 'Client Reach-outs', kind: 'reds',
        hint: "Red's List — who needs a call or message this week." },
      { key: 'last_todos', title: "Last Week's To-Dos", minutes: 5, kind: 'last_todos',
        hint: 'Done or not done — no discussion. Anything stuck goes to IDS.' },
      { key: 'ids', title: 'Team IDS — Identify, Discuss, Solve', minutes: 8, kind: 'ids', board: 'team', voices: true,
        hint: 'Issues the team owns and can solve — real, unsolved, theirs.' },
      { key: 'todos', title: 'Conclude — New To-Dos', minutes: 5, kind: 'todos',
        hint: 'Action items for the week, assigned from IDS.' },
      { key: 'events', title: 'Events & Reminders', kind: 'items',
        hint: 'Upcoming events and things to remember.' },
      { key: 'rating', title: 'Meeting Rating', minutes: 2, kind: 'rating',
        hint: "Rate the meeting's effectiveness 1–10 and suggest one improvement." },
    ],
  },
  leadership: {
    label: 'Leadership Huddle',
    managerOnly: true,
    sections: [
      { key: 'checkin', title: 'Segue / Check-in', minutes: 2, kind: 'items',
        hint: 'Quick personal + business beat. Full wins live in the Team Meeting.' },
      { key: 'scorecard', title: 'Scorecard Review', minutes: 8, kind: 'scorecard',
        hint: 'On / off track only. Off-track drops to IDS.' },
      { key: 'rocks', title: 'Rock Review', minutes: 5, kind: 'rocks',
        hint: "Status + on/off track only. Never the craft content itself — that's the Braintrust's job." },
      { key: 'ids', title: 'IDS — Identify, Discuss, Solve', minutes: 8, kind: 'ids', board: 'leadership',
        hint: "Off-track scorecards + leadership-only issues. Solve leadership's; sort the rest — move what the team should IDS itself to the Team board." },
      { key: 'cascade', title: 'Cascading Message', minutes: 2, kind: 'cascade_out',
        hint: "The handoff — don't skip it. Agree before anyone leaves the room; it shows in this week's Team Meeting." },
      { key: 'last_todos', title: "Last Week's To-Dos", kind: 'last_todos',
        hint: 'Done or not done. Anything stuck goes to IDS.' },
      { key: 'todos', title: 'Conclude — New To-Dos', minutes: 2, kind: 'todos',
        hint: 'Assign new to-dos and flag upcoming events.' },
      { key: 'rating', title: 'Rate', kind: 'rating',
        hint: 'Each attendee rates 1–10 + one improvement.' },
    ],
  },
  monthly: {
    label: 'Monthly Same-Page',
    managerOnly: true,
    cadence: 'monthly',
    sections: [
      { key: 'scorecard', title: '30-Day Scorecard Review', kind: 'scorecard_30',
        hint: 'Updates automatically. Discuss anything off track.',
        config: { hidden_metrics: [], rollover_target: 80 } },
      { key: 'headlines', title: 'Operations Headlines', kind: 'items',
        hint: 'From the GM.',
        config: { lists: [
          { key: 'going_well', title: "What's going well" },
          { key: 'not_going_well', title: "What's not going well" },
          { key: 'decisions', title: 'Decisions for the founders' },
        ] } },
      { key: 'rocks', title: 'Rock Review', kind: 'rocks',
        hint: 'Priority, owner, status and notes for each active rock.' },
      { key: 'team_review', title: 'Team Review', kind: 'items',
        config: { lists: [
          { key: 'capacity', title: 'Capacity' },
          { key: 'hiring', title: 'Hiring' },
          { key: 'performance', title: 'Performance' },
          { key: 'wellbeing', title: 'Wellbeing' },
          { key: 'upcoming_leave', title: 'Upcoming leave' },
        ] } },
      { key: 'ops_risks', title: 'Operations & Risks', kind: 'items',
        config: { lists: [
          { key: 'systems', title: 'Systems' },
          { key: 'compliance', title: 'Compliance' },
          { key: 'venue', title: 'Venue' },
          { key: 'equipment', title: 'Equipment' },
          { key: 'insurance', title: 'Insurance' },
          { key: 'financials', title: 'Financials' },
        ] } },
      { key: 'next_30', title: 'Next 30 Days', kind: 'todos',
        hint: 'Top 3 priorities and who owns each.' },
      { key: 'carry', title: 'Carry to Next Month', kind: 'carry',
        hint: "These show again on next month's meeting." },
    ],
  },
};

export const meetingCadence = (type) => MEETING_TYPES[type]?.cadence || 'weekly';

// Section types a manager can add in build mode. `once` = only one per
// agenda (a second copy would just repeat the same content).
export const SECTION_KINDS = [
  { kind: 'items',       label: 'List — people add entries', once: false },
  { kind: 'scorecard',   label: 'Scorecard',                 once: true },
  { kind: 'scorecard_30', label: '30-day scorecard (automatic)', once: true },
  { kind: 'rocks',       label: 'Rock review',               once: true },
  { kind: 'ids',         label: 'IDS board',                 once: true },
  { kind: 'last_todos',  label: "Last meeting's to-dos",     once: true },
  { kind: 'todos',       label: 'New to-dos',                once: true },
  { kind: 'carry',       label: 'Carry to next meeting',     once: true },
  { kind: 'rating',      label: 'Meeting rating',            once: true },
  { kind: 'reds',        label: "Red's List (Group Training)", once: true, types: ['team'] },
  { kind: 'cascade_in',  label: 'Cascade from Leadership',   once: true, types: ['team'] },
  { kind: 'cascade_out', label: 'Cascading message',         once: true, types: ['leadership'] },
];

export const CASCADE_SECTIONS = [
  { key: 'cascade_hears',   title: 'What the team hears' },
  { key: 'cascade_upskill', title: 'Upskilling focus this week' },
];

export const MEETING_STATUSES = [
  { key: 'planned',     label: 'Planned' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done',        label: 'Done' },
];
