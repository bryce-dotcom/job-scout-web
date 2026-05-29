// Knowledge Card — Customer Portal
// The public, no-login page where customers sign quotes and pay invoices.

export default {
  id: 'customer-portal',
  title: 'Customer Portal',
  category: 'Sales & CRM',
  icon: 'Globe',
  route: null, // customer-facing route /portal/:token

  summary:
    "A public, no-login URL where customers view quotes, approve with e-signature, pay invoices via Stripe link, and download statements — token-based with ESIGN-Act-grade audit logging.",

  replaces: ['DocuSign portals', 'QuickBooks customer portal', 'HousecallPro portal', "PDF + venmo workarounds"],
  highlights: [
    'No-login magic links',
    'Stripe payment buttons',
    'ESIGN audit: IP, UA, doc hash, timestamp',
    'Mobile-first responsive',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'send',      baseDur: 5500, narration: "You send a portal link by text or email. No app to install, no password to remember." },
      { id: 'open',      baseDur: 5500, narration: "Customer taps the link. Their quote opens on their phone, branded with your logo." },
      { id: 'sign',      baseDur: 6500, narration: "They scroll, review, and sign with a finger. Your audit trail captures every detail." },
      { id: 'pay',       baseDur: 6500, narration: "Invoices show a one-click Pay button — Stripe handles the card. Your money is in the bank tomorrow." },
      { id: 'statement', baseDur: 6500, narration: "And they can download a statement of every job, every invoice, every payment, anytime." },
    ],
  },

  setup: {
    overview:
      "Customer Portal is built in — no separate setup. Every customer record automatically has a magic-link URL at /portal/:token. You send the link; they open it; everything works.",
    introBaseDur: 1200,
    introNarration: "Almost no setup. Here's the flow.",
    steps: [
      {
        icon: 'Globe',
        title: 'Get the customer\'s portal link',
        body: "Open the customer record. Top-right has a Portal Link button — copy or send via SMS / email directly.",
        narration: "Open the customer record and copy the portal link from the top right.",
        baseDur: 5000,
      },
      {
        icon: 'Send',
        title: 'Send by email or text',
        body: "Paste the link into an email or text message. Job Scout's invoice and quote emails already include the link automatically.",
        narration: "Send the link. Quote and invoice emails include it automatically.",
        baseDur: 5000,
      },
      {
        icon: 'CreditCard',
        title: 'Make sure Stripe is connected',
        body: "Settings → Payments → connect your Stripe account so the Pay buttons can actually take money.",
        narration: "Connect your Stripe account in Settings so the Pay buttons can take money.",
        baseDur: 5500,
      },
      {
        icon: 'Lock',
        title: 'Tokens rotate on demand',
        body: "If a customer's link leaks, regenerate it from their record — the old token instantly stops working.",
        narration: "If a link ever leaks, regenerate the token from the customer record. Old token dies on contact.",
        baseDur: 6000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Customer-facing public portal at /portal/:token. No login required. Renders the customer's quotes, invoices, payment methods, and statements. Captures e-signatures (ESIGN-Act-grade audit: IP, user agent, doc hash, timestamp). Accepts Stripe payments inline.",

    howItWorks:
      "Token stored in customer_portal_tokens (90-day expiry, rotates on demand). Public route renders without auth via supabase anon key, but RLS scopes data to the matching customer_id only. signing-capture Edge Function writes signature_log rows. Pay buttons hit Stripe Payment Links per invoice. Statements render via render-statement Edge Function → PDF.",

    examples: [
      "Customer wants to pay a $1,200 invoice → opens portal → Pay → done",
      "Customer signs the quote you sent yesterday at 7:30am from their iPhone",
      "Customer downloads a year-end statement of every job + payment for their accountant",
    ],

    gotchas: [
      "Tokens expire after 90 days — Job Scout auto-rotates on each new invoice/quote send.",
      "Stripe must be connected at the company level for Pay buttons to work; otherwise they're hidden.",
      "Signature audit captures IP, but that IP could be a coffee shop — don't treat it as identity verification.",
    ],

    faqs: [
      {
        q: 'Is the portal secure?',
        a: 'Magic-link tokens are 32-character URL-safe random strings, scoped to one customer. RLS enforces tenant + customer isolation. Tokens rotate every 90 days or on demand.',
      },
      {
        q: 'Can the customer see other customers\' data?',
        a: 'No. RLS scopes every query to the matching customer_id from the token. Cross-customer leaks would require a Postgres-level bypass, which we test against.',
      },
    ],

    actions: {
      // No internal route — portal is customer-facing only.
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
