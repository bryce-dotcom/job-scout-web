// Knowledge Card — Jobs
// Sourced from src/pages/Jobs.jsx + src/lib/statusColors.js (jobStatusColors).
// When those pages change, this card needs to follow.

export default {
  id: 'jobs',
  title: 'Jobs',
  category: 'Project & Job Management',
  icon: 'Briefcase',
  route: '/jobs',

  summary:
    "The job board. Four kanban columns: Chillin (#6382bf), Scheduled (#5a6349), In Progress (#c28b38), Completed (#4a7c59) — plus custom statuses from DB. Recent Wins carousel at top shows completed jobs with revenue. Stats strip counts per column. Add Job creates a new job; action buttons on each card (→ Schedule, ▶ Start, ✓ Done) advance the status in one click.",

  replaces: ['HousecallPro jobs', 'Jobber jobs', 'ServiceTitan jobs', 'spreadsheet job logs'],
  highlights: [
    'Four kanban columns: Chillin → Scheduled → In Progress → Completed',
    'Recent Wins carousel with revenue total + invoice status',
    'One-click action buttons per card (Schedule / Start / Done)',
    'Board / List toggle + Map + Calendar shortcuts',
    'Job auto-created when estimate is marked Won',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'empty',   baseDur: 4500, narration: "The Jobs board. Four columns — Chillin, Scheduled, In Progress, Completed. Each column tallies a count and jobs flow left to right." },
      { id: 'wins',    baseDur: 6000, narration: "Recent Wins rolls across the top. Every completed job shows up here with the revenue total. Not Invoiced chip means money still waiting to be billed." },
      { id: 'board',   baseDur: 6500, narration: "Each card shows the job ID, title, customer, dollar amount, date, and team. Click to open. Drag is coming — use the action buttons for now." },
      { id: 'actions', baseDur: 6000, narration: "One-click buttons move jobs forward. Arrow Schedule on Chillin, Play Start on Scheduled, Check Done on In Progress. One tap, status updates instantly." },
      { id: 'new',     baseDur: 6000, narration: "Add Job is top-right. Name it, pick the customer, assign the team, set a start date. Status auto-syncs to Scheduled when you drop in a date." },
    ],
  },

  setup: {
    overview:
      "Jobs ships ready. Every won estimate auto-creates a job. The only setup is making sure your team advances status with the one-click buttons — or you can add custom statuses in Settings → Job Statuses.",
    introBaseDur: 1200,
    introNarration: "Almost zero setup. Here is what you should know.",
    steps: [
      {
        icon: 'FileCheck',
        title: 'Jobs auto-create from won estimates',
        body: 'When a quote moves to Won (via the Portal signature or Pipeline drag), a jobs row is created automatically with all line items copied.',
        narration: 'Win an estimate and the job appears on the board automatically. Nothing to do.',
        baseDur: 4500,
      },
      {
        icon: 'Briefcase',
        title: 'Advance status with one-click buttons',
        body: '→ Schedule moves Chillin to Scheduled. ▶ Start moves Scheduled to In Progress. ✓ Done moves In Progress to Completed. Each transition also creates or updates the linked appointment.',
        narration: 'Arrow Schedule, Play Start, Check Done — one click advances the job. Appointment syncs automatically.',
        baseDur: 5500,
      },
      {
        icon: 'Camera',
        title: 'Tech completes in Field Scout',
        body: 'In Field Scout, the tech taps Complete on their phone. Photos and signature capture land in the job. Status flips to Completed.',
        narration: 'Tech taps Complete in Field Scout on their phone. Photos and signature land in the job.',
        baseDur: 5500,
      },
      {
        icon: 'CircleDollarSign',
        title: 'Invoice and close',
        body: 'From the job detail, Send Invoice generates the invoice. When paid in full, the job status auto-closes. Recent Wins carousel picks it up.',
        narration: 'Send Invoice from the job. Customer pays, job auto-closes and shows in Recent Wins.',
        baseDur: 5500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The job board. Desktop: PageHeader (Briefcase icon + Board/List toggle + Import + Export + Map + Calendar + Add Job), then Recent Wins carousel (rgba(74,124,89,0.06) bg), then stats strip (count per column), then search, then 4 kanban columns. Board column card: job_id (col.color, ExternalLink icon) + job_total (accent) / job_title (13px bold) / customer.name / start_date (Calendar icon) + assigned_team (User icon) / invoice_status pill + action button (→ Schedule | ▶ Start | ✓ Done).",

    howItWorks:
      "Reads from jobs (company_id-scoped). Default board columns: Chillin #6382bf (Coffee icon), Scheduled #5a6349 (Calendar), In Progress #c28b38 (Play), Completed #4a7c59 (CheckCircle). Custom columns from DB job_statuses table. scheduleJob: sets status=Scheduled + creates appointments row. startJob: status=In Progress. completeJob: status=Completed + completed_at + companyNotify. archiveJob: status=Archived (soft-delete, reversible). Status-auto-sync: picking a start_date while status=Chillin auto-flips to Scheduled.",

    examples: [
      "EST-041 signed → jobs row created → appears in Chillin column",
      "Click → Schedule on JOB-041 → status=Scheduled + appointment created + shows in calendar",
      "Click ✓ Done on JOB-038 → status=Completed + completed_at stamped + companyNotify fires",
    ],

    gotchas: [
      "Action buttons appear on the card in the column matching that status — a Chillin card shows → Schedule, not ▶ Start.",
      "Status auto-syncs to Scheduled when you drop in a start_date on the Add/Edit modal.",
      "Archive (soft-delete) hides a job from the board but keeps it in DB — restore from 'Recently Archived' section below the board.",
      "Recent Wins carousel only shows Completed jobs from the store (active jobs, not archived).",
    ],

    faqs: [
      {
        q: 'Can I create a job without a quote?',
        a: 'Yes — click Add Job top-right. You lose the quote audit trail, but you can still add line items, capture time, and invoice from the job.',
      },
      {
        q: 'How do I add custom job statuses?',
        a: 'Settings → Job Statuses. New statuses appear as columns on the board in DB order. Core statuses (Chillin, Scheduled, In Progress, Completed) keep their colors and icons.',
      },
    ],

    actions: {
      open:  { route: '/jobs',       label: 'Open Jobs' },
      board: { route: '/job-board',  label: 'Open Job Board (PM view)' },
      cal:   { route: '/jobs/calendar', label: 'Open Jobs Calendar' },
    },
  },

  lastVerified: '2026-06-04',
  freshUntil: 90,
}
