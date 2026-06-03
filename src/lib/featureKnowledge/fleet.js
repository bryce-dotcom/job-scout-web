// Knowledge Card — Fleet & Freddy
// The fleet command center: trucks, fuel, maintenance, drivers.

export default {
  id: 'fleet',
  title: 'Fleet & Freddy',
  category: 'Fleet',
  icon: 'Truck',
  route: '/fleet',

  summary:
    'Track every truck — odometer, fuel cards, maintenance schedule, who drives what — with Freddy the AI fleet manager flagging upcoming services and unusual fuel spikes before they bite you.',

  replaces: ['Fleetio', 'Samsara fleet management', 'spreadsheet maintenance logs', 'manual fuel-card reconciliation'],
  highlights: [
    'Per-truck maintenance schedule',
    'Fuel anomaly detection',
    'Driver assignment + history',
    'AI service reminders',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'list',      baseDur: 4500, narration: "Open Fleet. Every truck in the company, with its odometer, fuel card, and who's behind the wheel." },
      { id: 'detail',    baseDur: 6500, narration: 'Pick a truck — full history. Oil changes, tire rotations, repairs, accidents. Nothing slips through.' },
      { id: 'fuel',      baseDur: 6500, narration: 'Fuel logs flow in from the cards. Freddy spots the spike — truck twelve burned twice what it should. Maybe a leak, maybe a thief.' },
      { id: 'service',   baseDur: 6500, narration: 'Maintenance schedule by mileage or time. Freddy nudges your inbox when a truck is due for service.' },
      { id: 'driver',    baseDur: 5500, narration: 'Driver assignments. Cole drives truck seven, Marcus has the dually. Insurance audit is easy now.' },
    ],
  },

  setup: {
    overview:
      "Fleet is a Lenard-style agent feature — you unlock Freddy in Settings → Agents. Once on, register each vehicle once and Freddy starts watching.",
    introBaseDur: 1200,
    introNarration: 'Unlock Freddy. Add your trucks. Freddy starts watching.',
    steps: [
      {
        icon: 'Bot',
        title: 'Unlock Freddy',
        body: 'Settings → AI Agents → Freddy The Fleet Manager → Enable. He needs read access to expenses + jobs to do fuel + driver math.',
        narration: 'Unlock Freddy in Settings, AI Agents.',
        baseDur: 4500,
      },
      {
        icon: 'Plus',
        title: 'Add your trucks',
        body: 'Fleet → New Vehicle. VIN, make, model, year, current odometer, fuel card last 4. Repeat per truck.',
        narration: 'Add each truck. VIN, odometer, fuel card.',
        baseDur: 4500,
      },
      {
        icon: 'Calendar',
        title: 'Set service intervals',
        body: 'Oil every 5,000 mi · tire rotation every 7,500 · inspection annually. Freddy uses the intervals to send reminders.',
        narration: 'Set service intervals. Freddy uses them for reminders.',
        baseDur: 5000,
      },
      {
        icon: 'UserCheck',
        title: 'Assign drivers',
        body: 'Pick the primary driver per truck from Employees. Reassign anytime — history is preserved.',
        narration: 'Assign primary drivers. History is preserved on reassign.',
        baseDur: 5000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The fleet management surface for trucks, trailers, and equipment. Carries odometer history, fuel logs, maintenance schedules, driver assignments, accident records, and registration/insurance documents. Freddy the AI agent layers anomaly detection and proactive service reminders on top.",

    howItWorks:
      "Backed by fleet_vehicles, fleet_maintenance_records, fleet_fuel_logs, fleet_driver_assignments tables. Fuel logs pull from Plaid when fuel-card transactions land (merchant matching against a fuel-merchant list). Freddy's anomaly detector computes z-score against trailing 90-day per-vehicle mpg. Service reminders are pg_cron jobs that scan vehicles where current_odometer + estimated_daily_miles*lead_days >= next_service_at and write to inbox_tasks.",

    examples: [
      'Truck 7 odometer hits 75,432 → oil change at 80k → 568 miles away → ~2 weeks notice based on daily avg',
      'Truck 12 fuel card buys $180 in one day (normal $80) → Freddy flags it in inbox',
      'Insurance audit: pull driver assignments for the past year per VIN',
    ],

    gotchas: [
      'Freddy needs at least 30 days of fuel data to build a baseline. Before that, no anomaly alerts.',
      'Fuel-card matching depends on the merchant name pattern. Add patterns in Settings → Fleet → Fuel Merchants for off-brand stations.',
      'Driver reassignment doesn\'t reset mileage — odometer is per-vehicle, not per-driver.',
    ],

    faqs: [
      {
        q: 'Does Freddy track GPS?',
        a: 'Optional — if your trucks have telematics, Freddy can ingest the feed. Without telematics, he relies on time clock GPS pings on driver phones.',
      },
      {
        q: 'Can I run multiple agents (Freddy + Lenard) on the same plan?',
        a: 'Yes — each AI agent unlocks independently. Pay only for the verticals you actually use.',
      },
    ],

    actions: {
      open: { route: '/fleet', label: 'Open Fleet' },
      freddy: { route: '/agents/freddy', label: 'Open Freddy' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
