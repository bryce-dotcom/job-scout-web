export default {
  id: 'lead-payments',
  title: 'Deposits & Lead Payments',
  category: 'Books & Accounting',
  icon: 'CreditCard',
  route: '/lead-payments',
  summary: 'Collect deposits at the time of signing — linked to the estimate, tracked against the lead, and auto-applied when the final invoice is created.',
  replaces: ['Stripe manual invoices', 'Square payment links', 'check deposits', 'Venmo/Zelle'],
  highlights: [
    'Deposit tied to estimate',
    'Stripe payment link',
    'Applied to final invoice',
    'Payment history per lead',
  ],
  marketing: {
    voice: 'Bill',
    scenes: [
      {
        id: 'list',
        baseDur: 4500,
        narration: 'Every deposit and lead payment in one place — who paid, how much, and whether it\'s already been applied to their invoice.',
      },
      {
        id: 'create',
        baseDur: 6500,
        narration: 'Collecting a deposit takes seconds. Pick the estimate, enter the amount, and send a Stripe link — or mark it received if they paid cash or check.',
      },
      {
        id: 'stripe',
        baseDur: 6500,
        narration: 'JobScout generates a Stripe payment link and fires it off by SMS and email. You can track exactly when it was opened and when it was paid.',
      },
      {
        id: 'applied',
        baseDur: 4500,
        narration: 'When the final invoice is created, the deposit auto-applies as a credit line — no math, no manual entry, just a clean balance due.',
      },
    ],
  },
  setup: {
    overview: 'Connect Stripe, set your default deposit percentage, and JobScout handles collection, tracking, and invoice application automatically.',
    introBaseDur: 1200,
    introNarration: 'Four steps to get deposits flowing.',
    steps: [
      {
        icon: 'CreditCard',
        title: 'Connect Stripe',
        body: 'Settings → Integrations → Stripe → Connect. Link your existing Stripe account or create a new one. Takes about five minutes.',
        narration: 'Connect Stripe once and every payment link from that point forward is live.',
        baseDur: 4500,
      },
      {
        icon: 'DollarSign',
        title: 'Set default deposit %',
        body: 'Settings → Payments → Default deposit: 20% of estimate total or a fixed amount. Shown as a suggestion whenever you collect a deposit.',
        narration: 'Set your default once — JobScout pre-fills the amount every time so you\'re never starting from zero.',
        baseDur: 5000,
      },
      {
        icon: 'Link',
        title: 'Link deposits to estimates',
        body: 'Always link the deposit to the estimate at creation. When the estimate converts to a job and invoice, the deposit auto-applies as a credit line.',
        narration: 'The link is what makes the auto-apply magic work — skip it and you\'ll be matching payments manually.',
        baseDur: 4500,
      },
      {
        icon: 'FileText',
        title: 'Reconcile in Books',
        body: 'Lead payments sync to the Books module automatically. A deposit creates a liability entry until the invoice is created, then auto-clears when applied.',
        narration: 'Your books stay clean without any extra steps — deposits land in the right bucket and clear themselves.',
        baseDur: 5000,
      },
    ],
  },
  agentKnowledge: {
    whatItIs: 'Deposit and partial payment collection, linked to leads/estimates, processed via Stripe or manually recorded. Auto-applies to final invoice.',
    howItWorks: 'lead_payments table: id, lead_id, estimate_id (nullable), invoice_id (nullable), company_id, amount, payment_type (deposit/partial/full), status (pending/paid/refunded), stripe_payment_intent_id, stripe_payment_link_id, method (stripe/cash/check/zelle), paid_at, notes. On deposit paid → create a credit_memo linked to invoice_id. On invoice create from estimate → auto-link pending deposits. Books: deposit creates a liability entry; application flips it to revenue.',
    examples: [
      'Collect a 20% deposit on EST-041 ($24,500) → send Stripe link for $4,900',
      'Mark a $500 cash deposit as received on lead for Northbridge Logistics',
      'Show me all deposits collected this month',
      'Which deposits haven\'t been applied to an invoice yet?',
      'Refund the deposit on lead #88 — customer cancelled',
    ],
    gotchas: [
      'Deposits must be linked to an estimate at creation for auto-apply to work on invoice generation',
      'Stripe payment links expire in 24 hours by default — resend if customer hasn\'t paid',
      'Cash/check deposits marked as received are not verified by Stripe — they rely on manual confirmation',
      'Refunding a deposit that has already been applied to an invoice requires voiding or editing the invoice first',
      'Each deposit belongs to a company_id — multi-tenant, never visible across companies',
    ],
    faqs: [
      {
        q: 'What happens to the deposit when I create the final invoice?',
        a: 'If the deposit is linked to the estimate, JobScout auto-links it to the new invoice and adds a "Deposit Applied" credit line. The balance due reflects the deduction.',
      },
      {
        q: 'Can I collect a partial payment instead of a deposit?',
        a: 'Yes — payment_type can be deposit, partial, or full. All three are tracked the same way and auto-apply to the invoice.',
      },
      {
        q: 'Does the customer get a receipt?',
        a: 'Stripe sends an automatic receipt on payment. For cash/check payments marked as received, you can send a receipt from the lead payments detail view.',
      },
      {
        q: 'How does this show up in Books?',
        a: 'A paid deposit creates a liability entry (deferred revenue). When it\'s applied to an invoice, the liability clears and the amount moves to revenue.',
      },
      {
        q: 'Can I take a deposit without an estimate?',
        a: 'Yes — estimate_id is nullable. The deposit records against the lead, but you\'ll need to manually apply it to the invoice later since there\'s no estimate to auto-match.',
      },
    ],
    actions: {
      open: { route: '/lead-payments', label: 'Open Lead Payments' },
    },
  },
  lastVerified: '2026-06-11',
  freshUntil: 90,
}
