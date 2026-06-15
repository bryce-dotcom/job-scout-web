// Knowledge Card — Invoices
// Stripe-powered invoicing with payment links, tracking, deposits.

export default {
  id: 'invoices',
  title: 'Invoices',
  category: 'Books & Accounting',
  icon: 'Receipt',
  route: '/invoices',

  summary:
    'Send a Stripe-powered invoice with a one-click pay link, payment plan support, email open tracking, deposit/progress/final typing, and a conversation thread per invoice.',

  replaces: ['QuickBooks Invoicing', 'Stripe Invoicing', 'FreshBooks', 'manual PDF invoices'],
  highlights: [
    'Stripe payment link',
    'Payment plans',
    'Email open tracking',
    'Conversation thread per invoice',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'empty',    baseDur: 4500, narration: 'Build the invoice. Lines from the job carry over. Deposit, progress, final — pick the type.' },
      { id: 'send',     baseDur: 6500, narration: 'Hit Send. SendGrid delivers. Email pixel reports back when they open it.' },
      { id: 'overdue',  baseDur: 6500, narration: 'Customer taps the pay link. Stripe takes the card or ACH. Money lands in your account.' },
      { id: 'filter',   baseDur: 6000, narration: 'Big jobs get payment plans — deposit now, progress on install, final on completion.' },
      { id: 'grid',     baseDur: 5500, narration: 'Every email and reply lives on the invoice itself. Nothing falls through the cracks.' },
    ],
  },

  setup: {
    overview:
      'Invoices need a Stripe connection so the pay link works. Connect once, every invoice you send carries your branded pay page.',
    introBaseDur: 1200,
    introNarration: "Here's how to wire up Stripe and start invoicing.",
    steps: [
      {
        icon: 'CreditCard',
        title: 'Connect Stripe',
        body: 'Settings → Integrations → Stripe Connect. OAuth with your existing Stripe account or create one in the flow.',
        narration: 'Connect your Stripe account.',
        baseDur: 4500,
      },
      {
        icon: 'FileText',
        title: 'Create an invoice',
        body: 'From a job, click Invoice → New. Lines from the job carry over. Pick deposit, progress, or final type.',
        narration: 'From a job, create the invoice. Lines carry over.',
        baseDur: 5000,
      },
      {
        icon: 'Send',
        title: 'Send + track',
        body: 'Send button delivers via SendGrid with a tracking pixel. Customer opens it, you see the timestamp.',
        narration: 'Send the invoice. You see when they open it.',
        baseDur: 5000,
      },
      {
        icon: 'Wallet',
        title: 'Customer pays',
        body: 'Pay link goes to your branded Stripe page. Card or ACH. Once paid, invoice auto-marks Paid, job auto-closes.',
        narration: 'Customer taps the pay link. Once paid, the invoice marks itself Paid.',
        baseDur: 5500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Customer-facing invoices with one-click Stripe payment links, email tracking, payment plans (deposit + progress + final), and per-invoice conversation threads. Tied back to job, customer, and the line items that generated them.",

    howItWorks:
      "invoices + invoice_lines tables. Stripe-powered: each invoice creates a Stripe PaymentIntent + hosted invoice URL via stripe-create-invoice Edge Function. Email send via SendGrid with tracking pixel (per-message UUID). Payments land via stripe webhook → invoice.paid_total updates → trigger flips invoice.status to Paid when paid_total >= total_amount → another trigger auto-closes the parent job.",

    examples: [
      'Job complete → invoice created → emailed → opened (10:14am) → paid (1:47pm)',
      'Big install: deposit $5k (paid) + progress $5k (paid) + final $3k (pending)',
      'Customer replies "where\'s the line for the wallpacks?" → reply threads on the invoice',
    ],

    gotchas: [
      'Stripe connect must be in Live mode for production. Test mode invoices won\'t accept real cards.',
      'Payment plans split the total — sum of progress amounts must equal invoice total or the trigger won\'t auto-close.',
      'Refunds via Stripe show in payments as negative amounts. Don\'t delete the original payment row.',
    ],

    faqs: [
      {
        q: 'Can I accept ACH?',
        a: 'Yes — Stripe ACH is enabled per-customer. Card fees are higher; ACH is lower. Toggle per customer.',
      },
      {
        q: 'What about offline payments (check, cash)?',
        a: 'Mark Paid Manually on the invoice — record method (Check/Cash) and reference number. Posts to GL the same.',
      },
    ],

    actions: {
      open: { route: '/invoices', label: 'Open Invoices' },
      new:  { route: '/invoices?new=true', label: 'New Invoice' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
