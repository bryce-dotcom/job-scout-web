// Knowledge Card — Expenses
// Snap the receipt, Dougie reads it, it lands on the job and in Books.
//
// 2026-10-04: written from the code, twice in one day. The morning version
// said nothing reads the receipt — wrong, scan-receipt had read a new
// receipt since September. The afternoon build made Dougie the reader
// behind every entry point (lib/receiptReader.js): the Expenses page, the
// job page, Field Scout, and a bank row in Books. Books matches the receipt
// to the bank charge (lib/expenseMatch.js autoLinkReceipts).

export default {
  id: 'expenses',
  title: 'Expenses',
  category: 'Books & Accounting',
  icon: 'Receipt',
  route: '/expenses',

  summary:
    "Snap the receipt and Dougie reads it: merchant, total, date, what was bought, the category and its tax line. From the job in the field it lands on that job's costing; in Books it is matched to the bank charge so the money counts once.",

  replaces: ['Expensify', 'Ramp', 'Brex', 'shoebox full of receipts'],
  highlights: [
    'Receipt photo or PDF → Dougie reads it',
    'Category + tax line from the receipt',
    'On the job, in the field, for job costing',
    'Books matches it to the bank charge',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'snap',     baseDur: 4500, narration: 'Tech buys parts at the supply house. Snaps the receipt on the job, on the way out the door.' },
      { id: 'log',      baseDur: 6500, narration: 'Dougie reads it. Lowes, three eighty-nine forty-two, today, LED high bays. Job Materials, cost of goods sold.' },
      { id: 'category', baseDur: 6500, narration: 'It is on the job already. Job costing moves before the truck does.' },
      { id: 'job',      baseDur: 6500, narration: 'Two days later the charge lands in the bank. Books matches it to the receipt. Counted once.' },
      { id: 'books',    baseDur: 5500, narration: 'Owner opens Books. The receipt is on the row, the margin is honest, year end is already done.' },
    ],
  },

  setup: {
    overview:
      "Nothing to unlock. Confirm the expense categories in Books, then snap receipts where you are: on the job in Field Scout, on the job page, on the Expenses page, or onto a bank row in Books.",
    introBaseDur: 1200,
    introNarration: 'Confirm your categories. Snap receipts where you are.',
    steps: [
      {
        icon: 'ListTree',
        title: 'Confirm categories',
        body: 'Books → Transactions → Manage categories. Every company starts with the shared construction list (Job Materials, Fuel, Equipment Rental, Permits & Inspections, Subcontractors, Meals and forty more), each mapped to its tax line. Dougie picks from this list.',
        narration: 'Confirm your expense categories. Dougie picks from them.',
        baseDur: 4500,
      },
      {
        icon: 'Smartphone',
        title: 'Snap it on the job',
        body: 'Field Scout → the job → Receipt, or the job page → Snap receipt. Dougie reads the photo or PDF and the expense lands on the job with the merchant, total, date, category and tax line. If he cannot read it, the photo is still on the job at $0 until someone types the amount.',
        narration: 'Snap it on the job. Dougie reads it. It is costed to the job.',
        baseDur: 5500,
      },
      {
        icon: 'Landmark',
        title: 'Books matches the charge',
        body: 'When the card charge lands in the bank feed, Books links it to the receipt when the match is unmistakable (same cents, within days, no other candidate). Looser matches are offered on the bank row as "Looks like a recorded expense". A bank row with no receipt takes one: Attach receipt — Dougie reads it.',
        narration: 'When the charge lands, Books matches it. The money counts once.',
        baseDur: 5500,
      },
      {
        icon: 'Upload',
        title: 'Bring in history',
        body: 'Expenses → Import. A CSV with date, merchant, amount and category; export the same way for your CPA.',
        narration: 'Import history from a CSV. Export for your CPA.',
        baseDur: 4500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The receipt side of the books. A receipt handed in anywhere — Field Scout on the job, the job page, the Expenses page, or a bank row in Books — is read by Dougie into an expense: merchant, total, date, what was bought, the company's category and its tax line, the job. Bank-side spending comes in through Plaid; Books matches the two so the money counts once and the receipt rides on the bank row.",

    howItWorks:
      "expenses table (company_id scoped): category, tax_category, form_1065_category, account, business unit, client, merchant/vendor, source ('receipt' when snapped), description, date, amount, status, notes, job_id, receipt_url, receipt_storage_path, plaid_transaction_id. lib/receiptReader.js uploads the file to the project-documents bucket (expenses/receipts/ or jobs/<id>/receipts/), calls the scan-receipt Edge Function in 'expense' mode (Claude vision, image or PDF, the company's category names passed in so the pick is one of them), and maps the result onto the row; a form only gets its blanks filled. Matching: lib/expenseMatch.js — autoLinkReceipts links a receipt and a bank row that are unmistakably the same money (exact cents, within 5 days, receipt or shared merchant word, one candidate each way) via the categorize-transactions 'reconcile' action, run when Books loads and right after a receipt is saved; suggestExpensesForTransaction offers looser matches on the bank row. Job costing (lib/reports.js jobCosting) counts receipt rows with a job_id, and skips one whose matched bank row already counted toward the job.",

    examples: [
      'Cole buys $389.42 at Lowes → Field Scout → the job → Receipt → Dougie: Lowes · $389.42 · today · Job Materials → on JOB-2147 costing → Thursday the Visa charge lands → Books links it, counted once',
      'Marcus drops $42 on lunch with a customer → Expenses → Snap or upload receipt → Meals (50% deductible) → JOB-2150',
      'A $1,240 truck repair sits unexplained on the bank feed → Books → the row → Attach receipt → Dougie reads the invoice → Repairs & Maintenance, receipt on the row',
    ],

    gotchas: [
      'Dougie fills blanks and never overwrites what a person typed; check the total when the receipt is crumpled or the photo is dark.',
      'A receipt he could not read is still saved to the job at $0 with a description saying so; add the amount by hand or it costs the job nothing.',
      'Books only auto-links an exact match; a tip or a split tender changes the cents and leaves it as a suggestion on the bank row for a person to confirm.',
      'A job-linked expense reduces that job\'s margin. Forgotten links make jobs look more profitable than they are.',
    ],

    faqs: [
      {
        q: 'How does this differ from Plaid expense tracking?',
        a: 'Plaid is the BANK side (transactions that already hit the card or account), categorised on Books. Expenses are the RECEIPT side (something a person logged). Books shows both.',
      },
      {
        q: 'Can I bulk-import historical expenses?',
        a: 'Yes — Expenses → Import, a CSV with date, merchant, amount and category.',
      },
      {
        q: 'Does Dougie read receipts?',
        a: 'Yes. Snap or upload a receipt (photo or PDF) in Field Scout on the job, on the job page, on the Expenses page, or onto a bank row in Books. Dougie reads the merchant, total, date, what was bought, and picks the category and tax line from your own list. Books then matches it to the bank charge.',
      },
      {
        q: 'How does a receipt from the field get into job costing?',
        a: 'Snap it on the job in Field Scout (or the job page). It is saved as an expense on that job the moment Dougie reads it, and the job\'s profitability counts it right away. When the card charge lands in the bank, Books links the two so it is counted once.',
      },
    ],

    actions: {
      open: { route: '/expenses', label: 'Open Expenses' },
      books: { route: '/books', label: 'Open Books' },
    },
  },

  lastVerified: '2026-10-04',
  freshUntil: 90,
}
