// Knowledge Card — Utility Programs
// Every active rebate program with source-year tracking and form binding.

export default {
  id: 'utility-programs',
  title: 'Utility Programs',
  category: 'Lighting & Energy',
  icon: 'FileCheck',
  route: '/utility-programs',

  summary:
    'Every active rebate program — RMP Wattsmart, SRP Custom, APS Solutions — pre-loaded with prescriptive measure tables, source-year tracking, and PDF form binding so the audit engine always picks the right numbers.',

  replaces: ['Rifeline program lookup', 'manual rebate calculators', 'utility PDF hunts'],
  highlights: [
    'Source-year tracking',
    'PDF form auto-fill',
    'Per-program measure table',
    'Active / inactive states',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'list',     baseDur: 4500, narration: 'Every utility program you might run, in one list.' },
      { id: 'detail',   baseDur: 6500, narration: 'Open RMP Wattsmart. Source-year is 2026. The exact measure table the utility publishes is right here.' },
      { id: 'measures', baseDur: 6500, narration: 'Per-measure code, baseline wattage, proposed wattage, dollars per unit, caps. Same numbers Lenard uses for math.' },
      { id: 'form',     baseDur: 6000, narration: 'The official utility PDF form is bound to the program. Field map drives auto-fill on every audit.' },
      { id: 'lock',     baseDur: 5500, narration: 'When the utility publishes new measures, you load the new year. Old audits lock to their original source year — no number drift.' },
    ],
  },

  setup: {
    overview:
      'Utility programs ship pre-loaded for the major utilities. You only touch this if your utility is not yet in the catalog or a new program year drops.',
    introBaseDur: 1200,
    introNarration: 'Almost nothing to set up — programs ship pre-loaded.',
    steps: [
      {
        icon: 'FileCheck',
        title: 'Check your utility',
        body: 'Open Utility Programs. Confirm RMP, SRP, APS — whatever you serve — is present and Active.',
        narration: 'Open Utility Programs. Confirm your utility is present and active.',
        baseDur: 4500,
      },
      {
        icon: 'Calendar',
        title: 'Check the source year',
        body: 'Every program has a source_year. Make sure it matches the current rebate year published by the utility.',
        narration: 'Check the source year. Should match the current rebate year.',
        baseDur: 5000,
      },
      {
        icon: 'Coins',
        title: 'Skim the measures',
        body: 'Each program has a Measures tab — the actual rebate table. Spot-check a few values against the utility PDF.',
        narration: 'Skim the measures. Spot-check a few values against the utility PDF.',
        baseDur: 5000,
      },
      {
        icon: 'FileSignature',
        title: 'Bind the rebate form',
        body: 'The utility PDF is attached to the program. Field map is configured — Lenard auto-fills it after each audit.',
        narration: 'The utility PDF is bound. Lenard auto-fills it after each audit.',
        baseDur: 5500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The catalog of rebate programs offered by utilities Job Scout supports. Each program record carries a source_year, an active flag, a measure table (rebate_measures), a custom-calc kWh rate, and the official utility PDF binding for auto-filled forms.",

    howItWorks:
      "Backed by utility_programs table (multi-tenant via company_id, but core program records are global). source_year locks rebate values to the year the audit was performed (no drift). rebate_measures one-to-many. utility_form_bindings + utility_form_field_maps drive PDF auto-fill at proposal generation.",

    examples: [
      'RMP Wattsmart 2026 → 80 prescriptive measures + custom-calc fallback',
      'SRP Custom 2026 → kWh-saved × $0.07 + $200 cap per fixture',
      'Audit completed Q1 2026 locks to source_year=2026 even when 2027 measures publish',
    ],

    gotchas: [
      'Old audits stay locked to their original source_year. Re-running rebate math without updating source_year keeps the old numbers.',
      'Custom-calc programs need utility_program.kwh_rate set. Forget that and the math returns zero.',
    ],

    faqs: [
      {
        q: 'My utility is not listed. What do I do?',
        a: 'Email support — we add programs centrally. You can also enter a custom program with kWh rate and a flat measure if you need to ship right now.',
      },
      {
        q: 'What about the rebate form PDF?',
        a: 'Bound to the program. Lenard auto-fills it after each audit and attaches it to the proposal.',
      },
    ],

    actions: {
      open: { route: '/utility-programs', label: 'Open Utility Programs' },
      measures: { route: '/rebate-measures', label: 'Rebate Measures' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
