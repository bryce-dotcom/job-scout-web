// Knowledge Card — Lighting Audits
// Lenard's killer feature: walk a building, photograph each area,
// AI identifies fixtures, calculate rebate, produce LED proposal.

export default {
  id: 'lighting-audits',
  title: 'Lighting Audits',
  category: 'Lighting & Energy',
  icon: 'Lightbulb',
  route: '/lighting-audits',

  summary:
    'Walk a building, photograph each area, let AI identify fixtures and count bulbs, and produce a turnkey LED retrofit proposal with rebate math baked in — in an afternoon, not a week.',

  replaces: ['Snugg Pro', 'Rifeline', 'manual Excel audits', 'energy-modeling consultants'],
  highlights: [
    'AI fixture identification',
    'Per-area photos',
    'Customer signature on completion',
    'Rebate math baked in',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'walk',     baseDur: 4500, narration: 'Walk into a 60,000 square foot warehouse. Old metal-halide highbays everywhere.' },
      { id: 'snap',     baseDur: 6500, narration: 'Snap a photo of each area. Lenard reads the fixtures — make, wattage, lamp count — automatically.' },
      { id: 'measure',  baseDur: 6500, narration: 'AI counts the bulbs and tags every fixture type. Two hundred forty fixtures cataloged in an afternoon.' },
      { id: 'rebate',   baseDur: 6500, narration: 'Lenard pulls the right utility program, calculates the prescriptive rebate per fixture. Customer is owed eighteen thousand back.' },
      { id: 'proposal', baseDur: 6000, narration: 'One tap generates the proposal — payback period, rebate math, signed by the customer right there.' },
    ],
  },

  setup: {
    overview:
      'Lighting Audits ships with Lenard. Make sure your utility programs and fixture types are populated so the rebate math has data to pull from.',
    introBaseDur: 1200,
    introNarration: "Here's how to get Lenard ready to audit.",
    steps: [
      {
        icon: 'Zap',
        title: 'Pick your utility',
        body: 'In Settings, set the utility for each service area you cover (SRP, RMP, APS, PG&E). Drives which rebate program applies.',
        narration: 'Pick the utility for each service area. Drives which rebate program applies.',
        baseDur: 5000,
      },
      {
        icon: 'Lamp',
        title: 'Stock your fixture types',
        body: 'Settings → Fixture Types. Pre-loaded with common DLC-listed LEDs; add your suppliers favorites. Each fixture has cost, wattage, lamp count.',
        narration: 'Stock your fixture types. Each one has cost, wattage, lamp count.',
        baseDur: 5500,
      },
      {
        icon: 'Plus',
        title: 'Start an audit',
        body: 'On the Lighting Audits page, New Audit. Add the customer, the building, the square footage. Walk it with your phone.',
        narration: 'Start a new audit. Add the customer, the building. Walk it with your phone.',
        baseDur: 5500,
      },
      {
        icon: 'Camera',
        title: 'Photo each area',
        body: 'Tap Add Area, snap a wide shot. Lenard reads fixtures and counts bulbs. Override anything that looks off — Dougie learns the correction for next time.',
        narration: 'Photo each area. Lenard reads fixtures, counts bulbs. Dougie learns your corrections.',
        baseDur: 6000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "An AI-driven energy audit for lighting retrofits. Walk a building, snap photos per area, get an itemized inventory of existing fixtures with proposed LED replacements + rebate math, then produce a customer-signed proposal — all in one session.",

    howItWorks:
      "Backed by lighting_audits, audit_areas, audit_area_fixtures tables. Photos uploaded to audit-photos bucket. Gemini Vision identifies fixture make/model + counts. Existing fixture types matched against fixture_types catalog. Proposed LED matched via fixture_types.replaces_fixture_type_id. Rebate math: rebate_measures table per utility_program, joined with quantity. Dougie OCR Corrections table feeds few-shot examples back into the prompt for per-company learning.",

    examples: [
      'New audit at 60k sqft warehouse → walk 6 areas → 240 fixtures identified',
      'Each fixture proposed LED + rebate $/unit → total project rebate $18k',
      'Customer signs in audit_signatures with IP + UA + timestamp',
    ],

    gotchas: [
      'Mixed-fixture areas (multiple types in one shot) need a manual split — Lenard groups by dominant type.',
      'Dimly-lit areas degrade ID accuracy — use the flash or take a closer shot.',
      'Rebate math only fires if utility_program is set for the audit. Forget that and you get fixtures with no rebate.',
    ],

    faqs: [
      {
        q: 'Does Lenard handle non-prescriptive (custom) measures?',
        a: 'Yes — custom calc mode uses kWh saved × $/kWh from utility_program. For RMP and SRP, prescriptive is preferred.',
      },
      {
        q: 'Can the customer sign on the phone right there?',
        a: 'Yes — the final step is a signature-on-glass capture with IP, UA, timestamp logged in audit_signatures for ESIGN compliance.',
      },
    ],

    actions: {
      open: { route: '/lighting-audits', label: 'Open Audits' },
      newAudit: { route: '/lighting-audits', label: 'New Audit' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
