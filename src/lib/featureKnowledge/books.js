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
      "The money cockpit for a trades business, computed live from the operating records — no separate ledger to keep in step. Money tab: cash across accounts, Money In / Money Out on a cash or accrual basis, a 90-day cash forecast with a floor, payroll cost, job margins, budget vs actual, fleet cost per vehicle, inventory at cost, memberships. Transactions: the Plaid feed with AI + rule categorization, deposit matching (including Venmo / Cash App / Zelle payouts), receipt links. Accounts: banks, wallets, and a balance-sheet position (receivables, inventory, bills, payroll taxes, sales tax, deposits held). Reports: standard reports, job costing with real labor, and a Year-End / CPA package with a double-entry journal, QuickBooks bank files, payroll, 1099-NEC, sales tax, depreciation.",

    howItWorks:
      "There is no posted general ledger. Every figure is derived from the source tables each time: revenue from payments (cash) or invoices (accrual) via revenueBasis.js; expenses from the bank feed + manual expenses + vendor bills + payroll runs (computeExpenses); AR from invoices net of payments (arHelpers); payroll from payroll_runs + paystubs + payroll_tax_liabilities; job costing from job_lines, time_clock × hourly rate, job_bonuses and tagged bank rows (reports.jobCosting); the cash forecast from open invoices, bills, payroll dates, tax deposits, memberships, payment plans and trailing spend (cashForecast.js). Tax lines: expense_categories.default_tax_category (Form 1065 line labels) and the AI's ai_form_1065_line on bank rows. The CPA package writes a balanced double-entry journal from those same sources on demand (journalExport.js).",

    examples: [
      'Customer pays a $4,200 invoice via Stripe → the payment row is cash revenue today; the Stripe payout hits the bank feed later and is linked, not counted again',
      'Plaid pulls a $389 truck repair → a rule or the AI tags Vehicle Expense → it is in Money Out and the Fleet card that day',
      'Payroll runs → gross wages + employer taxes show on the Payroll card and, on accrual, in Money Out; the tax deposits appear in the cash forecast on their due dates',
      'Year-End → one ZIP: categorized transactions, AR aging, payroll runs, tax-category summary, general journal, QuickBooks bank files',
    ],

    gotchas: [
      'Loans (Accounts tab → Loans & lines of credit): a liabilities row, typed in or created from a Plaid loan account (the bank link asks for the Liabilities product; sync_liabilities mirrors the balance and reads rate / next payment nightly). A payment is a loan_payments row; booking a matching bank outflow from the card VERIFIES it, categorises the bank row "Loan Payment", drops the balance by the principal, and Money Out counts only the interest (lib/loanMatch). A connected credit card is NOT a loan — it shows as "owed" under Cash Available.',
      'Venmo / Cash App / Zelle are wallets, not banks: Plaid never sees the wallet. Books tracks the wallet balance as a manual account (Accounts tab, with a running estimate) and reconciles the CASH-OUT when it lands in the real bank — Transactions tab, "Venmo (via bank feed)" filter, or the Match button on an unmatched deposit.',
      'Transactions without categories sit in Uncategorized → ignored by P&L until you tag them. Don\'t leave Uncategorized lingering.',
      'Form 1065 line mapping only matters for partnerships. Single-member LLCs report on Schedule C — different form.',
      'Because nothing is posted, a corrected input re-derives history: fix a category, a payment date or an asset life and every report moves with it. There is no period lock.',
      'Sales tax is computed once, when an invoice\'s lines are written, from the rate set on the Year-End tab. The invoice amount stays pre-tax; the customer total adds the tax.',
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
        q: 'Can I edit a transaction after month end?',
        a: 'Yes. Nothing is locked; every report recomputes from the source rows, so the change shows immediately. Tell your CPA if you change a period they have already filed.',
      },
      {
        q: 'Where do payroll, fleet and inventory show up in Books?',
        a: 'Money tab cards: Payroll (this month, YTD, agency money owed), Fleet costs (per vehicle, cost per mile, standard mileage at year end), Inventory (stock at cost, cost of goods used). Payroll counts in Money Out; fleet and inventory are views of spend already in the bank feed and of stock on hand.',
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
