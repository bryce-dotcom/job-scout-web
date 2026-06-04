// Knowledge Card — Customers
// Sourced from src/pages/Customers.jsx + src/pages/CustomerDetail.jsx.
// When those pages change, this card needs to follow.

export default {
  id: 'customers',
  title: 'Customers',
  category: 'Sales & CRM',
  icon: 'Users',
  route: '/customers',

  summary:
    "The customer master list. Grid of EntityCards with name + business + email + phone + status pill, searchable across name/business/email/phone/address/notes/tags. Click any card to drop into the Customer Detail page where jobs, estimates, invoices, payments, saved payment methods, and the magic-link portal token all live.",

  replaces: ['HousecallPro Customers', 'Jobber Clients', 'ServiceTitan Customer Hub', 'spreadsheet Rolodex'],
  highlights: [
    'Search across name/business/email/phone/address',
    'Status filter (Active / Inactive / Prospect)',
    'Saved Stripe payment methods per customer',
    'Magic-link portal token per customer',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'empty',  baseDur: 4500, narration: "Empty Customers page. Building two icon, no customers yet. Click Add Customer to start." },
      { id: 'form',   baseDur: 7000, narration: 'The Add Customer modal opens. Name, business name, email, phone, address, salesperson, status. Required field is name — the rest is optional.' },
      { id: 'card',   baseDur: 5500, narration: "The customer card lands in the grid. Accent square with the User icon, name, business name underneath, email row, phone row, status pill, salesperson on the right." },
      { id: 'detail', baseDur: 6500, narration: 'Click any card to drop into the Customer Detail page. Tabs across the top — Jobs, Estimates, Invoices, Payments, Cards, Communications. Every interaction in one timeline.' },
      { id: 'portal', baseDur: 6500, narration: "Send Portal Link writes a rotating customer_portal_token. Customer opens slash portal slash colon token, pays invoices, signs quotes, downloads statements — no password required." },
    ],
  },

  setup: {
    overview:
      'The Customers page ships ready. The only setup is whether you want to assign salesperson ownership and what status values you want. The Add Customer form takes ~20 seconds; only Name is required.',
    introBaseDur: 1200,
    introNarration: "Almost no setup. Here's how to get your book of customers in.",
    steps: [
      {
        icon: 'Plus',
        title: 'Click Add Customer',
        body: 'Top-right action in PageHeader. Opens the modal. Required: name. Optional but recommended: business_name, email, phone, address, salesperson_id, status (Active / Inactive / Prospect).',
        narration: 'Click Add Customer top right. Only Name is required — the rest fills in as you learn the customer.',
        baseDur: 5500,
      },
      {
        icon: 'Upload',
        title: 'Or bulk import',
        body: 'Import button opens the CSV importer. Maps to customersFields schema (name, business_name, email, phone, address, status, salesperson_email, notes, marketing_opt_in). Re-runnable safely.',
        narration: 'Bulk import from CSV maps onto the same fields. Re-runnable without making duplicates.',
        baseDur: 5500,
      },
      {
        icon: 'Search',
        title: 'Search is fuzzy and fast',
        body: 'Search bar searches name + business + email + phone + address + notes + secondary contact + tags. Phone matching is digit-normalized so "(801) 555-0142" matches "8015550142".',
        narration: 'Search across name, business, email, phone, address, notes, tags. Phone matching ignores formatting.',
        baseDur: 5500,
      },
      {
        icon: 'CreditCard',
        title: 'Optional — save a card on file',
        body: 'On Customer Detail → Cards tab, attach a Stripe payment method. Lets you charge it later without re-asking. Stored in customer_payment_methods, last 4 + brand only visible.',
        narration: 'Save a Stripe payment method on the customer detail. Last four visible, charge later without asking again.',
        baseDur: 6000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The customer master surface. Renders customers table rows as EntityCards in a CSS grid (auto-fill, 320px min column width on desktop, 1 column on mobile). Search + status filter on top. Per-card actions: Edit (pencil), Delete (trash). Whole card click navigates to /customers/:id (CustomerDetail).",

    howItWorks:
      "Reads from customers (RLS company_id-scoped). Search filtering happens client-side via buildBlob + matchPhoneOrTokens helpers in src/lib/searchUtils.js. Status enum: Active / Inactive / Prospect. salesperson_id FK to employees. Linked tables surfaced on CustomerDetail: customer_payment_methods (Stripe pm IDs + last4 + brand), customer_portal_tokens (rotating 90-day tokens for /portal/:token magic-link access), and the standard children — leads, estimates, jobs, invoices, payments — all joined by customer_id.",

    examples: [
      'Search "northbridge" → matches name, business_name, and email blob → 1 result · "Sarah Chen · Northbridge Industries"',
      'Status filter "Prospect" → only customers whose first job hasn\'t been won yet',
      'Click → /customers/27 → CustomerDetail with 6 tabs (Jobs, Estimates, Invoices, Payments, Cards, Communications)',
    ],

    gotchas: [
      "business_name and name are separate fields. For B2B accounts use business_name as the display label; for residential, just name.",
      "Deleting a customer cascades through children (leads, jobs, invoices) if you actually confirm. The Delete button is a soft warning — it asks before destroying.",
      "Magic-link portal tokens rotate when re-issued. Re-sending the link kills the old URL.",
      "Search excludes deleted/inactive in 'Active' filter mode by default — switch the dropdown to 'All Status' to see them.",
    ],

    faqs: [
      {
        q: 'How do I import customers from HousecallPro?',
        a: 'Import button → upload CSV exported from HCP. The CSV importer maps HCP fields to Job Scout fields with source_system="hcp_import" traceability so you can re-run safely without duplicates.',
      },
      {
        q: 'Can the customer pay without logging in?',
        a: "Yes — Customer Detail → top action → Send Portal Link generates a magic URL at /portal/<rotating_token>. They view invoices, pay them via the saved Stripe link, sign open quotes, and download statements. No password.",
      },
      {
        q: 'What\'s the difference between Inactive and Prospect status?',
        a: 'Prospect = a customer who never had a job won. Inactive = had a job at some point, gone quiet. Active is the default everywhere else.',
      },
    ],

    actions: {
      open: { route: '/customers', label: 'Open Customers' },
      add:  { route: '/customers', label: 'Add a customer', hint: 'Top-right + Add Customer' },
    },
  },

  lastVerified: '2026-06-03',
  freshUntil: 90,
}
