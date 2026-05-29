// Knowledge Card — Zach Visits
// Every mow, edge, and cleanup visit logged against the property.

export default {
  id: 'zach-visits',
  title: 'Visits Log',
  category: 'Lawn Care',
  icon: 'ClipboardCheck',
  route: '/agents/zach/visits',

  summary:
    'Every mow, edge, and cleanup visit logged with crew, duration, weather, and notes. The audit trail your customers can see and the data Zach uses to tune time estimates.',

  replaces: ['Service Autopilot visit log', 'LawnPro work orders', 'Manual paper sheets'],
  highlights: [
    'Crew + duration + weather captured per visit',
    'Zach predicts minutes per mow from past visits',
    'Billed / unbilled tracking',
    'Customers see history in their portal',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'empty',  baseDur: 4500, narration: 'Empty visit log. Time to clock in your first mow.' },
      { id: 'form',   baseDur: 7000, narration: 'Pick the property, the date, the service type, the crew, the duration.' },
      { id: 'predict',baseDur: 6500, narration: 'Zach predicts how long the mow should take based on past visits. Beat the prediction, you know the crew is rolling.' },
      { id: 'logged', baseDur: 5500, narration: 'Save and the visit lands in the timeline with crew, duration, and weather logged.' },
      { id: 'history',baseDur: 6000, narration: 'Every visit on every property in one searchable feed. Customers see their history too.' },
    ],
  },

  setup: {
    overview:
      "Visits is Zach's daily journal. Log one entry every time a crew rolls off a property. After three or more logged visits, Zach starts predicting how long future mows will take.",
    introBaseDur: 1200,
    introNarration: "Here's how the crew logs a visit.",
    steps: [
      {
        icon: 'Plus',
        title: 'Click Log Visit',
        body: 'Top-right of the Visits page. Or the crew taps the property card from Field Scout.',
        narration: 'Click Log Visit at the top, or tap the property card from Field Scout.',
        baseDur: 5000,
      },
      {
        icon: 'Home',
        title: 'Pick the property',
        body: 'Dropdown lists every active property. Filter to one rep\'s route to narrow it down.',
        narration: 'Pick the property from the dropdown.',
        baseDur: 4000,
      },
      {
        icon: 'Clock',
        title: 'Crew + duration',
        body: 'Crew name, minutes elapsed. Zach uses this to tune future predictions.',
        narration: 'Log the crew and the actual minutes. Zach learns from these numbers.',
        baseDur: 5000,
      },
      {
        icon: 'Cloud',
        title: 'Weather + notes',
        body: "Optional but useful. Wet grass takes longer; tell Zach so he doesn't ding the crew on time.",
        narration: "Drop in the weather and any notes. Wet grass takes longer — Zach factors it in.",
        baseDur: 6000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Daily log of every lawn-care visit. Each visit attaches to a property, captures crew + duration + weather + notes + photos, and feeds Zach's effort-factor learning loop that tunes time estimates property-by-property.",

    howItWorks:
      "Backed by lawn_visits table. After save, ZachVisits.jsx computes effort_factor = actual_minutes / predicted_minutes across the property's most recent visits. Once sample_n hits 3, the factor writes back to lawn_properties so future quotes / predictions use the calibrated number. computeEffortFactor and estimateMow live in src/lib/lawnEstimator.js.",

    examples: [
      'Crew B finishes a mow → log 32 min, sunny → property file updated',
      'Cold spring cleanup → log service_type=cleanup, weather=rain',
      'Customer disputes a charge → pull visit history from the customer portal',
    ],

    gotchas: [
      'effort_factor requires 3+ visits to take effect.',
      'Deleting a visit recomputes the factor on the next save.',
      'Billed vs unbilled is a manual flag — Zach does not auto-bill.',
    ],

    faqs: [
      {
        q: "What's service_type for?",
        a: "It categorizes the visit: mow, edge, cleanup, fert (treatment), aeration, or other. Filters and reports group by this field.",
      },
      {
        q: 'How long until Zach gets accurate at predicting?',
        a: 'Three logged visits per property. After that, the learning loop kicks in and quotes get more accurate over time.',
      },
    ],

    actions: {
      open: { route: '/agents/zach/visits', label: 'Open Visits Log' },
    },
  },

  lastVerified: '2026-05-28',
  freshUntil: 90,
}
