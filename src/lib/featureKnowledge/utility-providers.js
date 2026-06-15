export default {
  id: 'utility-providers',
  title: 'Utility Providers',
  category: 'Lighting & Energy',
  icon: 'Zap',
  route: '/utility-providers',
  summary: 'Your database of utility companies — SRP, RMP, APS, PG&E — with rate schedules, contact info, and linked rebate programs so Lenard always has the right numbers.',
  replaces: ['DSIRE database lookups', 'manual utility research', 'calling utility companies'],
  highlights: [
    'Per-state utility database',
    'Rate schedules pre-loaded',
    'Linked to rebate programs',
    'Contact info on file',
  ],
  marketing: {
    voice: 'Bill',
    scenes: [
      {
        id: 'list',
        baseDur: 4500,
        narration: 'Every utility you work with, in one place. SRP, RMP, APS, PG&E — searchable by state, each card showing active programs and rate schedule status at a glance.',
      },
      {
        id: 'detail',
        baseDur: 6500,
        narration: "Click into SRP and you've got the full picture — your utility rep's direct line, all three active rebate programs, and exactly when each one was last verified.",
      },
      {
        id: 'rates',
        baseDur: 6500,
        narration: 'Rate schedules live right inside the provider record. Peak and off-peak $/kWh by tariff class — the exact numbers Lenard plugs into every energy savings calculation.',
      },
      {
        id: 'programs',
        baseDur: 4500,
        narration: 'Linked programs panel shows every rebate engine tied to this provider. Lenard automatically picks the highest-value program that matches your fixture mix.',
      },
    ],
  },
  setup: {
    overview: 'Add your utility territories, verify rate schedules annually, link programs to providers, and store your utility rep contacts.',
    introBaseDur: 1200,
    introNarration: 'Four quick steps to get Lenard connected to the right rebate engines.',
    steps: [
      {
        icon: 'Zap',
        title: 'Select your utility territories',
        body: 'Settings → Utility Providers → Active Territories. Check the states you operate in. Lenard filters to only show relevant providers on audits.',
        narration: 'Check the states you work in and Lenard narrows its provider list automatically.',
        baseDur: 4500,
      },
      {
        icon: 'FileCheck',
        title: 'Verify rate schedules yearly',
        body: 'Utility rates change annually. Jan 1 each year, review each provider\'s rate schedule and update $/kWh. Affects energy savings calculations on new audits.',
        narration: 'Rates shift every January — a five-minute update keeps every future audit accurate.',
        baseDur: 5000,
      },
      {
        icon: 'Link',
        title: 'Link programs to providers',
        body: 'Utility Programs → each program → Provider field. This is how Lenard connects an audit to the right utility rebate engine.',
        narration: "Set the Provider field on each rebate program and Lenard's wiring is complete.",
        baseDur: 4500,
      },
      {
        icon: 'User',
        title: 'Add utility rep contacts',
        body: "Provider → Contacts → Add. Your dedicated utility rep's name + phone. Priceless when a rebate application gets stuck in review.",
        narration: "Store your rep's direct line here — you'll thank yourself when an application hits a snag.",
        baseDur: 4500,
      },
    ],
  },
  agentKnowledge: {
    whatItIs: 'The utility company reference database. Each provider links to its rate schedule and rebate programs. Lenard uses it to match audits to the right rebate engine automatically.',
    howItWorks: 'utility_providers table: id, company_id, name, state, rate_schedule (JSONB with peak/off_peak $/kWh by tariff), contact_name, contact_phone, contact_email, logo_url, active (bool). utility_programs has a utility_provider_id FK. Lenard\'s audit engine resolves the job site state → queries utility_providers by state → loads linked utility_programs → selects the program with the highest rebate value for the fixture mix. The rate_schedule JSONB feeds the kWh savings dollar calculation on every audit line item.',
    examples: [
      'Show me all active utility providers in Arizona',
      'What is the peak rate for SRP Commercial General Service?',
      'Which programs are linked to PG&E?',
      'Update the off-peak rate for Rocky Mountain Power to $0.048',
      'Who is our SRP utility rep?',
    ],
    gotchas: [
      'rate_schedule is JSONB — query with ->>/-> operators, not direct column access',
      'A provider must have active: true to appear in Lenard audit lookups',
      'Multiple providers can share the same state — Lenard picks by utility_provider_id set on the program, not state alone',
      'Expired programs (status = expired) are excluded from Lenard auto-selection even if linked',
    ],
    faqs: [
      {
        q: 'Why is Lenard not finding a rebate program for my audit?',
        a: 'Check that the utility_program has the correct utility_provider_id set and that the program status is active. Also verify the provider active flag is true.',
      },
      {
        q: 'How do I add a new utility company?',
        a: 'Utility Providers → Add Provider. Fill in name, state, and rate schedule. Then link existing or new programs to it via Utility Programs → Provider field.',
      },
      {
        q: 'Can one provider cover multiple states?',
        a: 'Each provider record has one state field. For multi-state utilities like PacifiCorp, create a separate record per state (e.g., PacifiCorp UT, PacifiCorp ID) so Lenard resolves correctly by job site state.',
      },
    ],
    actions: {
      open: { route: '/utility-providers', label: 'Open Utility Providers' },
    },
  },
  lastVerified: '2026-06-10',
  freshUntil: 90,
}
