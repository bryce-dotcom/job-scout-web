// Knowledge Card — Job Sections
// Break a big job into trackable sections (% of job, assigned tech,
// scheduled date, estimated vs actual hours).

export default {
  id: 'job-sections',
  title: 'Job Sections',
  category: 'Project & Job Management',
  icon: 'Layers',
  route: '/jobs',

  summary:
    'Break a big job into trackable chunks — per-section percent of job, assigned crew, scheduled date, estimated vs actual hours — so PMs can dispatch chunk by chunk and watch progress in real time.',

  replaces: ['ServiceTitan project tracking', 'Buildertrend phases', 'spreadsheet phase trackers'],
  highlights: [
    'Per-section assignee',
    'Estimated vs actual hours',
    'Verified-by audit trail',
    'Drag onto job board',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'add',       baseDur: 4500, narration: 'A two-week retrofit job. Too big to track as one row.' },
      { id: 'add',       baseDur: 6500, narration: 'Split it into sections — Demo Day, Rough In, Trim Out, Punch List. Each one has its own crew and schedule.' },
      { id: 'add',       baseDur: 6000, narration: 'Assign a lead tech, pick a day, and set the budgeted hours.' },
      { id: 'add',       baseDur: 6500, narration: 'As techs clock in against a section, actuals rise. Green means on pace, red means trouble.' },
      { id: 'add',       baseDur: 5500, narration: 'PM walks the section, marks it Verified, and the job moves on to the next phase.' },
    ],
  },

  setup: {
    overview:
      'Job sections are optional — small one-day jobs do not need them. For multi-day or multi-phase work, splitting into sections gives you per-phase budget vs actuals and per-crew dispatch.',
    introBaseDur: 1200,
    introNarration: 'Use sections when one job is too big for one row.',
    steps: [
      {
        icon: 'Layers',
        title: 'Open the job and add a section',
        body: 'In the job detail page, scroll to Sections and click + Add Section. Name it after the phase (Demo, Rough, Trim, etc.).',
        narration: 'Open the job, scroll to Sections, click Add Section. Name it after the phase.',
        baseDur: 5000,
      },
      {
        icon: 'Percent',
        title: 'Set percent of job',
        body: 'Slider 0–100. Use it to weight progress. Four sections at 25% each, or weight the demo at 40% if it carries the labor.',
        narration: 'Set the percent of the job this section carries. Use it to weight progress.',
        baseDur: 5500,
      },
      {
        icon: 'UserCheck',
        title: 'Assign lead tech and schedule',
        body: 'Pick the lead tech, the scheduled date, and the budgeted hours. Section now shows up on their Field Scout for that day.',
        narration: 'Pick the lead tech, the day, and the budgeted hours. Section lands on their Field Scout.',
        baseDur: 5500,
      },
      {
        icon: 'CheckCircle2',
        title: 'PM verifies completion',
        body: 'When the crew finishes, the PM walks the section and taps Verified. Actual hours snapshot in, and the next section opens up.',
        narration: 'PM walks the section, taps Verified. Actuals snapshot in, next section opens.',
        baseDur: 5500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Sub-units of a job for tracking multi-phase or multi-day work. Each section has a name, percent of job, assigned lead tech, scheduled date, budgeted hours, actual hours (computed from time_log), and a Verified state with verifier + timestamp.",

    howItWorks:
      "Backed by job_sections table. estimated_hours set on creation. actual_hours auto-computed from time_log entries with matching job_section_id. verified_by + verified_at captured when the PM marks Verified. job_board drag-drop reads from job_sections where scheduled_date is in the active week.",

    examples: [
      'PM creates 4 sections for a fixture retrofit: Demo (20%), Install (50%), Wiring (20%), Punch (10%)',
      'Tech clocks in to Section 2 (Install) — actual hours roll up automatically',
      'PM verifies Section 3 — Section 4 becomes the active phase',
    ],

    gotchas: [
      'Section progress is independent of the parent job. A 100%-verified section does not close the job — only the invoice paid trigger does.',
      'Time_log entries need a job_section_id to roll into section actuals. Without it, the labor counts against the job at large.',
    ],

    faqs: [
      {
        q: 'Do all jobs need sections?',
        a: 'No. Short jobs work fine without sections. Use them when there is more than one phase or more than one day of work.',
      },
      {
        q: 'Can two crews work the same section?',
        a: 'Yes — multiple techs can clock in against the same section. The lead tech assignment is who the PM points to for status.',
      },
    ],

    actions: {
      open: { route: '/jobs', label: 'Open Jobs' },
      board: { route: '/job-board', label: 'PM Job Board' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
