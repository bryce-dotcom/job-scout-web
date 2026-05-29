// Knowledge Card — Zach Treatments
// Seasonal applications — fert, weed control, grub, aeration, overseed.

export default {
  id: 'zach-treatments',
  title: 'Treatments',
  category: 'Lawn Care',
  icon: 'Sprout',
  route: '/agents/zach/treatments',

  summary:
    'Seasonal application schedule — fert rounds, pre-emergent, grub control, aeration. Round-by-round tracking with state pesticide reporting baked in.',

  replaces: ['Service Autopilot chemical tracker', 'Real Green', 'paper application sheets'],
  highlights: [
    '6-round schedule per property',
    'Product + amount + unit logged for state reporting',
    'One-click "Mark done" from scheduled → completed',
    'Cost per round per property',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'empty',   baseDur: 4500, narration: 'Empty treatment schedule. Time to plan your season.' },
      { id: 'form',    baseDur: 7000, narration: 'Pick the property. Pick the treatment — pre-emergent, fert, weed, grub, aeration. Set the round number and the schedule date.' },
      { id: 'scheduled',baseDur: 5500, narration: 'Save and the round shows up on the calendar with a scheduled badge.' },
      { id: 'done',    baseDur: 6000, narration: "When the crew finishes the round, one tap on Mark Done flips it to completed and stamps today's date." },
      { id: 'program', baseDur: 7000, narration: 'The whole annual program lives in one feed — every round, every property, with product names and amounts for your state pesticide reports.' },
    ],
  },

  setup: {
    overview:
      "Treatments runs your seasonal application program. Schedule 4–6 rounds per property at the start of the season; Zach tracks completion and keeps the product + amount log your state pesticide regulator expects.",
    introBaseDur: 1200,
    introNarration: "Here's how to plan a season.",
    steps: [
      {
        icon: 'Plus',
        title: 'Schedule Treatment',
        body: 'Top-right of Treatments. Opens the form to schedule one round.',
        narration: 'Click Schedule Treatment at the top right.',
        baseDur: 3800,
      },
      {
        icon: 'Sprout',
        title: 'Round + product',
        body: 'Pick the treatment type (Pre-emergent, Fert, Weed, Grub, Aeration, Overseed, Lime), assign a round number 1–6, name the product.',
        narration: 'Pick the treatment type, the round number, and the product name.',
        baseDur: 5800,
      },
      {
        icon: 'Calendar',
        title: 'Schedule the date',
        body: 'Set the scheduled date. Leave completed blank until the crew finishes.',
        narration: 'Set the scheduled date and save.',
        baseDur: 4000,
      },
      {
        icon: 'CheckCircle2',
        title: 'Mark done after the visit',
        body: 'When the round is applied, tap Mark Done. Logs the completed date for your records.',
        narration: 'When the round is applied, tap Mark Done. Your state-pesticide trail writes itself.',
        baseDur: 5800,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Round-by-round seasonal application tracker. Captures treatment type, round number, product name, amount + unit, scheduled and completed dates per property — the audit trail state pesticide regulators expect.",

    howItWorks:
      "Backed by lawn_treatments table (company_id-scoped, property_id-foreign). Status flow: scheduled → completed (or skipped). The one-click Mark Done helper stamps completed_date = today and flips status. Records carry amount_used + amount_unit (lbs / gal / oz) so per-state pesticide reports can be pulled straight from the table.",

    examples: [
      'Spring kickoff: schedule Round 1 (pre-emergent) on every property in March',
      'Mid-summer: schedule Round 3 (fert) + Round 4 (weed control)',
      'Fall: aeration + overseed scheduled property-by-property',
    ],

    gotchas: [
      "Round numbers aren't enforced — you can mix 4-round and 6-round programs across customers.",
      "Skipped status is for tracking 'we tried, weather didn't cooperate' — not for cancellations.",
      'amount_used + amount_unit are optional but required for state pesticide reporting in many jurisdictions.',
    ],

    faqs: [
      {
        q: 'Does Zach auto-schedule the next round?',
        a: 'Not yet — you schedule each round manually. Auto-scheduling based on seasonal templates is on the roadmap.',
      },
      {
        q: 'Can I pull a state pesticide application report?',
        a: 'Yes — open Reports and pick the pesticide application report. Filters by date range and product.',
      },
    ],

    actions: {
      open: { route: '/agents/zach/treatments', label: 'Open Treatments' },
    },
  },

  lastVerified: '2026-05-28',
  freshUntil: 90,
}
