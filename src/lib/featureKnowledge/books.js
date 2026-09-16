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
    'Venmo · Cash App · Zelle payouts reconcile themselves',
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
      'Venmo / Cash App / Zelle are wallets, not banks: Plaid never sees the wallet. Books tracks the wallet balance as a manual account (Accounts tab, with a running estimate) and reconciles the CASH-OUT when it lands in the real bank — Transactions tab, "Venmo (via bank feed)" filter, or the Match button on an unmatched deposit.',
      'Transactions without categories sit in Uncategorized → ignored by P&L until you tag them. Don\'t leave Uncategorized lingering.',
      'Form 1065 line mapping only matters for partnerships. Single-member LLCs report on Schedule C — different form.',
      'Locking a reconciled period prevents back-dated edits. Unlock requires admin role.',
    ],

    faqs: [
      {
        q: 'How do I take Venmo, Cash App or Zelle?',
        a: 'Settings → My Money, turn the wallet on and enter the handle (business or personal profile). From then on invoice emails, the customer portal, the invoice PDF and FieldScout all show where to send it. Record the payment on the invoice (or FieldScout records it) and it appears under Books → Payments with its method.',
      },
      {
        q: 'A Venmo cash-out hit the bank — do I record it as income again?',
        a: 'No. The payments were already recorded. Books matches the cash-out to them: automatically when the payments add up unambiguously, otherwise the Match button on the deposit offers "Link all N" (business-profile fees are accounted for). Linked deposits leave the unmatched list and never double-count.',
      },
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

  lastVerified: '2026-09-15',
  freshUntil: 90,
}
