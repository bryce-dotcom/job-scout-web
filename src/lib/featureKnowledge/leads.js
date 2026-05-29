// Knowledge Card — Leads
// The single intake for every potential customer.

export default {
  id: 'leads',
  title: 'Leads',
  category: 'Sales & CRM',
  icon: 'UserPlus',
  route: '/leads',

  summary:
    'The single intake for every potential customer — phone, web form, walk-in, HCP import, or Prospect Scout — with owner, setter, source pay-per-lead, and conversion tracking.',

  replaces: ['HubSpot CRM', 'Pipedrive leads', 'spreadsheet lead lists', 'HousecallPro lead intake'],
  highlights: [
    'Owner + setter assigned per lead',
    'Source attribution + pay-per-lead',
    'One-click convert to customer',
    'Auto-routed to Lead Setter calendar',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'empty',    baseDur: 4500, narration: 'Empty lead list. Let me add the first one.' },
      { id: 'form',     baseDur: 7000, narration: 'Name, phone, email, the source they came from, and which rep owns it.' },
      { id: 'card',     baseDur: 5500, narration: 'The lead lands in the New column with owner and source stamped on it.' },
      { id: 'detail',   baseDur: 6500, narration: "Open it and you see contact attempts, notes, and a one-click convert button when they're ready." },
      { id: 'convert',  baseDur: 6500, narration: 'Convert to customer — every field follows them. The lead history sticks around for attribution.' },
    ],
  },

  setup: {
    overview:
      "Leads is the first stop in the sales flow. Every potential customer — no matter how they came in — starts here. Once they're qualified or quoted, they convert to a customer record while the original lead row stays for attribution.",
    introBaseDur: 1200,
    introNarration: "Here's how to capture leads.",
    steps: [
      {
        icon: 'Plus',
        title: 'Click Add Lead',
        body: 'Top-right of the Leads page. Or leads auto-create from the Prospect Scout drawer, public quote forms, and HCP imports.',
        narration: 'Click Add Lead, or let Prospect Scout and the public forms create them for you.',
        baseDur: 5000,
      },
      {
        icon: 'User',
        title: 'Contact + source',
        body: 'Name, phone, email, plus how they found you — referral, ad, walk-in, web. Source drives the pay-per-lead bonus.',
        narration: 'Add name, phone, and how they found you. Source drives the lead bonus.',
        baseDur: 5500,
      },
      {
        icon: 'UserCheck',
        title: 'Assign owner + setter',
        body: 'Pick which sales rep owns the lead, and which setter is allowed to schedule the appointment. Default to the user who added it.',
        narration: 'Assign the owner and the setter so they can act on it.',
        baseDur: 5000,
      },
      {
        icon: 'GitBranch',
        title: 'Convert when ready',
        body: "When they sign or pay a deposit, hit Convert. A customers row gets created; the lead row stays for attribution.",
        narration: 'When they sign or pay, hit Convert. The customer record gets created and the lead stays for attribution.',
        baseDur: 6500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The single intake table for every potential customer before they become an actual customer. Tracks contact info, source attribution, owner + setter assignment, contact-attempt counter, qualification status, and a one-way conversion to the customers table.",

    howItWorks:
      "Backed by the leads table (company_id-scoped). source_id traces the channel (referral / ad / web / Prospect Scout / HCP import / Yard Measure). On conversion, leads.converted_customer_id holds the new customer id; the original lead row is preserved for reporting and pay-per-lead bonus calc. The Sales Pipeline view IS the leads table with stage filters.",

    examples: [
      'Phone call comes in → setter adds a lead, assigns to Doug as owner',
      'Web form submission → lead auto-created with source=web',
      'Prospect Scout import → batch of leads with source=prospect_scout',
    ],

    gotchas: [
      'Converting a lead does NOT delete it — both rows exist after conversion for attribution.',
      'source_pay_per_lead is configured at the company level — different sources can pay different bonuses.',
      'Leads without owner default to the company\'s primary admin for visibility.',
    ],

    faqs: [
      {
        q: "What's the difference between a lead and a customer?",
        a: "Leads are potential customers; customers are confirmed (they\'ve signed a quote or paid a deposit). The conversion is one-click. The lead row stays for attribution.",
      },
      {
        q: 'Where do I see lead-to-quote-to-job stats?',
        a: 'In Reports — pipeline conversion report. Filters by source, owner, and date range.',
      },
    ],

    actions: {
      open: { route: '/leads', label: 'Open Leads' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
