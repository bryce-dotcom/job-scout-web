// Knowledge Card — Job Calendar
// Visual month/week/day schedule of every job and tech assignment.

export default {
  id: 'job-calendar',
  title: 'Job Calendar',
  category: 'Project & Job Management',
  icon: 'Calendar',
  route: '/jobs/calendar',

  summary:
    "Month, week, and day views of every scheduled job, color-coded by crew. Drag to reschedule. Filter by tech. The view PMs and owners pull up to answer 'who's where this week?'",

  replaces: ['ServiceTitan dispatch calendar', 'Jobber schedule', 'Google Calendar exports'],
  highlights: [
    'Month / week / day views',
    'Color by crew',
    'Drag to reschedule',
    'Tech filter overlay',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'month',    baseDur: 4500, narration: "Month view. Forty-two jobs this month, color-coded by crew. PM sees the whole picture." },
      { id: 'week',     baseDur: 6500, narration: 'Drop into week view. Time-of-day blocks. Cole has Monday and Tuesday packed, Marcus has Thursday open.' },
      { id: 'day',      baseDur: 6500, narration: "Day view. Hour-by-hour. Three jobs stacked on Cole's day with travel time between." },
      { id: 'drag',     baseDur: 6500, narration: 'Customer reschedules. Drag the job from Wednesday to Friday. Tech notified, customer auto-confirmed.' },
      { id: 'filter',   baseDur: 5500, narration: "Filter by tech. 'Just Cole.' Just Cole's jobs. Same calendar, narrower lens." },
    ],
  },

  setup: {
    overview:
      "Job Calendar reads from jobs.scheduled_date and job_sections.scheduled_date. As long as your team sets dates when they create jobs, it lights up automatically.",
    introBaseDur: 1200,
    introNarration: 'Almost zero setup. Calendar fills as jobs schedule.',
    steps: [
      {
        icon: 'CalendarPlus',
        title: 'Schedule jobs when you create them',
        body: 'On any job, set scheduled_date. The job lands on the calendar that day instantly.',
        narration: 'Set scheduled date when you create the job.',
        baseDur: 4500,
      },
      {
        icon: 'Palette',
        title: 'Color per crew',
        body: 'Employees → pick a color per lead tech. Their assigned jobs render in that color on the calendar.',
        narration: 'Pick a color per crew lead in Employees.',
        baseDur: 4500,
      },
      {
        icon: 'Filter',
        title: 'Save your view',
        body: 'Default to Week view if you dispatch daily. Default to Month view if you plan out further. Saved per-user.',
        narration: 'Save your default view per user.',
        baseDur: 4500,
      },
      {
        icon: 'Bell',
        title: 'Customer auto-notify',
        body: 'Settings → Calendar → SMS notify on reschedule. When you drag a job to a new day, customer gets a confirmation text.',
        narration: 'Turn on SMS notify on reschedule.',
        baseDur: 5000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The visual scheduling surface for every job and assigned tech. Three view modes (month/week/day), tech-filter overlay, drag-to-reschedule, and per-crew color coding. Sits on top of jobs.scheduled_date + job_sections.scheduled_date.",

    howItWorks:
      "Reads jobs WHERE scheduled_date BETWEEN view_start AND view_end. Per-crew color from employees.calendar_color. Drag-drop persists scheduled_date via supabase.update + triggers SMS via send-sms Edge Function if customer_sms_optin=true. The Job Board (PM Setter) is the kanban variant; this is the calendar variant — both read the same source.",

    examples: [
      'June 2026 month view → 42 jobs render → 6 different crew colors',
      'Week of June 8 → Cole has 14h Mon, 14h Tue, 0h Wed → Marcus has 8h Thu',
      'Customer reschedules → drag June 10 → June 12 → SMS sent to confirm',
    ],

    gotchas: [
      'Jobs without scheduled_date don\'t appear on the calendar. They live in the Backlog list on Jobs.',
      'Color is per LEAD tech. Multi-tech jobs show the lead\'s color; other techs surface in the tooltip only.',
      'Drag to reschedule writes immediately. Undo is a manual re-drag — no Cmd-Z support.',
    ],

    faqs: [
      {
        q: 'How is this different from the Job Board?',
        a: 'Job Board is a kanban (crews × days, drag-to-schedule). Job Calendar is the visual time grid. Same data, different lens.',
      },
      {
        q: 'Can the customer see this calendar?',
        a: 'No — internal only. Customers see their own jobs in the magic-link portal.',
      },
    ],

    actions: {
      open: { route: '/jobs/calendar', label: 'Open Job Calendar' },
      board: { route: '/job-board', label: 'Open Job Board' },
    },
  },

  lastVerified: '2026-06-03',
  freshUntil: 90,
}
