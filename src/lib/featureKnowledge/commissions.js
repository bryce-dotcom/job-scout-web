// Knowledge Card — Commissions
// Setter + sales rep commission engine with pending/earned/paid lifecycle.

export default {
  id: 'commissions',
  title: 'Commissions',
  category: 'Payroll, HR & Onboarding',
  icon: 'Trophy',
  route: '/payroll',

  summary:
    "Tracks every commission — setter per appointment, sales rep per won deal, lead-source bonus — through pending → earned → paid. Payroll picks them up automatically when the qualification rule fires.",

  replaces: ['Spreadsheet commission tracking', 'manual payroll add-ons', 'Gusto bonus entries'],
  highlights: [
    'Setter + sales + source',
    'Pending → earned → paid',
    'Qualification rule per role',
    'Payroll-integrated',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'set',     baseDur: 4500, narration: 'Setter books an appointment. Commission posts as pending — twenty-five bucks.' },
      { id: 'quote',   baseDur: 6500, narration: 'Sales rep sends a quote. Qualification rule fires — quote-created. Setter commission moves to earned.' },
      { id: 'won',     baseDur: 6500, narration: 'Customer signs. Rep gets a slice of the gross profit — three hundred twenty dollars. Lead source gets twenty-five.' },
      { id: 'rules',   baseDur: 6500, narration: 'Rules per role. Setter qualifies on quote, rep on signed deal, source on first invoice paid. You set them once.' },
      { id: 'payout',  baseDur: 5500, narration: 'Next payroll run, all earned commissions roll in. Itemized on the stub. No spreadsheet, no surprises.' },
    ],
  },

  setup: {
    overview:
      "Commissions live as a layer above payroll. Set rates per role, set the qualification rule, and every won deal posts commissions automatically.",
    introBaseDur: 1200,
    introNarration: 'Set rates + rules. Posts automatically.',
    steps: [
      {
        icon: 'DollarSign',
        title: 'Set per-role rates',
        body: 'Settings → Commissions. Per role: Setter $25 / appointment, Rep 8% of gross profit, Lead Source $25 / first appointment.',
        narration: 'Set per-role rates. Setter, rep, lead source.',
        baseDur: 5000,
      },
      {
        icon: 'CheckSquare',
        title: 'Pick qualification rules',
        body: 'When does pending → earned? Setter: when quote created (default) or appointment set. Rep: on deal won. Source: on first invoice paid.',
        narration: 'Pick when pending becomes earned.',
        baseDur: 5500,
      },
      {
        icon: 'User',
        title: 'Per-employee overrides',
        body: 'Top reps get a custom rate. Employees → individual → Commission Override.',
        narration: 'Override rates per employee. Top reps get custom rates.',
        baseDur: 5000,
      },
      {
        icon: 'CircleDollarSign',
        title: 'Payroll picks them up',
        body: "Next payroll run includes every earned-and-not-yet-paid commission. Itemized on the stub. Flips to paid when the cycle posts.",
        narration: 'Payroll picks them up automatically. Itemized on the stub.',
        baseDur: 5000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The commission engine. Tracks setter, sales rep, and lead-source commissions through a state machine: pending (event happened) → earned (qualification rule fired) → paid (rolled into payroll run). Sits on top of leads + invoices + payroll_runs.",

    howItWorks:
      "lead_commissions table is the canonical store. Per-company rates in companies.setter_pay_per_appointment + employees.commission_rep_pct + companies.source_pay_per_lead. Per-employee overrides in employees.commission_setter_rate / commission_rep_rate. Triggers post pending rows on lead status changes; a second set of triggers walks pending → earned when qualification rule fires (setter_qualification_rule field). Payroll runs include earned-and-not-yet-paid via a join against payroll_run_id IS NULL.",

    examples: [
      'Setter Marcus books → +$25 pending → rep Cole quotes → moves to +$25 earned',
      'Deal closes $4,200 / 38% margin → Cole rep commission $128 earned',
      'Lead from Yelp source → $25 source bonus posts to Yelp_employee on first invoice paid',
    ],

    gotchas: [
      'Pending commissions don\'t paid out. Setter on a Lost deal forfeits the pending row. Only earned counts.',
      'Per-employee overrides take precedence over company rates. Check the override field before debugging "why is X off".',
      'Commission_requires_quote (boolean) bridges the legacy world to the canonical qualification_rule. Keep them in sync.',
    ],

    faqs: [
      {
        q: 'What if a sales rep splits a deal?',
        a: 'salesperson_ids on the lead/appointment supports multi-rep. Commission splits proportionally.',
      },
      {
        q: 'Reversals on a charged-back deal?',
        a: 'Mark the invoice Refunded → commission entries auto-flip to a negative line on the next payroll run.',
      },
    ],

    actions: {
      open: { route: '/payroll', label: 'Open Payroll' },
      setter: { route: '/lead-setter', label: 'Lead Setter board' },
    },
  },

  lastVerified: '2026-06-03',
  freshUntil: 90,
}
