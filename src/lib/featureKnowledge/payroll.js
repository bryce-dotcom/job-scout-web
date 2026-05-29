// Knowledge Card — Payroll Runs
// IRS Pub 15-T math, multi-state withholding, federal + state filings.

export default {
  id: 'payroll',
  title: 'Payroll Runs',
  category: 'Payroll, HR & Onboarding',
  icon: 'DollarSign',
  route: '/payroll',

  summary:
    "Run payroll — pulls hours from the time clock, computes regular/OT/PTO/bonus/commission, calculates federal + state withholding using IRS Pub 15-T percentage method. Gusto math without the per-employee fee.",

  replaces: ['Gusto', 'ADP RUN', 'OnPay', 'Paychex'],
  highlights: [
    'IRS Pub 15-T percentage method',
    'Multi-state withholding',
    'Overtime mode',
    'Direct deposit + paystubs',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'period',   baseDur: 4500, narration: 'Pick the pay period. Hours pull straight from the time clock.' },
      { id: 'compute',  baseDur: 6500, narration: 'Regular hours, overtime, PTO, bonus, commission. Federal withholding via IRS Pub fifteen tee percentage method. State, FICA, Medicare.' },
      { id: 'review',   baseDur: 6500, narration: 'Per-employee preview. Gross to net, with every deduction itemized. Adjust before posting.' },
      { id: 'pay',      baseDur: 6500, narration: 'Approve. Direct deposits queue up, paystubs publish to My Pay, journal entries hit Books.' },
      { id: 'tax',      baseDur: 5500, narration: 'Tax deposit deadlines auto-land in the payroll inbox. Nine forty one and W-twos generate themselves at quarter and year end.' },
    ],
  },

  setup: {
    overview:
      'Payroll runs sit on top of the time clock, employee tax setup, and direct deposit data captured at onboarding. Setup is one-time.',
    introBaseDur: 1200,
    introNarration: 'One-time setup. After that, runs are five minutes.',
    steps: [
      {
        icon: 'Calendar',
        title: 'Set pay schedule',
        body: 'Settings → Payroll. Weekly, biweekly, semimonthly, or monthly. Pay date offset from period end.',
        narration: 'Set the pay schedule. Weekly, biweekly, semimonthly.',
        baseDur: 4500,
      },
      {
        icon: 'MapPin',
        title: 'Tax registrations',
        body: 'Federal EIN, state withholding accounts (per state), unemployment (FUTA / SUI). Drives which taxes get withheld and where to deposit.',
        narration: 'Federal EIN. State withholding. Unemployment.',
        baseDur: 5000,
      },
      {
        icon: 'Users',
        title: 'Employee tax profiles',
        body: 'W-4 from onboarding flows in automatically. Confirm exemptions, allowances, extra withholding per employee.',
        narration: 'W-4 from onboarding flows in. Confirm extras per employee.',
        baseDur: 5000,
      },
      {
        icon: 'CheckCircle2',
        title: 'Run your first cycle',
        body: 'Payroll page → New Run → confirm hours → approve. Preview ladder shows gross to net. Approve and direct deposits queue.',
        narration: 'First run. Preview ladder shows gross to net. Approve.',
        baseDur: 5500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The full payroll engine — runs computed per pay period using IRS Pub 15-T percentage method for federal, state-specific tables for state withholding, FICA + Medicare + FUTA + SUI. Pulls hours from time_log, applies overtime rules per FLSA, computes piece-rate and commission bonuses, generates paystubs + ACH deposits + GL entries + tax liabilities.",

    howItWorks:
      "payroll_runs + payroll_run_lines tables. Time pull from time_log WHERE pay_period_start/end. Federal: IRS Pub 15-T percentage method tables embedded. State: per-state tables (Utah TC-40W, AZ A-4 etc). FICA 6.2% capped at SS wage base, Medicare 1.45% + 0.9% additional, FUTA 0.6% of first $7k, SUI per state. Overtime: FLSA — 1.5x over 40h/week. Piece-rate: employees.piece_rate × job_lines.qty_completed. ACH deposits via Stripe NetSuite-style file or direct ACH. Tax liabilities → payroll_inbox_tasks for EFTPS deposit deadlines.",

    examples: [
      'May 1-15 run → 8 employees × ~80 hours each → $42,180 gross → $32,420 net',
      'Federal withholding $4,200 → deposit due Friday after pay date → inbox task',
      'Quarter-end → 941 PDF auto-generated → filing status tracked',
    ],

    gotchas: [
      'IRS Pub 15-T published Dec for the next year — tables update annually. Job Scout updates centrally.',
      'Multi-state employees need state listed in employees.work_states[]. Otherwise default state withholding applies.',
      'Tip pay, bonus, and supplemental wages can use the 22% flat method or aggregate method — pick per employee.',
    ],

    faqs: [
      {
        q: 'Do you file my 941 / 940?',
        a: 'Generates the PDFs and tracks deadlines. Filing itself is one click via EFTPS API once you authorize it.',
      },
      {
        q: 'What about workers comp?',
        a: 'Per-employee class codes flow into the payroll run for class-code reporting at filing time.',
      },
    ],

    actions: {
      open: { route: '/payroll', label: 'Open Payroll' },
      inbox: { route: '/payroll-inbox', label: 'Payroll Inbox' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
