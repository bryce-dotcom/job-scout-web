// Knowledge Card — Job Board (PM Setter)
// The Project Manager workspace — drag job sections onto crews and days.

export default {
  id: 'job-board',
  title: 'Job Board',
  category: 'Project & Job Management',
  icon: 'ClipboardList',
  route: '/job-board',

  summary:
    'The PM workspace — drag job sections onto crews and days like a Trello board, with allotted-hours guardrails so nobody gets double-booked.',

  replaces: ['When I Work scheduling', 'ServiceTitan dispatch board', 'Buildertrend schedule'],
  highlights: [
    'Drag-to-schedule',
    'Allotted-hours math',
    'Per-PM workspace',
    'Conflict detection',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'detail',     baseDur: 4500, narration: 'Monday morning. Twenty unassigned job sections in the queue.' },
      { id: 'drag',       baseDur: 6500, narration: 'PM drags a section onto Cole on Tuesday. The slot fills, his day shows fourteen of sixteen hours booked.' },
      { id: 'drag',       baseDur: 6500, narration: 'Try to overbook him to twenty hours? The board pushes back — red bar, you have to confirm or pick another day.' },
      { id: 'drag',       baseDur: 6000, narration: 'Need to move Wednesday work to Thursday? Drag the whole stack. Crews and customers get auto-notified.' },
      { id: 'detail',     baseDur: 5500, narration: 'One screen, the whole week. PM has the dispatch board they have been asking for.' },
    ],
  },

  setup: {
    overview:
      'Job Board reads from job_sections — anything with a scheduled_date in the active week shows up. Make sure your team uses sections on multi-day jobs and the board lights up automatically.',
    introBaseDur: 1200,
    introNarration: 'Almost no setup — sections drive the board.',
    steps: [
      {
        icon: 'Layers',
        title: 'Make sure jobs have sections',
        body: 'The board renders job sections, not raw jobs. Either split your job into sections on the job page or add a single Default section so it shows up.',
        narration: 'Make sure your jobs have sections. The board reads from sections, not jobs.',
        baseDur: 5500,
      },
      {
        icon: 'Users',
        title: 'Assign crew leads',
        body: 'Each crew has a lead in Employees. The board uses lead techs as the column header so make sure they are set.',
        narration: 'Set lead techs in Employees. Each lead becomes a column on the board.',
        baseDur: 5000,
      },
      {
        icon: 'Clock',
        title: 'Set allotted hours per crew',
        body: 'In Employees, set daily allotted hours per tech (default 8). The board uses this for the booked / available bar.',
        narration: 'Set daily allotted hours per tech. Drives the booked-versus-available math.',
        baseDur: 5500,
      },
      {
        icon: 'CalendarRange',
        title: 'Drag, drop, dispatch',
        body: 'Open /job-board, pick the week, drag unassigned sections from the side rail onto a crew + day. Done.',
        narration: 'Open the Job Board, drag sections from the side rail onto a crew and day. Done.',
        baseDur: 5500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "A Trello-style weekly dispatch view of every job section across every crew. Unassigned sections live in a side rail; the grid shows crews (rows) × days (columns). Drag-drop writes scheduled_date and lead_tech_id back to job_sections.",

    howItWorks:
      "Reads job_sections WHERE scheduled_date BETWEEN week_start AND week_end OR scheduled_date IS NULL. Side rail = NULL date. Daily hour totals computed from estimated_hours per section per crew. Allotted hours from employees.daily_allotted_hours (default 8). Drag-drop persists scheduled_date + lead_tech_id via supabase.update().",

    examples: [
      'PM opens Monday — Cole has 14h booked across 3 sections, Marcus has 4h, Priya has 0h',
      'PM drags an 8h section from rail to Priya/Thursday — board writes scheduled_date + lead_tech_id',
      'Lead tech opens Field Scout on Thursday — sees the section auto-listed',
    ],

    gotchas: [
      'Overbooking is allowed but warns — the bar turns red. Confirmation toast lets PM accept anyway.',
      'Drag-drop only works on the lead tech assignment. Multi-crew assignments still happen on the section detail.',
    ],

    faqs: [
      {
        q: 'What happens if I drag a section to a tech who is on PTO?',
        a: 'The board shows a PTO indicator on that cell — drag is allowed but the warning surfaces. Switch crews or pick another day.',
      },
      {
        q: 'Can multiple PMs use the same board?',
        a: 'Yes — every PM in the company sees the same board. Changes by one are visible to the others via realtime sync.',
      },
    ],

    actions: {
      open: { route: '/job-board', label: 'Open Job Board' },
      jobs: { route: '/jobs', label: 'Open Jobs' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
