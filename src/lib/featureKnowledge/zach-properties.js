// Knowledge Card — Zach Properties
// One file per lawn — turf sqft, mow cadence, gate code, dog, sprinkler
// quirks, hazards. The foundation Zach builds visits and treatments on.

export default {
  id: 'zach-properties',
  title: 'Properties',
  category: 'Lawn Care',
  icon: 'Home',
  route: '/agents/zach',

  summary:
    'One file per lawn — turf sqft, mow cadence, gate code, dog notes, sprinkler quirks, hazards. Every crew shows up ready, no questions asked.',

  replaces: ['Service Autopilot properties', 'LawnPro properties', 'Jobber property records'],
  highlights: [
    'Gate codes + dog notes on every record',
    'Per-property obstacles + hazards',
    'Customer / lead link with one click',
    'AI yard-measure tied to each property',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'empty',  baseDur: 4500, narration: "Empty board. Time to fire up Zach with your first property." },
      { id: 'form',   baseDur: 7500, narration: 'Drop in the address, turf size, mow day, gate code, even the dog\'s name. All in one form.' },
      { id: 'saved',  baseDur: 5000, narration: 'Save it and the property card lands in the grid with the key details on the front.' },
      { id: 'detail', baseDur: 6000, narration: 'Every chip on that card is a field your crew needs — mow frequency, turf size, dog warnings, gate codes.' },
      { id: 'grid',   baseDur: 6500, narration: 'Filter by mow day, search by name, and your whole book of business is one page.' },
    ],
  },

  setup: {
    overview:
      'Properties is the foundation of Zach. Add one record per lawn you maintain. Every visit, treatment, and quote attaches back to a property record.',
    introBaseDur: 1200,
    introNarration: "Here's how to get your book of business in.",
    steps: [
      {
        icon: 'Plus',
        title: 'Click Add Property',
        body: 'Top-right of the Properties page. Opens the property form.',
        narration: 'Click Add Property in the top right.',
        baseDur: 3500,
      },
      {
        icon: 'MapPin',
        title: 'Address + Contact',
        body: 'Type the address (Google autocompletes), then link to an existing customer, an existing lead, or create a new lead in one tap.',
        narration: 'Type the address. Link it to a customer, a lead, or create a brand new lead on the spot.',
        baseDur: 6500,
      },
      {
        icon: 'Ruler',
        title: 'Lot details',
        body: 'Turf sqft, mow day, frequency, mow height. If you skipped the measure step, you can hand-enter sqft here.',
        narration: 'Add the lot details — turf size, mow day, frequency. The crew uses these to plan the route.',
        baseDur: 5500,
      },
      {
        icon: 'KeyRound',
        title: 'Gate, dog, sprinkler quirks',
        body: "Gate code, dog name, obstacles, irrigation notes. The stuff that's not on the address.",
        narration: "Add the gate code, the dog notes, the sprinkler quirks. The stuff that's not on the address.",
        baseDur: 5500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Zach's master record for every lawn the company maintains. Stores everything a crew needs to show up and do the job — turf size, mow cadence, gate codes, dog notes, sprinkler quirks, hazards, customer/lead link, AI yard-measure polygon.",

    howItWorks:
      "Backed by the lawn_properties table (company_id-scoped, RLS enforced). Properties join to customers via customer_id, leads via lead_id (mutually exclusive). turf_polygon is GeoJSON saved by the yard-measure flow. effort_factor + effort_sample_n drive a learning loop that tunes time estimates as crews log actual minutes per visit.",

    examples: [
      'A new customer signs up → create a property + link to the customer',
      'A prospect requests a public quote → yard-measure creates the property + a lead',
      'Bulk import from a spreadsheet via the Data Console',
    ],

    gotchas: [
      'Delete cascades — removing a property also removes its visits and treatments.',
      'effort_factor only kicks in after 3+ logged visits.',
      'turf_polygon is optional but powers per-square-foot pricing accuracy.',
    ],

    faqs: [
      {
        q: 'Can one property have multiple contacts?',
        a: 'No — each property links to exactly one customer OR one lead (never both). Convert the lead to a customer and the link transfers automatically.',
      },
      {
        q: 'How do I import my existing properties?',
        a: 'Two paths: (1) Bulk Ops in the Data Console for CSV/spreadsheet imports, or (2) HCP Importer if you\'re coming from HousecallPro.',
      },
    ],

    actions: {
      open: { route: '/agents/zach', label: 'Open Properties' },
      add:  { route: '/agents/zach', label: 'Add a property', hint: 'Top-right + Add Property' },
    },
  },

  lastVerified: '2026-05-28',
  freshUntil: 90,
}
