// Knowledge Card — Fixture Types
// Lenard's LED catalog with DLC docs + utility-program eligibility.

export default {
  id: 'fixture-types',
  title: 'Fixture Types',
  category: 'Lighting & Energy',
  icon: 'Lamp',
  route: '/fixture-types',

  summary:
    "Lenard's LED catalog — every fixture you might install or replace. DLC listing, wattage, lumens, distributor cost, suggested retail. Audits pull from here; rebate math pulls from here. The fixture spine.",

  replaces: ['Snugg Pro fixture libraries', 'distributor PDF books', 'manual cost lookups'],
  highlights: [
    'DLC listing tied to docs',
    'Per-utility eligibility',
    'Cost + suggested retail',
    'Replaces-mapping for audits',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'catalog', baseDur: 4500, narration: 'Fixture catalog. Three hundred LED replacements ready for an audit.' },
      { id: 'detail',  baseDur: 6500, narration: 'Open one. Forty-watt LED panel. DLC-listed. Replaces 64-watt fluorescent. Cost five bucks, retail fifteen.' },
      { id: 'replace', baseDur: 6500, narration: 'Replaces mapping. When Lenard sees a fluorescent, he proposes this LED. Automatic.' },
      { id: 'utility', baseDur: 6500, narration: 'Per-utility eligibility. RMP pays on this fixture. SRP does not. The rebate math knows.' },
      { id: 'docs',    baseDur: 5500, narration: 'DLC sheet, install instructions, warranty — attached to the fixture. Flow into proposals automatically.' },
    ],
  },

  setup: {
    overview:
      "Fixture types come pre-loaded with DLC-listed LEDs for the major manufacturers. You add your distributor's favorites and bind your cost.",
    introBaseDur: 1200,
    introNarration: 'Pre-loaded with DLC LEDs. You bind your costs.',
    steps: [
      {
        icon: 'Lamp',
        title: 'Confirm the catalog',
        body: 'Fixture Types → review the pre-loaded set. Add your distributor SKUs if missing.',
        narration: 'Confirm the catalog. Add your distributor SKUs.',
        baseDur: 4500,
      },
      {
        icon: 'DollarSign',
        title: 'Bind your cost',
        body: 'Per fixture, set your distributor cost + suggested retail. Drives quote pricing and margin math.',
        narration: 'Bind your distributor cost. Drives quote pricing.',
        baseDur: 5000,
      },
      {
        icon: 'FileBadge',
        title: 'Attach DLC + warranty docs',
        body: "Upload the DLC qualification sheet and warranty for each fixture. They auto-flow into proposals and customer's portal.",
        narration: 'Attach DLC and warranty docs.',
        baseDur: 5000,
      },
      {
        icon: 'GitCompareArrows',
        title: 'Set the replaces mapping',
        body: "Per LED, what existing fixture it replaces. Lenard uses this during audits — sees the old fixture, proposes this LED.",
        narration: 'Set the replaces mapping. Lenard proposes automatically.',
        baseDur: 5500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The fixture-type catalog Lenard uses for audits. Each fixture record carries DLC status, wattage, lumens, color temp, distributor SKU + cost, suggested retail, replaces-fixture mapping, per-utility-program eligibility, and attached docs (DLC sheet, warranty, install instructions).",

    howItWorks:
      "fixture_types table (global catalog + per-company override layer). DLC listing stored as boolean + dlc_listing_id. fixture_type_replaces table for the mapping (when LED X replaces incumbent Y). fixture_type_utility_eligibility table for per-program eligibility (which programs pay rebates on this fixture). Documents joined via fixture_type_documents.",

    examples: [
      'Catalog → 314 LEDs → filter by DLC=yes → 286',
      '4-ft LED tube → replaces 4-ft T8 fluorescent → DLC listed → RMP + SRP + APS eligible',
      'Audit sees T8 → proposes this LED tube → rebate math pulls program $/unit',
    ],

    gotchas: [
      'Global catalog updates land for everyone. Your per-company overrides preserve your cost + custom replaces mappings.',
      'A fixture not in fixture_type_utility_eligibility doesn\'t get a rebate. Add missing pairs manually.',
      'DLC status can lapse. Periodically re-verify against the DLC website. Lenard\'s rebate engine treats lapsed DLC as non-eligible.',
    ],

    faqs: [
      {
        q: 'Can I have a non-DLC fixture in the catalog?',
        a: 'Yes — useful for jobs without a rebate (residential retrofits). DLC=false; no auto-rebate calculation.',
      },
      {
        q: 'How is this different from Products & Services?',
        a: 'Products & Services is the GENERIC catalog (anything you sell). Fixture Types is the LIGHTING-specific subset with DLC + rebate metadata. Lenard reads fixture_types; quote builder reads products.',
      },
    ],

    actions: {
      open: { route: '/fixture-types', label: 'Open Fixture Types' },
      lenard: { route: '/agents/lenard', label: 'Open Lenard' },
    },
  },

  lastVerified: '2026-06-03',
  freshUntil: 90,
}
