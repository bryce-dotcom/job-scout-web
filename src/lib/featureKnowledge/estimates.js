// Knowledge Card — Estimates & Quotes
// The quote builder — line items, photos, e-signature, portal preview.

export default {
  id: 'estimates',
  title: 'Estimates & Quotes',
  category: 'Sales & CRM',
  icon: 'FileText',
  route: '/estimates',

  summary:
    'Build a multi-line quote (materials, labor, taxable flags, photos per line, notes, discounts) and send a portal link the customer signs with a finger from their phone. Once signed, it becomes a job with one click.',

  replaces: ['DocuSign', 'PandaDoc', 'Jobber quotes', 'HousecallPro estimates', 'PDF emails'],
  highlights: [
    'E-signature with IP + UA audit',
    'Photo per line item',
    'Email-tracking pixel',
    'Convert to job on signature',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'empty',     baseDur: 4500, narration: "Empty estimate. Let's build one for our customer." },
      { id: 'lines',     baseDur: 7500, narration: 'Add lines from your product catalog or type them in. Set quantity, unit price, and a taxable flag per line.' },
      { id: 'photos',    baseDur: 6500, narration: 'Tap to attach a photo on any line — proof of what they\'re buying, right there on the quote.' },
      { id: 'send',      baseDur: 6500, narration: "Send the portal link by email or text. They open it on their phone, scroll, and sign with their finger." },
      { id: 'won',       baseDur: 6500, narration: 'Customer signs. The quote becomes a job, the pipeline moves to Won, and the setter\'s bonus stamps.' },
    ],
  },

  setup: {
    overview:
      "Estimates is the bridge between a lead and a paid job. Build a quote, send it, customer signs from their phone, it auto-converts to a job. No PDFs, no fax machines, no email attachments lost in spam.",
    introBaseDur: 1200,
    introNarration: "Here's how to send your first quote.",
    steps: [
      {
        icon: 'Plus',
        title: 'New Estimate',
        body: "From a customer or a lead, click Create Estimate. Or start fresh from the Estimates page top-right.",
        narration: 'Click Create Estimate from the customer, the lead, or the Estimates page.',
        baseDur: 5000,
      },
      {
        icon: 'Package',
        title: 'Add line items',
        body: "Pick from your products + services catalog, or type a custom line. Quantity, unit price, taxable flag, photos, notes — all per line.",
        narration: "Add lines from your catalog or type custom ones. Photo any line you want to show off.",
        baseDur: 6500,
      },
      {
        icon: 'Send',
        title: 'Send the portal link',
        body: "Email or text. The link opens on their phone — no login required. Scroll, review, sign with a finger.",
        narration: 'Send the portal link by email or text. They open it, scroll, sign on their phone.',
        baseDur: 6500,
      },
      {
        icon: 'Briefcase',
        title: 'On signature: auto-convert to job',
        body: "Signature lands → quote freezes (audit trail) → job auto-creates with all the line items copied → pipeline flips to Won.",
        narration: 'When they sign, the quote becomes a job automatically with every line copied over.',
        baseDur: 6500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Job Scout's multi-line quote builder. Quotes carry line items (from products or freeform), per-line photos and notes, a discount, totals, tax, and a signature audit trail. Once signed via the portal, they auto-convert into a jobs row with all line items copied over.",

    howItWorks:
      "Backed by quotes + quote_lines tables (company_id-scoped). Customer signature is captured via the public /portal/:token page with IP, user agent, and a hash of the document state for ESIGN audit. signing-capture Edge Function handles the write. On signature: trigger creates a jobs row, copies quote_lines → job_lines, marks the lead Won, fires setter bonus. Email-tracking pixel = /api/email-open?quote_id=X for open-rate.",

    examples: [
      "After a sales visit, build a quote on the spot, send before leaving the driveway",
      "Customer requests a revision: clone the quote, edit, resend",
      "Audit trail proves the customer signed at 3:47pm on May 28 from a specific IP",
    ],

    gotchas: [
      "Quotes freeze on signature — you cannot edit after. Clone and resend if changes are needed.",
      "The Auto-convert-to-job step requires service_type to be set on at least one line.",
      "Email tracking pixel doesn't fire if the customer uses Gmail privacy proxy.",
    ],

    faqs: [
      {
        q: "Can I send the quote as a PDF instead?",
        a: "Yes — the portal link page has a Download PDF button. But the portal is the recommended flow because it captures the signature audit trail.",
      },
    ],

    actions: {
      open: { route: '/estimates', label: 'Open Estimates' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
