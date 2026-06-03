// Knowledge Card — Reports
// KPI dashboards across sales, ops, finance.

export default {
  id: 'reports',
  title: 'Reports',
  category: 'Operations',
  icon: 'BarChart3',
  route: '/reports',

  summary:
    "Owner dashboards that tell the truth: sales pipeline, win rate, gross margin per crew, AR aging, fuel cost trend, employee utilization. Everything that should be in a Monday morning huddle, already computed.",

  replaces: ['QuickBooks reports', 'manual KPI spreadsheets', 'ServiceTitan dashboards', 'Looker basic-tier'],
  highlights: [
    'Sales + ops + finance dashboards',
    'Trend lines + comparisons',
    'Drill-through to records',
    'Schedule to email',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'open',      baseDur: 4500, narration: 'Reports. Every dashboard you need. Sales, jobs, money, team.' },
      { id: 'sales',     baseDur: 6500, narration: 'Sales dashboard. Pipeline, win rate, average deal size, by salesperson. Monday morning huddle, ready.' },
      { id: 'profit',    baseDur: 6500, narration: 'Profitability. Gross margin per crew, per job type, per month. Where the money is actually being made.' },
      { id: 'cash',      baseDur: 6500, narration: 'Cash flow. AR aging, AP aging, fuel spend trend. Where it sits and where it goes.' },
      { id: 'schedule',  baseDur: 5500, narration: 'Schedule any report to email. Owner gets the weekly P and L every Monday at six AM. No login.' },
    ],
  },

  setup: {
    overview:
      "Reports work out of the box — they read from the same data Books and Jobs use. Customize the KPIs you care about by picking from the dashboard catalog.",
    introBaseDur: 1200,
    introNarration: 'Reports work out of the box. Customize what you care about.',
    steps: [
      {
        icon: 'LayoutDashboard',
        title: 'Pick your default dashboard',
        body: 'Reports → Dashboards → pick Sales / Profitability / Cash / Team as your landing page.',
        narration: 'Pick your default dashboard.',
        baseDur: 4500,
      },
      {
        icon: 'Sliders',
        title: 'Customize KPIs',
        body: 'Each dashboard has a Customize button. Add/remove tiles, pin favorites, change the comparison period.',
        narration: 'Customize the KPIs you care about.',
        baseDur: 5000,
      },
      {
        icon: 'Mail',
        title: 'Schedule weekly email',
        body: 'Any report → Schedule → weekly / monthly. PDF or inline. Lands in your inbox before the huddle.',
        narration: 'Schedule weekly email. Inbox before the huddle.',
        baseDur: 5000,
      },
      {
        icon: 'Search',
        title: 'Drill through to records',
        body: 'Click any number on a dashboard — see the underlying records (jobs, invoices, payments) right there.',
        narration: 'Click any number — drill through to records.',
        baseDur: 5000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The KPI surface for owners and managers. Pre-built dashboards (Sales, Profitability, Cash, Team) with customizable tiles. Drill-through to underlying records. Scheduled-email delivery for routine review cadences.",

    howItWorks:
      "Materialized views per dashboard (mv_sales_summary, mv_profitability, mv_ar_aging, mv_team_utilization) refreshed nightly + on-demand. Dashboard config in user_dashboard_configs (per-user tile selection). Scheduled email via Vercel cron + send-email Edge Function rendering PDF via puppeteer-core.",

    examples: [
      'Sales dashboard → pipeline $284k → win rate 42% → 12 active deals',
      'Profitability → Cole crew 38% margin → Marcus crew 31% margin → spot the gap',
      'Schedule Profitability → weekly Monday 6am → owner email',
    ],

    gotchas: [
      'Nightly refresh means dashboards are up to 24h stale. Click Refresh on any tile for live data.',
      'Scheduled emails respect the recipient\'s role — a tech-role user won\'t see financials, even if scheduled to them.',
      'Drill-through opens in a new tab. Tiles with millions of underlying records cap at 1,000 rows in the drill-through view.',
    ],

    faqs: [
      {
        q: 'Can I export to Excel?',
        a: 'Yes — any report → ⋯ → Export CSV. Numbers come over with formulas intact.',
      },
      {
        q: 'Custom dashboards for unique KPIs?',
        a: 'V2 roadmap. For now, custom KPIs go through Frankie (ask him "what was X this month?") — same data, conversational.',
      },
    ],

    actions: {
      open: { route: '/reports', label: 'Open Reports' },
      frankie: { route: '/agents/frankie', label: 'Ask Frankie' },
    },
  },

  lastVerified: '2026-06-03',
  freshUntil: 90,
}
