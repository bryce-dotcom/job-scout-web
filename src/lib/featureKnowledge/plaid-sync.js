// Knowledge Card — Plaid Bank Sync
// Auto-pull transactions, AI categorize, learning rules engine.

export default {
  id: 'plaid-sync',
  title: 'Plaid Bank Sync',
  category: 'Books & Accounting',
  icon: 'Landmark',
  route: '/books',

  summary:
    'Connect any bank in 30 seconds — Plaid pulls transactions nightly, AI categorizes them, and a learning rules engine remembers your corrections so it gets smarter every week.',

  replaces: ['QuickBooks bank feeds', 'Xero bank feeds', 'Yodlee', 'manual bank import'],
  highlights: [
    'Plaid OAuth — 12,000+ banks',
    'AI category + confidence score',
    'Learning rules from your edits',
    'Auto-match deposits to invoices',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'connect', baseDur: 4500, narration: 'Connect your bank. Plaid OAuth. Thirty seconds. Twelve thousand banks supported.' },
      { id: 'pull',    baseDur: 6500, narration: 'Overnight, Plaid pulls every transaction — checking, savings, credit cards.' },
      { id: 'tag',     baseDur: 6500, narration: 'AI tags each one. Vehicle expense, utilities, materials. Each tag carries a confidence score.' },
      { id: 'rule',    baseDur: 6500, narration: 'Override a tag and the system remembers. Next time Home Depot lands, it tags Materials automatically.' },
      { id: 'match',   baseDur: 5500, narration: 'Incoming deposits match outstanding invoices. AR closes itself.' },
    ],
  },

  setup: {
    overview:
      'Plaid is the easiest setup in Job Scout. Connect once, the rest is automatic. Make sure to set Approve thresholds so high-confidence tags don\'t need manual sign-off.',
    introBaseDur: 1200,
    introNarration: 'Connect once. The rest is automatic.',
    steps: [
      {
        icon: 'Link',
        title: 'Connect bank',
        body: 'Books → Connect Bank → Plaid Link. Sign into your bank, pick the accounts to share, done.',
        narration: 'Connect Bank. Sign in. Pick accounts. Done.',
        baseDur: 4500,
      },
      {
        icon: 'Sparkles',
        title: 'AI categorizes the backlog',
        body: 'Plaid pulls 90 days of history on connect. AI runs through it and tags everything with a confidence score.',
        narration: 'AI runs through ninety days of history and tags everything.',
        baseDur: 5000,
      },
      {
        icon: 'Sliders',
        title: 'Set auto-approve threshold',
        body: 'In Settings, set confidence threshold (default 90%). Tags above it post automatically; below it queue for review.',
        narration: 'Set the auto-approve threshold. Default ninety percent.',
        baseDur: 5000,
      },
      {
        icon: 'CheckCheck',
        title: 'Review and correct',
        body: 'Books → Review tab. Skim the low-confidence rows. Your corrections become rules. The system gets smarter every week.',
        narration: 'Review the queue. Corrections become rules. Smarter every week.',
        baseDur: 5500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The bank-feed integration that pulls bank + credit card transactions into Job Scout via Plaid, AI-categorizes them against the chart of accounts, and writes them to the general ledger. Includes a learning rules engine so user corrections turn into automatic rules.",

    howItWorks:
      "Plaid OAuth Link captures access_token + institution_id, stored encrypted in bank_accounts. Nightly sync-plaid Edge Function calls Plaid /transactions/sync, upserts into bank_transactions. AI categorization via Gemini → bank_transactions.suggested_category + confidence_score. plaid_categorization_rules table holds per-company rules (merchant_name regex → category) learned from user corrections. Auto-match: bank_transactions.amount and date matched against invoices.balance_due via Edge Function.",

    examples: [
      'Connect Chase business checking → 90 days back-pulled in ~2 min',
      'Plaid pulls Lowes $389.42 → AI tags Materials at 94% → posts automatically',
      'User overrides Verizon $128 from Utilities to Phone → rule learned → next month tags Phone',
    ],

    gotchas: [
      'Plaid throttles at 1 sync per 6 hours per item — your sync may lag overnight, not real-time.',
      'Auto-match needs the deposit amount to exactly match the invoice balance. $4,202 vs $4,200 (fee) won\'t auto-link.',
      'Plaid relinks expire after ~12 months on some banks. The Books page surfaces a re-auth banner when this happens.',
    ],

    faqs: [
      {
        q: 'Does Plaid charge me?',
        a: 'Job Scout pays the Plaid bill. You don\'t see it on your bank.',
      },
      {
        q: 'What about credit cards?',
        a: 'Plaid supports business credit cards too. Connect them the same way; transactions land as Cash credits and Expense debits.',
      },
    ],

    actions: {
      open: { route: '/books', label: 'Open Books' },
      review: { route: '/books?tab=review', label: 'Review queue' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
