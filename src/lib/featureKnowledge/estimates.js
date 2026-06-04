// Knowledge Card — Estimates & Quotes
// Sourced from src/pages/Estimates.jsx + src/lib/statusColors.js.
// When those pages change, this card needs to follow.

export default {
  id: 'estimates',
  title: 'Estimates & Quotes',
  category: 'Sales & CRM',
  icon: 'FileText',
  route: '/estimates',

  summary:
    "The estimate list. Grid of cards showing quote ID, name, salesperson, date, amount, and status pill. Stats strip: Draft / Sent / Approved counts + Total Approved Value. Create an estimate linked to a lead, an existing customer, or a brand-new lead. Status flow: Draft → Sent → Approved (or Rejected / Expired). Approved = customer signed via portal; a Job auto-creates.",

  replaces: ['DocuSign', 'PandaDoc', 'Jobber quotes', 'HousecallPro estimates', 'PDF emails'],
  highlights: [
    'Stats strip: Draft · Sent · Approved · Total Value',
    'Associate with lead, customer, or create a new lead inline',
    'Lead picker surfaces Appointment Set leads first (setter commission guard)',
    '"Hide $0 drafts" filter on by default',
    'Status: Draft → Sent → Approved → Job auto-created',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'empty',    baseDur: 4500, narration: "The Estimates page. Stats across the top — Draft, Sent, Approved, Total Value. No estimates yet. Click New Estimate to build the first one." },
      { id: 'modal',    baseDur: 7000, narration: 'New Estimate modal. Name it — LED Retrofit, Fleet Wrap, whatever the job is. Then pick Associate With: an existing lead, a saved customer, or create a new lead inline. Salesperson and service type fill in automatically.' },
      { id: 'grid',     baseDur: 6000, narration: 'Estimates land in a card grid. Each card shows the FileText icon, estimate name, quote ID in accent, salesperson, date, dollar amount, and a status pill.' },
      { id: 'filter',   baseDur: 5500, narration: 'Filter by status — All Status, Draft, Sent, Approved, Rejected, Expired. Hide $0 drafts is on by default to keep the list clean.' },
      { id: 'approved', baseDur: 6000, narration: 'Approved means the customer signed via the portal link. A Job row is auto-created with every line item copied, the lead flips to Won, and the setter\'s commission fires.' },
    ],
  },

  setup: {
    overview:
      "Estimates ships ready — no configuration required. Build one, link it to a lead, add line items on the detail page, and send the portal link. The customer signs from their phone.",
    introBaseDur: 1200,
    introNarration: "Here's how to send your first estimate.",
    steps: [
      {
        icon: 'Plus',
        title: 'Click New Estimate',
        body: 'Top-right of the Estimates page, or from a lead detail or customer detail. Name it, link it to a lead (existing or new), pick the salesperson.',
        narration: 'Click New Estimate. Name it and link it to a lead — existing, new, or from a customer record.',
        baseDur: 5000,
      },
      {
        icon: 'Package',
        title: 'Add line items on the detail page',
        body: 'After creating, you land on the estimate detail. Add lines from your products catalog or type custom ones. Set quantity, unit price, taxable flag, notes, and optional photo per line.',
        narration: "Add line items from your catalog or type custom ones. Photo any line you want to show off.",
        baseDur: 6500,
      },
      {
        icon: 'Send',
        title: 'Send the portal link',
        body: 'Click Send Estimate. The customer gets a link they open on their phone — no login. They scroll, review, and sign with a finger. Status changes to Sent, then Approved on signature.',
        narration: 'Send the portal link by email or text. They open it on their phone and sign. No app, no login.',
        baseDur: 6500,
      },
      {
        icon: 'Briefcase',
        title: 'Signature auto-creates a Job',
        body: 'On signature: quote freezes (ESIGN audit trail) → Job row created with all line items copied → lead status flips to Won → setter bonus fires. One signature does all four.',
        narration: 'When they sign, a Job is created automatically with every line copied. Pipeline flips to Won.',
        baseDur: 6500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The estimate list page. Stats row: Draft count, Sent count, Approved count (#4a7c59), Total Value (approved sum, accent). Search blob: customer name, business, email, phone, quote_id, estimate_name, sent_to_email, notes, business_unit, service_type. Status filter select. 'Hide $0 drafts' checkbox (default checked — hides drafts with quote_amount=0 unless a search is active). Card grid (auto-fill 320px): FileText icon + estimate_name or customer name + quote_id (accent) + salesperson (User icon) + date + amount (18px bold) + status pill (quoteStatusColors).",

    howItWorks:
      "Backed by quotes table (company_id-scoped), joined to leads and customers. Creating an estimate: associationType toggles between 'lead' (SearchableSelect, Appointment Set sorted first), 'customer' (select), 'newLead' (inline name/email/phone/address fields + dupe-guard warning). New estimate inserts quotes row with status='Draft', quote_amount=0, then navigates to /estimates/:id. Status flow: Draft → Sent (on Send action) → Approved (on portal signature) → Job auto-created. quoteStatusColors from statusColors.js.",

    examples: [
      "Rep returns from a sales visit → New Estimate → links to Marcus Okafor's lead → adds 3 LED fixture lines → sends portal link",
      "Search 'northbridge' → finds EST-041 LED Retrofit — Northbridge (customer name blob match)",
      "Filter to Approved → see all won estimates with amounts; total value shows approved sum only",
    ],

    gotchas: [
      "'Hide $0 drafts' is ON by default. Searching clears it automatically so drafts can still be found.",
      "Lead picker sorts Appointment Set leads first to prevent setter-commission orphaning when a rep creates a new lead instead of linking to the existing one.",
      "quote_amount on the list page is the estimate total, NOT the approved job value — job_total may differ if scope changed after signing.",
      "Quotes freeze on signature — you cannot edit after Approved. Clone and resend if changes are needed.",
    ],

    faqs: [
      {
        q: "Can I send the estimate as a PDF instead of a portal link?",
        a: "Yes — the estimate detail page has a Download PDF button. But the portal link is recommended because it captures the e-signature audit trail (IP, user agent, document hash).",
      },
      {
        q: "What happens when a customer signs?",
        a: "Quote status → Approved, a Job row is created with all line items copied, the linked lead flips to Won, and the setter commission fires. All four happen in one write.",
      },
      {
        q: "How do I see which estimates are waiting for a signature?",
        a: "Filter to 'Sent' status — those are estimates that were sent but not yet signed. The date column shows when they were sent.",
      },
    ],

    actions: {
      open:   { route: '/estimates', label: 'Open Estimates' },
      create: { route: '/estimates', label: 'New Estimate', hint: 'Top-right + New Estimate' },
    },
  },

  lastVerified: '2026-06-04',
  freshUntil: 90,
}
