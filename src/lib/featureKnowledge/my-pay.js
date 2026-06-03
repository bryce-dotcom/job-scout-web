// Knowledge Card — My Pay
// Employee paystub + tax-doc viewer + reimbursement balance.

export default {
  id: 'my-pay',
  title: 'My Pay',
  category: 'Payroll, HR & Onboarding',
  icon: 'Wallet',
  route: '/my-pay',

  summary:
    'Where every employee sees their own pay history — every stub, every year-to-date total, every W-2 and 1099. Direct deposit status, reimbursement balance, hours toward the next bonus. No HR ticket required.',

  replaces: ['Gusto employee dashboard', 'ADP iPay', 'paper paystubs', 'admin lookup tickets'],
  highlights: [
    'Per-employee paystub vault',
    'Year-to-date totals',
    'Reimbursement balance',
    'Tax docs (W-2, 1099)',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'stub',     baseDur: 4500, narration: 'Employee opens My Pay. Latest paystub right at the top — gross, deductions, net.' },
      { id: 'history',  baseDur: 6500, narration: 'Every stub for the year. Print, download, share with the bank. No HR ticket.' },
      { id: 'ytd',      baseDur: 6500, narration: 'Year-to-date totals. Gross, federal, state, FICA, net. Tax-time prep, easy.' },
      { id: 'reimburse',baseDur: 6500, narration: 'Reimbursement balance — three receipts pending, two hundred eighteen dollars. Pays out next cycle.' },
      { id: 'taxdocs',  baseDur: 5500, narration: 'Year end — W-two appears here automatically. One click to download for TurboTax.' },
    ],
  },

  setup: {
    overview:
      "My Pay is on by default for every employee. As soon as a payroll run posts, their stub appears. No setup — but encourage employees to bookmark it on their phone.",
    introBaseDur: 1200,
    introNarration: 'Zero setup. Stubs land here automatically.',
    steps: [
      {
        icon: 'Smartphone',
        title: 'Employee bookmarks the URL',
        body: 'Tell each employee to open /my-pay on their phone and add to home screen. Pay history is always one tap away.',
        narration: 'Employee bookmarks My Pay on their phone. One tap away.',
        baseDur: 5000,
      },
      {
        icon: 'CreditCard',
        title: 'Direct deposit captured',
        body: 'During onboarding, the new hire saves their bank account. My Pay shows last 4 + bank name (encrypted server-side via pgcrypto).',
        narration: 'Direct deposit captured during onboarding. Last four shown.',
        baseDur: 5000,
      },
      {
        icon: 'PlayCircle',
        title: 'Run payroll',
        body: 'When admin posts a payroll run, each employee\'s stub auto-publishes to their My Pay. SMS notification optional.',
        narration: 'Run payroll. Stubs auto-publish to My Pay.',
        baseDur: 4500,
      },
      {
        icon: 'FileBadge',
        title: 'Tax docs at year-end',
        body: 'When the year-end tax run posts W-2 / 1099, they appear in the Tax Docs tab. PDF download + e-filed reference.',
        narration: 'Year-end. W-2 and 1099 land in Tax Docs automatically.',
        baseDur: 5000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Per-employee self-service pay portal. Reads payroll_run_lines + tax_filings + expense_reimbursements scoped to the logged-in employee. Renders paystubs (via the same pdfme template payroll uses) and tax docs (W-2, 1099-NEC) with year-to-date rollups.",

    howItWorks:
      "Backed by payroll_run_lines (employee_id scoped query), tax_filings.snapshot_jsonb for W-2/1099, expense_reimbursements aggregate for the balance card. Direct deposit status reads from employees.direct_deposit_account_id (only last 4 returned). All routes RLS-locked to the auth.uid().",

    examples: [
      'Cole opens /my-pay → sees biweekly stubs for 2026 → YTD gross $44k, net $33k',
      'Marcus: 3 receipts pending reimbursement → $218.40 → "pays on June 5"',
      'Year-end: Cole\'s W-2 appears Jan 31 → downloads PDF for TurboTax',
    ],

    gotchas: [
      'Stubs are immutable once posted. Corrections require a payroll-run void + amendment (not a stub edit).',
      'Reimbursement balance shows un-paid out approved expenses. Pending-approval expenses don\'t count yet.',
      'My Pay is per-employee. An admin viewing another employee\'s pay uses /payroll, not /my-pay.',
    ],

    faqs: [
      {
        q: 'Can I print my W-2 myself?',
        a: 'Yes — Tax Docs → W-2 → Download PDF. The same form your CPA wants.',
      },
      {
        q: 'How fast does direct deposit hit?',
        a: 'ACH lands the morning of pay date (in most cases). Some banks hold for one extra business day on the first deposit.',
      },
    ],

    actions: {
      open: { route: '/my-pay', label: 'Open My Pay' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
