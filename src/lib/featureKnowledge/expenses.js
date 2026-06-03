// Knowledge Card — Expenses
// Receipt capture, categorize, allocate to job.

export default {
  id: 'expenses',
  title: 'Expenses',
  category: 'Books & Accounting',
  icon: 'Receipt',
  route: '/expenses',

  summary:
    "Snap a receipt, Dougie reads it, categorize it, allocate to a job — three taps. Materials, fuel, tools, lunch with the customer. Every expense lands in Books and rolls into job costing.",

  replaces: ['Expensify', 'Ramp', 'Brex', 'shoebox full of receipts'],
  highlights: [
    'Receipt photo → OCR',
    'AI category + confidence',
    'Job allocation per receipt',
    'Reimbursable flag for techs',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'snap',     baseDur: 4500, narration: 'Tech buys parts at the supply house. Snaps the receipt on the way out the door.' },
      { id: 'ocr',      baseDur: 6500, narration: 'Dougie reads it — vendor, amount, tax, line items. Two seconds, fields auto-fill.' },
      { id: 'category', baseDur: 6500, narration: 'AI tags Materials at ninety-two percent confidence. Tech taps Approve.' },
      { id: 'job',      baseDur: 6500, narration: 'Allocate to Job JOB-twenty-one-forty-seven. The expense lands in that job\'s costing.' },
      { id: 'reimburse',baseDur: 5500, narration: 'Flag as reimbursable. Owner sees it in payroll inbox. Tech gets it back on next paycheck.' },
    ],
  },

  setup: {
    overview:
      "Expenses just work once Dougie is unlocked. Set categories you actually use and pick a reimbursement policy.",
    introBaseDur: 1200,
    introNarration: 'Unlock Dougie. Set categories. Done.',
    steps: [
      {
        icon: 'Bot',
        title: 'Unlock Dougie',
        body: 'Settings → AI Agents → Dougie OCR. He reads the receipts and pre-fills fields.',
        narration: 'Unlock Dougie. He reads the receipts.',
        baseDur: 4500,
      },
      {
        icon: 'ListTree',
        title: 'Confirm categories',
        body: 'Settings → Expense Categories. Pre-seeded: Materials, Fuel, Tools, Subcontractor, Meals, Office. Add yours.',
        narration: 'Confirm your expense categories. Pre-seeded for trades.',
        baseDur: 4500,
      },
      {
        icon: 'CreditCard',
        title: 'Reimbursement policy',
        body: 'Settings → Expenses → Reimbursable categories. Pick which categories count for tech reimbursement (typically Materials + Fuel + Tools when paid out of pocket).',
        narration: 'Pick which categories are reimbursable to techs.',
        baseDur: 5000,
      },
      {
        icon: 'Smartphone',
        title: 'Tech snaps a receipt',
        body: 'Field Scout → Expenses → New → photo. Dougie reads + AI categorizes. Tech allocates to job, taps Save.',
        narration: 'Tech snaps the receipt. Dougie reads. Done in three taps.',
        baseDur: 5000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The expense-capture pipeline. Receipt photo → Dougie OCR → AI category suggestion → admin/tech approval → posted to general ledger → optionally allocated to a job → optionally flagged for tech reimbursement.",

    howItWorks:
      "expenses table (company_id scoped) + expense_job_allocations (many-to-one allocations, one expense can split across multiple jobs). Dougie's OCR runs in the dougie-analyze Edge Function — Gemini Vision returns structured JSON (vendor, total, tax, line_items, date). AI categorization reuses the Plaid categorization model. expense_reimbursements is the per-employee unpaid balance, settled via payroll bonus_lines.",

    examples: [
      'Cole buys $389 at Lowes → photo → Dougie: vendor=Lowes, total=389.42 → Materials → JOB-2147 → not reimbursable (company card)',
      'Marcus drops $42 on lunch with customer → photo → Meals → JOB-2150 → flagged reimbursable',
      'Truck repair $1,240 → photo → Vehicle Expense → no job allocation (overhead)',
    ],

    gotchas: [
      'Receipts older than 30 days flag for admin review — keeps employees from dumping a backlog on payroll day.',
      'A job-allocated expense reduces that job\'s margin. Forgotten allocations make jobs look more profitable than they are.',
      'Personal-card reimbursable expenses need a real receipt photo. Hand-entered amounts without a photo route to manager approval.',
    ],

    faqs: [
      {
        q: 'How does this differ from Plaid expense tracking?',
        a: 'Plaid is the BANK side (transactions that already hit the card). Expenses are the RECEIPT side (anyone\'s photo). They reconcile — Books matches Plaid transactions to expense entries.',
      },
      {
        q: 'Can I bulk-import historical expenses?',
        a: 'Yes — Data Console → Bulk Ops → Expenses → CSV. Each row: date, vendor, amount, category, job_id (optional).',
      },
    ],

    actions: {
      open: { route: '/expenses', label: 'Open Expenses' },
      books: { route: '/books', label: 'Open Books' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
