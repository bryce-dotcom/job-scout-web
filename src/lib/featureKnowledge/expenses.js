// Knowledge Card — Expenses
// Log an expense, attach the receipt photo, tie it to a job.
//
// 2026-10-04: this card used to say Dougie reads the receipt and pre-fills
// the form, with an "Unlock Dougie" setting and a 30-day backlog rule. None
// of that exists. Dougie reads handwritten takeoff sheets for Lenard
// (dougie.js); the Expenses form stores the photo and reads nothing. Written
// from src/pages/Expenses.jsx, not from the roadmap.

export default {
  id: 'expenses',
  title: 'Expenses',
  category: 'Books & Accounting',
  icon: 'Receipt',
  route: '/expenses',

  summary:
    "Log what was spent, attach the receipt photo, tie it to a job. Materials, fuel, tools, lunch with the customer. Every expense lands in Books and rolls into job costing.",

  replaces: ['Expensify', 'Ramp', 'Brex', 'shoebox full of receipts'],
  highlights: [
    'Receipt photo on the row',
    'Category + tax line on every expense',
    'Job link per expense',
    'CSV import and export',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'snap',     baseDur: 4500, narration: 'Tech buys parts at the supply house. Snaps the receipt on the way out the door.' },
      { id: 'log',      baseDur: 6500, narration: 'Merchant, amount, date, the photo. Thirty seconds on the phone.' },
      { id: 'category', baseDur: 6500, narration: 'Materials. Cost of goods sold on the tax line. Books is already right.' },
      { id: 'job',      baseDur: 6500, narration: 'Tie it to Job JOB-twenty-one-forty-seven. The expense lands in that job\'s costing.' },
      { id: 'books',    baseDur: 5500, narration: 'Owner opens Books. The receipt is there, the margin is honest, year end is already done.' },
    ],
  },

  setup: {
    overview:
      "Nothing to unlock. Confirm the expense categories in Books, then log expenses from the Expenses page as they happen.",
    introBaseDur: 1200,
    introNarration: 'Confirm your categories. Log as you go.',
    steps: [
      {
        icon: 'ListTree',
        title: 'Confirm categories',
        body: 'Books → Transactions → Manage categories. Every company starts with the shared construction list (Job Materials, Fuel, Equipment Rental, Permits & Inspections, Subcontractors, Meals and forty more), each mapped to its tax line. Add your own on top.',
        narration: 'Confirm your expense categories. Pre-seeded for construction.',
        baseDur: 4500,
      },
      {
        icon: 'Smartphone',
        title: 'Log an expense',
        body: 'Expenses → New. Merchant, amount, date, category and tax line, the job it belongs to, and the receipt photo. Save.',
        narration: 'Log the expense. Attach the receipt. Save.',
        baseDur: 5000,
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
      "The receipt side of the books: an expense a person logged by hand, with the receipt photo attached, categorised, given a tax line, and optionally tied to a job. Bank-side spending comes in through Plaid on Books; these are the ones somebody paid and wants on the record.",

    howItWorks:
      "expenses table (company_id scoped): category (free text, offered from the Books category list), tax_category, form_1065_category, account, business unit, client, merchant, source, description, date, amount, status (Pending by default), notes, job_id. The receipt is uploaded to the project-documents bucket under expenses/receipts/ and shown as a thumbnail with a signed URL; nothing reads it. Job-linked expenses feed job costing. The page has CSV import and export.",

    examples: [
      'Cole buys $389 at Lowes → Expenses → New → merchant Lowes, $389.42, Job Materials, Cost of goods sold, JOB-2147, receipt photo → Save',
      'Marcus drops $42 on lunch with customer → Meals (50% deductible) → JOB-2150',
      'Truck repair $1,240 → Repairs & Maintenance → no job (overhead)',
    ],

    gotchas: [
      'Nothing reads the receipt photo on this page. A photo dropped into Arnie\'s or Frankie\'s chat box is read there; the Expenses form takes typed fields.',
      'A job-linked expense reduces that job\'s margin. Forgotten links make jobs look more profitable than they are.',
      'Category is free text on the row; pick from the list so Books and Frankie roll it up under one name.',
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
        a: 'No. Dougie reads handwritten lighting takeoff sheets inside Lenard. To have a receipt read, drop the photo into Arnie or Frankie and ask.',
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
