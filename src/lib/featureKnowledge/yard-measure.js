// Knowledge Card — AI Yard Measure (Zach The Yard Yeti)
//
// Public quote page where prospects drop their address and AI traces
// the turf area from aerial imagery to produce an instant per-mow
// quote. Owned by Zach.

export default {
  id: 'yard-measure',
  title: 'AI Yard Measure',
  category: 'Lawn Care',
  icon: 'Scan',
  route: null, // primarily a customer-facing public route

  summary:
    "Drop a pin on a property, AI traces turf area from aerial imagery, instant quote drops in the customer's email — Zach's killer feature.",

  replaces: ['GreenPal', 'Lawnstarter measure', 'Service Autopilot Measure'],
  highlights: [
    'AI turf detection from aerial imagery',
    'Per-sqft pricing tiers',
    'Auto-creates a lead in your pipeline',
    'Public no-auth quote URL',
  ],

  marketing: {
    voice: 'Bill',  // Match brand voice across all walkthroughs
    scenes: [
      {
        id: 'address',
        baseDur: 3500,
        narration: 'Your prospect drops their address into your public quote page.',
      },
      {
        id: 'zoom',
        baseDur: 3000,
        narration: 'We pull up their lot from satellite imagery.',
      },
      {
        id: 'trace',
        baseDur: 4500,
        narration:
          'Our AI traces the turf and measures it down to the square foot — no site visit.',
      },
      {
        id: 'quote',
        baseDur: 3500,
        narration: 'A per-mow quote calculates instantly with a full breakdown.',
      },
      {
        id: 'delivered',
        baseDur: 5000,
        narration:
          'The quote hits their inbox and the lead lands in your pipeline. Total time: under thirty seconds.',
      },
    ],
  },

  setup: {
    overview:
      'Yard Measure is owned by Zach. To turn it on you flip the public quote page in Settings, set your per-square-foot pricing tiers, define your service area by ZIP code, then share the public URL on your website or ads. Every quote auto-creates a lead in your pipeline.',
    introBaseDur: 1000,
    introNarration: "Here's how to turn it on.",
    steps: [
      {
        icon: 'Globe',
        title: 'Enable the public quote page',
        body:
          'Settings → Public Quote: flip on Yard Measure and pick your URL slug (job-scout.app/quote/your-slug).',
        narration: 'Enable the public quote page in Settings.',
        baseDur: 2800,
      },
      {
        icon: 'DollarSign',
        title: 'Set your pricing tiers',
        body:
          'Open Zach → Pricing. Define $/sq-ft for each tier and your seasonal window (typically April–October).',
        narration: 'Open Zach, then Pricing, and set your per-square-foot rates.',
        baseDur: 3800,
      },
      {
        icon: 'MapPin',
        title: 'Define your service area',
        body:
          'Add the ZIP codes you cover. Out-of-area leads get a polite "not yet" instead of a runaway quote.',
        narration: 'Define your service area by ZIP code.',
        baseDur: 2800,
      },
      {
        icon: 'Share2',
        title: 'Share the link anywhere',
        body:
          'Drop the URL in ads, on your website, in cold emails. Every quote drops a lead into your pipeline.',
        narration:
          'Share your public URL on your website or ads. New quotes land in your pipeline automatically.',
        baseDur: 5500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "AI-driven public quote page for lawn-care customers. Prospect enters their address, Zach pulls aerial imagery, traces the turf polygon via AI, calculates a per-mow quote based on the company's pricing tiers, and emails it back — all without a site visit. Every quote creates a lead row stamped with source_system 'yard_measure'.",

    howItWorks:
      'Public route /quote/:slug renders ZachInstantQuote.jsx (no auth required). Address is geocoded via Google Maps; aerial imagery + turf polygon trace happens server-side via supabase/functions/zach-yard-ai/index.ts (Gemini Vision for polygon detection). Per-company pricing tiers stored in lawn_pricing; per-property record stored in lawn_properties with turf_size_sqft + ai_estimated_at + ai_confidence. The lead lands with all that already filled in so the setter can act on it immediately.',

    examples: [
      'Drop /quote/your-slug in a Google Ad',
      'Embed the URL on your website',
      'Send the link in cold-call follow-up emails',
    ],

    gotchas: [
      'Out-of-area ZIP codes are rejected politely (no quote sent) so you do not chase leads you cannot serve.',
      'AI turf detection works best on residential lots with clear grass-vs-driveway contrast. Multi-tenant or commercial lots may need a manual review.',
      'Pricing tiers must be configured before the quote engine can fire — empty tiers = no quote.',
      'Seasonal window (default Apr–Oct) gates when quotes are emailed. Off-season requests get a "we will reach out in spring" autoresponder.',
    ],

    faqs: [
      {
        q: 'Does this require the customer to log in?',
        a: 'No. /quote/:slug is a public page — no auth required. The customer just types an address.',
      },
      {
        q: 'How accurate is the AI measurement?',
        a: "Each measurement carries an ai_confidence score (high / medium / low). High-confidence ones go straight to a quote. Medium/low flag for manual review before the quote sends.",
      },
      {
        q: 'What if the customer is outside my service area?',
        a: "They get a polite 'we don't yet serve your area' message. No quote sent, no lead created — you only see leads you can act on.",
      },
      {
        q: "Can I override the AI's measurement?",
        a: 'Yes. Open the lawn_properties record in Zach → Properties and edit turf_size_sqft. The next quote uses the corrected value.',
      },
    ],

    actions: {
      open:    { route: '/agents/zach', label: 'Open Zach' },
      pricing: { route: '/agents/zach/pricing', label: 'Set pricing tiers' },
      settings:{ route: '/settings', label: 'Public Quote settings' },
    },
  },

  lastVerified: '2026-05-28',
  freshUntil: 90,
}
