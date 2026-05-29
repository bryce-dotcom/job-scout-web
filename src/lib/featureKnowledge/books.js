// Knowledge Card — Books
// Full accounting cockpit — P&L, chart of accounts, reconciliation,
// IRS Form 1065 line mapping.

export default {
  id: 'books',
  title: 'Books',
  category: 'Books & Accounting',
  icon: 'BookOpen',
  route: '/books',

  summary:
    "The full accounting cockpit — chart of accounts, P&L by month/quarter/year, bank reconciliation, transaction edit modal with IRS Form 1065 line mapping. Your QuickBooks replacement that doesn't charge per user.",

  replaces: ['QuickBooks Online', 'Xero', 'Wave', 'FreshBooks accounting'],
  highlights: [
    'Form 1065 line mapping',
    'Bank reconciliation',
    'Job allocation per transaction',
    'P&L · Balance Sheet · Cash Flow',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'pnl',     baseDur: 4500, narration: 'Open Books. Profit and loss for the month, the quarter, the year.' },
      { id: 'tx',      baseDur: 6500, narration: 'Every transaction lives here — bank feed, expense, invoice payment, payroll. Click one to drill in.' },
      { id: 'edit',    baseDur: 6500, narration: 'Edit the row. Category, IRS Form ten sixty-five line, job allocation, taxable flag. All the metadata your CPA actually wants.' },
      { id: 'recon',   baseDur: 6500, narration: 'Reconcile to your bank statement in two clicks — Plaid balance versus book balance, drift in green, done.' },
      { id: 'export',  baseDur: 5500, narration: 'Export the P and L, the balance sheet, the trial balance. CPA loves you. Tax time is quiet.' },
    ],
  },

  setup: {
    overview:
      'Books sits on top of every other money-moving thing in Job Scout — invoices, payroll, expenses, Plaid. Connect Plaid once and most of it populates automatically.',
    introBaseDur: 1200,
    introNarration: "Here's how to get Books loaded up.",
    steps: [
      {
        icon: 'Landmark',
        title: 'Connect your bank with Plaid',
        body: 'Books page, top-right, Connect Bank. Plaid OAuth links your business checking + savings in 30 seconds.',
        narration: 'Connect your bank with Plaid. Takes thirty seconds.',
        baseDur: 5000,
      },
      {
        icon: 'ListTree',
        title: 'Confirm chart of accounts',
        body: 'Pre-built for trades — labor income, materials, vehicle expense, etc. Add custom accounts if your CPA wants them.',
        narration: 'Confirm the chart of accounts. Pre-built for trades.',
        baseDur: 5000,
      },
      {
        icon: 'Tag',
        title: 'Let AI categorize',
        body: 'New Plaid transactions get an AI category + confidence score. Approve, edit, or override — your overrides become rules.',
        narration: 'Let AI categorize. Your overrides become rules.',
        baseDur: 5500,
      },
      {
        icon: 'CheckSquare',
        title: 'Reconcile monthly',
        body: 'End of month, Reconcile tab, compare Plaid ending balance to book balance. Sign off, lock the period.',
        narration: 'Reconcile monthly. Plaid balance versus book balance. Sign off.',
        baseDur: 5500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The full GAAP-light accounting cockpit. Chart of accounts, double-entry ledger, P&L + Balance Sheet + Cash Flow + Trial Balance, IRS Form 1065 line mapping, bank reconciliation, job-level cost allocation. Sits on top of bank_transactions (Plaid), invoices, payments, expenses, payroll_runs.",

    howItWorks:
      "Chart of accounts in chart_of_accounts (per-company, pre-seeded for trades). Every money event writes to general_ledger via triggers (invoice paid → AR + Income; expense → Cash/CC + Expense). Form 1065 mapping in chart_of_accounts.form_1065_line. P&L view materializes from general_ledger by month/quarter/year. Reconciliation compares Plaid bank_accounts.ending_balance to general_ledger sum for the cash account.",

    examples: [
      'Customer pays $4,200 invoice via Stripe → trigger writes Cash +4200, AR -4200 to GL',
      'Plaid pulls $389 truck repair → AI tags Vehicle Expense → GL writes Cash -389, Vehicle Expense +389',
      'End of May → reconcile: Plaid ending balance $42,118 = GL cash balance $42,118 ✓',
    ],

    gotchas: [
      'Transactions without categories sit in Uncategorized → ignored by P&L until you tag them. Don\'t leave Uncategorized lingering.',
      'Form 1065 line mapping only matters for partnerships. Single-member LLCs report on Schedule C — different form.',
      'Locking a reconciled period prevents back-dated edits. Unlock requires admin role.',
    ],

    faqs: [
      {
        q: 'Do I still need a CPA?',
        a: 'For tax filing, yes. But Books gives them clean books they can actually trust — no QuickBooks cleanup engagement.',
      },
      {
        q: 'Can I edit a reconciled transaction?',
        a: 'Not without unlocking the period. Locked periods are immutable to preserve the trial balance.',
      },
    ],

    actions: {
      open: { route: '/books', label: 'Open Books' },
      plaid: { route: '/books', label: 'Connect Bank', hint: 'Top-right Plaid button' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
