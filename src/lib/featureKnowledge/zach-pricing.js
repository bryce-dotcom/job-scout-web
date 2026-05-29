// Knowledge Card — Zach Pricing
// Your rate card. The numbers behind every Zach quote.

export default {
  id: 'zach-pricing',
  title: 'Lawn Pricing',
  category: 'Lawn Care',
  icon: 'DollarSign',
  route: '/agents/zach/pricing',

  summary:
    'Your rate card — per-sqft mowing, per-1,000-sqft treatments, aeration, overseed, cleanup. The numbers Zach uses to price every property and run AI Yard Measure quotes.',

  replaces: ['Service Autopilot price book', 'manual sqft pricing spreadsheets', 'guess-and-check quoting'],
  highlights: [
    'One screen for every rate Zach uses',
    'Live preview against a 6,000 sqft sample lawn',
    'Margin multiplier — bump everything 10% in one click',
    'Tax rate baked in',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'sections', baseDur: 5500, narration: 'Four sections — mowing, treatments, aeration & cleanup, tax & margin. One screen, every rate you charge.' },
      { id: 'mow',      baseDur: 6500, narration: 'Set your dollar-per-sqft mow rate, your minimum charge, and your minutes-per-thousand-sqft. Zach learns the rest.' },
      { id: 'treat',    baseDur: 6500, narration: 'Plug in your treatment rates per thousand square feet — pre-emergent, fert, weed, grub, iron, lime.' },
      { id: 'preview',  baseDur: 7500, narration: 'A live preview against a sample six-thousand-square-foot lawn shows per-visit, per-season, and annual program totals as you type.' },
      { id: 'save',     baseDur: 5000, narration: 'Hit save. Every Zach quote and every AI Yard Measure result uses the new numbers immediately.' },
    ],
  },

  setup: {
    overview:
      "Pricing is Zach's rate card. Fill it in once at the start of the season. Every quote, every visit, every AI Yard Measure result uses these numbers.",
    introBaseDur: 1200,
    introNarration: "Here's how to dial in the numbers.",
    steps: [
      {
        icon: 'Scissors',
        title: 'Set your mow rates',
        body: '$/sqft + minimum charge + minutes per 1,000 sqft. Edging and travel charges too.',
        narration: 'Set your mow rates first — per-sqft, minimum charge, and minutes per thousand square feet.',
        baseDur: 6000,
      },
      {
        icon: 'Sprout',
        title: 'Treatment rates per 1,000 sqft',
        body: 'Six treatment types — pre-emergent, fert, weed, grub, iron, lime. Per 1,000 sqft pricing standardizes across lot sizes.',
        narration: 'Add your six treatment rates per thousand square feet.',
        baseDur: 5000,
      },
      {
        icon: 'Wrench',
        title: 'Aeration, overseed, cleanup',
        body: 'Per 1k sqft for aeration + overseed, hourly for cleanup. Set a minimum so micro-lots are still profitable.',
        narration: 'Aeration and overseed by the thousand square feet, cleanup by the hour.',
        baseDur: 6000,
      },
      {
        icon: 'DollarSign',
        title: 'Tax + margin multiplier',
        body: 'Tax rate (e.g. 0.0825 = 8.25%) and a margin multiplier that bumps everything in one knob. Hit Save.',
        narration: 'Set the tax rate and a margin multiplier. Hit save. Every quote uses the new numbers immediately.',
        baseDur: 6500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Per-company lawn-care rate card. Drives the lawnEstimator engine (estimateMow, estimateProgram) which prices every Zach quote, AI Yard Measure result, and per-property cost estimate.",

    howItWorks:
      "Single row per company in lawn_pricing table. ZachPricing.jsx is a full form over the row's columns: mow_per_sqft, mow_minimum, mow_minutes_per_1000sqft, edging_per_lin_ft, edging_default_lin_ft, travel_per_visit, pre_emergent / fert / weed / grub / iron / lime_per_1000sqft, aeration_per_1000sqft, aeration_minimum, overseed_per_1000sqft, cleanup_per_hour, tax_rate, margin_multiplier. The estimator functions in src/lib/lawnEstimator.js apply them.",

    examples: [
      'Bump margin_multiplier from 1.0 to 1.08 to raise all prices 8% for the new season',
      'Lower mow_minimum if you take small lots',
      'Set tax_rate=0 in states with no sales tax on lawn care',
    ],

    gotchas: [
      'Changing pricing affects every NEW quote — not retroactively. Existing quotes keep their priced numbers.',
      'margin_multiplier is a flat multiplier on everything; if you only want to bump treatments, edit those line items.',
      "Don't forget the tax rate is a decimal (0.0825), not a percent (8.25).",
    ],

    faqs: [
      {
        q: 'Where does this pricing get used?',
        a: 'Every Zach quote (manual and AI Yard Measure), the live-preview card on the public quote page, and the per-visit cost estimate when the crew logs a mow.',
      },
      {
        q: 'Can different properties have different rates?',
        a: "Not directly — pricing is per-company. For special pricing, override the per_visit amount on the property's quote or visit record.",
      },
    ],

    actions: {
      open: { route: '/agents/zach/pricing', label: 'Open Pricing' },
    },
  },

  lastVerified: '2026-05-28',
  freshUntil: 90,
}
