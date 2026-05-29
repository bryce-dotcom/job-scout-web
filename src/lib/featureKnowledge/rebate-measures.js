// Knowledge Card — Rebate / Incentive Measures
// The line-item rebate table that drives Lenard's math.

export default {
  id: 'rebate-measures',
  title: 'Rebate Measures',
  category: 'Lighting & Energy',
  icon: 'Coins',
  route: '/rebate-measures',

  summary:
    "The rebate engine's source of truth — per measure code, baseline wattage, proposed wattage, dollars per unit, caps. Tweak a row, every audit's math updates.",

  replaces: ['Snugg Pro measure libraries', 'Rifeline rate tables', 'utility Excel sheets'],
  highlights: [
    'Prescriptive + custom measures',
    'Per-utility rate tables',
    'Cap math built in',
    'Source-year locked',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'table',    baseDur: 4500, narration: 'Eighty measure codes for RMP Wattsmart alone. Every prescriptive fixture the utility pays on.' },
      { id: 'row',      baseDur: 6500, narration: 'Each row: baseline wattage, proposed wattage, dollars per unit, cap. Same numbers the utility publishes.' },
      { id: 'audit',    baseDur: 6500, narration: 'Lenard finishes an audit, runs through the measure table, picks the right code per fixture. Math is automatic.' },
      { id: 'cap',      baseDur: 6000, narration: 'Some measures cap per fixture or per project. The engine applies the cap so you never over-quote the rebate.' },
      { id: 'update',   baseDur: 5500, narration: 'Utility republishes for the next year? You load the new measures, old audits stay locked to their year.' },
    ],
  },

  setup: {
    overview:
      'Rebate measures ship pre-loaded for supported utilities. You only touch this when adding a new utility, loading a new year, or editing a custom measure.',
    introBaseDur: 1200,
    introNarration: 'Pre-loaded — touch only when adding or updating.',
    steps: [
      {
        icon: 'Coins',
        title: 'Open Rebate Measures',
        body: 'Filter by utility program. Confirm the count matches what the utility publishes (RMP Wattsmart ~80 measures, SRP Custom ~40).',
        narration: 'Open Rebate Measures. Filter by utility program.',
        baseDur: 4500,
      },
      {
        icon: 'Search',
        title: 'Spot-check a few rows',
        body: 'Pick a common fixture (2x4 LED panel). Confirm baseline + proposed wattage + dollars per unit against the utility PDF.',
        narration: 'Spot-check a few rows against the utility PDF.',
        baseDur: 5000,
      },
      {
        icon: 'Plus',
        title: 'Add a custom measure',
        body: 'If you need a measure the utility does not publish (your distributor SKU), click + Add Measure. Set baseline / proposed / $ / cap.',
        narration: 'Add a custom measure if you need one your utility does not list.',
        baseDur: 5000,
      },
      {
        icon: 'Calendar',
        title: 'New year, new measures',
        body: 'When the utility publishes a new year, load the new measures. Old audits stay locked to their source_year — no number drift.',
        narration: 'Load a new year when the utility publishes. Old audits stay locked.',
        baseDur: 5000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The line-item rebate table — one row per measure code per utility program per source year. Drives every rebate calculation Lenard performs.",

    howItWorks:
      "rebate_measures table (utility_program_id, source_year, measure_code, baseline_w, proposed_w, dollars_per_unit, cap_per_unit, cap_per_project). Lookup at audit time: match fixture type → measure_code → apply cap math. Custom-calc fallback uses utility_programs.kwh_rate when no measure matches.",

    examples: [
      'Audit has 240 fixtures of type 2x4 LED → matches RMP measure code LF-LED-2X4-PROP',
      'Per-unit $80, cap-per-unit $80 → $80 × 240 = $19,200, no cap applied',
      'Project cap $25k → applied if total exceeds',
    ],

    gotchas: [
      'Caps apply per-unit AND per-project. The engine evaluates both and uses the lower.',
      'measure_code must match the utility\'s exact spelling for the PDF auto-fill to work.',
    ],

    faqs: [
      {
        q: 'Can I run the math without a measure code match?',
        a: 'Yes — custom-calc mode kicks in when no measure matches. Uses kWh-saved × utility rate × cap.',
      },
      {
        q: 'How do I know the measures are up to date?',
        a: 'Each program has a source_year. The page badges old years as stale. You can pull the latest from the utility PDF anytime.',
      },
    ],

    actions: {
      open: { route: '/rebate-measures', label: 'Open Rebate Measures' },
      programs: { route: '/utility-programs', label: 'Utility Programs' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
