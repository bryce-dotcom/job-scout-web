// Knowledge Card — Customers
// The customer hub — every customer file with saved payment methods,
// portal link, and full job + invoice timeline.

export default {
  id: 'customers',
  title: 'Customers',
  category: 'Sales & CRM',
  icon: 'Users',
  route: '/customers',

  summary:
    'Every customer file in one place — contact, address, saved payment methods, magic-link portal, statements, full job and invoice timeline. The Rolodex you actually use.',

  replaces: ['HousecallPro customers', 'Jobber clients', 'ServiceTitan customer hub', 'spreadsheet Rolodex'],
  highlights: [
    'Saved payment methods on file',
    'Magic-link customer portal per customer',
    'Source-system traceability',
    'Statements + history in one tab',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'empty',    baseDur: 4500, narration: "Empty customer list. Let's add the first one." },
      { id: 'form',     baseDur: 7000, narration: 'Name, business name, phone, email, billing address. Done in twenty seconds.' },
      { id: 'card',     baseDur: 5500, narration: 'The customer card lands in the grid with their key details up front.' },
      { id: 'detail',   baseDur: 6500, narration: 'Open one and you see jobs, estimates, invoices, payments, and saved cards — every interaction in one timeline.' },
      { id: 'portal',   baseDur: 6500, narration: 'Send a magic link and they pay, sign quotes, and download statements from their own portal — no password required.' },
    ],
  },

  setup: {
    overview:
      'Customers is the heart of the CRM. Add one record per customer you serve. Every job, every invoice, every payment attaches back to a customer record.',
    introBaseDur: 1200,
    introNarration: "Here's how to get your book of customers in.",
    steps: [
      {
        icon: 'Plus',
        title: 'Click Add Customer',
        body: 'Top-right of the Customers page. Opens the customer form.',
        narration: 'Click Add Customer in the top right.',
        baseDur: 3800,
      },
      {
        icon: 'User',
        title: 'Contact and billing',
        body: 'Name, business name, phone, email, billing address. All optional — fill what you have, edit later.',
        narration: 'Fill in name, contact info, and billing address. All optional — fill what you have.',
        baseDur: 5500,
      },
      {
        icon: 'CreditCard',
        title: 'Save a card for them',
        body: 'Optional — drop in their Stripe payment method so you can charge it later without re-asking.',
        narration: 'Optional — save a payment method so you can charge them later without asking again.',
        baseDur: 6000,
      },
      {
        icon: 'Globe',
        title: 'Share the portal link',
        body: "Send the customer's magic-link URL by email or text. They open it, see their quotes and invoices, and pay — no password.",
        narration: 'Send them the portal link. They sign quotes, pay invoices, and download statements without a password.',
        baseDur: 6500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The customer master table for everything in Job Scout. Every job, every invoice, every payment, every appointment ties back to a customer record. Carries contact info, billing address, saved Stripe payment methods, source-system traceability, and a magic-link portal URL per customer.",

    howItWorks:
      "Backed by the customers table (company_id-scoped, RLS enforced). Tracks source_system for HCP/import attribution. customer_payment_methods holds saved Stripe payment methods. customer_portal_tokens stores rotating magic-link tokens (90-day expiry) for the no-login portal at /portal/:token. Statements pull from invoices + payments, rendered as PDFs via render-statement Edge Function.",

    examples: [
      'Lead converts → customer record auto-created with source_system=lead_conversion',
      'HCP migration → 500 customers imported in one click, source_system=hcp_import',
      'Owner needs to see customer\'s lifetime value → open customer detail → Payments tab',
    ],

    gotchas: [
      'business_name + name are separate fields. For B2B, use business_name as the display label.',
      'Magic-link portal tokens rotate — the OLD token stops working when you regenerate.',
      'Saved Stripe payment methods are scoped per company — you cannot reuse a card across companies.',
    ],

    faqs: [
      {
        q: 'How do I import customers from HousecallPro?',
        a: 'Use the HCP Importer in the Data Console. Customers, jobs, estimates, invoices, and payments all import with source_system traceability so you can re-run safely.',
      },
      {
        q: 'Can the customer pay without logging in?',
        a: 'Yes — the magic-link portal at /portal/:token requires no password. The link is rotating and per-customer.',
      },
    ],

    actions: {
      open: { route: '/customers', label: 'Open Customers' },
      add:  { route: '/customers', label: 'Add a customer', hint: 'Top-right + Add Customer' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
