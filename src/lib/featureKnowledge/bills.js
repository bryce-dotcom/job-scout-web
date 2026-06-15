export default {
  id: 'bills',
  title: 'Bills',
  category: 'Books & Accounting',
  icon: 'FileText',
  route: '/bills',
  summary: 'Enter vendor bills, track AP aging, and run multi-bill payment batches — every expense allocated to a job so your cost-per-project is always accurate.',
  replaces: ['QuickBooks AP', 'Bill.com', 'manual check runs', 'email invoices tracked in spreadsheets'],
  highlights: [
    'Vendor bill entry',
    'AP aging summary',
    'Multi-bill payment runs',
    'Job cost allocation',
  ],
  marketing: {
    voice: 'Bill',
    scenes: [
      {
        id: 'list',
        baseDur: 4500,
        narration: 'Every vendor bill in one place — overdue balances jump out in red, and the AP aging bar at the top shows exactly where your $28k in payables sits.',
      },
      {
        id: 'bill',
        baseDur: 6500,
        narration: 'Open any bill to see the full detail: line items tied to real products, the job it belongs to, and an overdue badge that means business — then hit Pay Now before it costs you a vendor relationship.',
      },
      {
        id: 'pay',
        baseDur: 6500,
        narration: 'Record a check, ACH, or Zelle payment in seconds — or batch-pay every overdue bill in a single run so you never chase down who got paid and who didn\'t.',
      },
      {
        id: 'aging',
        baseDur: 4500,
        narration: 'The AP Aging report shows every vendor, every bucket, at a glance — spot who\'s been waiting 60-plus days and wipe out overdue balances with one click.',
      },
    ],
  },
  setup: {
    overview: 'Add your vendors, enter bills as they arrive, record payments, and review AP aging weekly to stay ahead of what you owe.',
    introBaseDur: 1200,
    introNarration: 'Four steps to full AP visibility.',
    steps: [
      {
        icon: 'Building2',
        title: 'Add your vendors',
        body: 'Inventory → Vendors → Add. Enter name, address, payment terms (Net 30, Net 60), and default job allocation. Plaid auto-matches bank transactions to known vendors.',
        narration: 'Start by setting up your vendor list with payment terms so every bill flows to the right place.',
        baseDur: 4500,
      },
      {
        icon: 'FileText',
        title: 'Enter bills as received',
        body: 'Bills → New Bill. Select a vendor, enter the bill number, total, due date, and line items. Link to a job for accurate job costing and attach the PDF if you have it.',
        narration: 'Log each bill the moment it lands so nothing slips past due without a record.',
        baseDur: 5000,
      },
      {
        icon: 'CreditCard',
        title: 'Record payments',
        body: 'Open a bill and hit Pay. Choose method and date. Or batch-pay multiple vendors in one run: Bills → Pay Multiple → select bills → Pay.',
        narration: 'Pay one bill or a dozen at once — every payment is logged with method, date, and reference number.',
        baseDur: 4500,
      },
      {
        icon: 'TrendingDown',
        title: 'Review AP aging weekly',
        body: 'Bills → Aging Report. Sort by oldest first. Pay overdue bills before they damage vendor relationships or trigger late fees.',
        narration: 'A weekly aging check keeps cash flow predictable and vendors happy.',
        baseDur: 5000,
      },
    ],
  },
  agentKnowledge: {
    whatItIs: 'Vendor bill entry and accounts payable management. Bills link to vendors, to jobs (for cost allocation), and to payments. AP aging is live-computed from unpaid balances.',
    howItWorks: 'bills table: id, company_id, vendor_id (FK vendors), bill_number, received_date, due_date, total_amount, paid_amount, balance_due, status (open/partially_paid/paid/overdue/void), job_id (nullable). bill_line_items: bill_id, product_id, description, qty, unit_cost, total. bill_payments: bill_id, payment_date, amount, payment_method, reference (check number). AP aging is computed on-the-fly from balance_due grouped by days-since-due buckets (current, 1-30, 31-60, 60+).',
    examples: [
      'Show me all overdue bills',
      'What do we owe Phoenix Supply Co?',
      'Which bills are linked to JOB-041?',
      'What is our total AP balance right now?',
      'List bills due in the next 7 days',
    ],
    gotchas: [
      'A bill status of "overdue" is set when due_date < today AND balance_due > 0 — it does not update retroactively if you back-date a payment.',
      'Job cost allocation requires the bill to have a non-null job_id; bills without a job_id show up in overhead, not project cost reports.',
      'Partial payments update paid_amount and recalculate balance_due; status moves to "partially_paid" automatically.',
      'Voided bills retain their records and payments for audit purposes but are excluded from aging and AP totals.',
    ],
    faqs: [
      {
        q: 'Can I pay multiple bills at once?',
        a: 'Yes — Bills → Pay Multiple, check the bills you want, choose method and date, and all payments are recorded in one action.',
      },
      {
        q: 'How does job costing work for bills?',
        a: 'Set job_id on the bill (or per line item). The job\'s cost summary pulls the bill total into materials/cost so project margin stays accurate.',
      },
      {
        q: 'What is the difference between a bill and an expense?',
        a: 'Bills are formal vendor invoices with line items, due dates, and AP aging tracking. Expenses are simpler one-line cost records (e.g., fuel, meals) without a vendor invoice workflow.',
      },
      {
        q: 'Can I attach the vendor\'s PDF invoice to a bill?',
        a: 'Yes — when entering or editing a bill you can upload a PDF that is stored in Supabase Storage and linked to the bill record.',
      },
    ],
    actions: {
      open: { route: '/bills', label: 'Open Bills' },
      new: { route: '/bills/new', label: 'New Bill' },
      aging: { route: '/bills/aging', label: 'AP Aging Report' },
    },
  },
  lastVerified: '2026-06-10',
  freshUntil: 90,
}
