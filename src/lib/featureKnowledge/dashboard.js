export default {
  id: 'dashboard',
  title: 'Dashboard',
  category: 'Reports & Insights',
  icon: 'LayoutDashboard',
  route: '/dashboard',
  summary: 'Your command center — revenue MTD, open AR, job status breakdown, and conversion funnel all on one screen, refreshed live.',
  replaces: ['Excel revenue dashboards', 'Google Data Studio', 'ServiceTitan dashboard'],
  highlights: [
    'Real-time revenue KPIs',
    'Job status breakdown',
    'Open AR tracking',
    'Goal vs actual progress',
  ],
  marketing: {
    voice: 'Bill',
    scenes: [
      {
        id: 'kpis',
        baseDur: 4500,
        narration: 'The moment you log in, four live tiles tell the whole story — revenue, what you\'re owed, active jobs, and average job value, all updated in real time.',
      },
      {
        id: 'jobs',
        baseDur: 6500,
        narration: 'The job pipeline breaks down every open job by status — see exactly what\'s scheduled, what\'s in progress, and what just wrapped up, with your crew\'s names attached.',
      },
      {
        id: 'revenue',
        baseDur: 6500,
        narration: 'Six months of revenue at a glance — this month pops so you can instantly see if you\'re trending up or down compared to last month.',
      },
      {
        id: 'ar',
        baseDur: 6500,
        narration: 'The AR aging table shows exactly where your money is stuck — anything past 60 days lights up red so collections never fall through the cracks.',
      },
      {
        id: 'actions',
        baseDur: 4500,
        narration: 'Action items surface the five things that actually need your attention today — overdue invoices, missing photos, stale estimates — one click to fix each one.',
      },
    ],
  },
  setup: {
    overview: 'Set your revenue goal, configure alert thresholds, and the dashboard starts working immediately — no data entry required.',
    introBaseDur: 1200,
    introNarration: 'Dashboard setup takes about two minutes.',
    steps: [
      {
        icon: 'Target',
        title: 'Set monthly revenue goal',
        body: 'Settings → Goals. Enter your monthly revenue target — the dashboard shows actuals vs goal with a progress ring.',
        narration: 'Drop in your monthly revenue goal and the dashboard draws a live progress ring against your actuals.',
        baseDur: 4500,
      },
      {
        icon: 'Bell',
        title: 'Configure action items',
        body: 'Settings → Dashboard Alerts. Choose which flags appear: overdue invoices, missing photos, stale estimates. You control the thresholds.',
        narration: 'Pick which alerts surface in your action items widget and set your own overdue thresholds.',
        baseDur: 5000,
      },
      {
        icon: 'Users',
        title: 'Filter by salesperson',
        body: 'Dashboard top-right: filter to a single rep or PM. Revenue and jobs narrow to their pipeline.',
        narration: 'Use the rep filter to pull up any salesperson\'s numbers instantly — great for weekly one-on-ones.',
        baseDur: 4500,
      },
      {
        icon: 'BarChart2',
        title: 'Export to PDF',
        body: 'Dashboard → Share → PDF. Exports the current view with date range for board meetings or lender reporting.',
        narration: 'Export the whole dashboard as a clean PDF for your board meeting or lender package in one click.',
        baseDur: 4500,
      },
    ],
  },
  agentKnowledge: {
    whatItIs: 'The executive summary screen shown on login. Aggregates revenue, AR aging, job pipeline, and conversion metrics into one view.',
    howItWorks: 'No dedicated dashboard table — each widget queries its own source. Revenue MTD = SUM(invoices.total) WHERE paid_at >= first_of_month AND company_id = X. AR aging = invoices WHERE status = unpaid grouped by days_since_due buckets (0–30, 31–60, 61–90, 90+). Job status counts from jobs table filtered by company_id. Conversion funnel from leads table. Payroll close date from payroll_runs. Each widget calls a dedicated Supabase RPC or edge function to keep queries efficient.',
    examples: [
      'Show me revenue MTD vs last month',
      'How much AR is past 60 days?',
      'How many jobs are in progress right now?',
      'What action items need attention today?',
      'What is the average job value this month?',
    ],
    gotchas: [
      'Dashboard is read-only — no edits happen here, only navigation to source records.',
      'Revenue MTD counts invoices by paid_at date, not job completion date — a payment posted late shifts the month it counts in.',
      'AR aging uses days_since_due, not days_since_invoice — net-30 invoices only enter the aging buckets after the due date passes.',
      'The goal progress ring requires a goal to be set in Settings → Goals; without it the ring shows blank.',
      'Rep filter only narrows revenue and jobs widgets — the AR aging table always shows company-wide totals.',
    ],
    faqs: [
      {
        q: 'Why does my revenue MTD not match my invoices list total?',
        a: 'Dashboard revenue MTD counts only paid invoices (paid_at is set). Unpaid or partially paid invoices appear in AR, not revenue.',
      },
      {
        q: 'Can I add custom KPI tiles?',
        a: 'Not yet — the four KPI tiles are fixed. Custom widgets are on the roadmap.',
      },
      {
        q: 'How often does the dashboard refresh?',
        a: 'On each page load and every 5 minutes via a background poll. You can force a refresh with the reload icon in the top-right.',
      },
      {
        q: 'Who can see the dashboard?',
        a: 'Any employee with the Manager or Owner role. Field techs with the Tech role see a limited view with only their assigned jobs.',
      },
    ],
    actions: {
      open: { route: '/dashboard', label: 'Open Dashboard' },
    },
  },
  lastVerified: '2026-06-10',
  freshUntil: 90,
}
