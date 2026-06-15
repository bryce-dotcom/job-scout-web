// Knowledge Card — Fleet Maintenance & Costs (Freddy)
// Per-vehicle cost tracking: fuel logs, maintenance records, service alerts.

export default {
  id: 'freddy-costs',
  title: 'Fleet Maintenance & Costs',
  category: 'Fleet',
  icon: 'Wrench',
  route: '/fleet',

  summary:
    'Track every maintenance record and fuel fill-up per vehicle — with Freddy flagging cost outliers, service overdue alerts, and a YTD cost-per-truck breakdown that shows you exactly where the money goes.',

  replaces: ['Fleetio', 'spreadsheet maintenance logs', 'manual fuel reconciliation', 'QuickBooks vehicle expense tracking'],
  highlights: [
    'YTD cost per vehicle with fuel vs maintenance split',
    'Freddy flags anomalous fuel fills in real time',
    'Service due / overdue alerts with one-click schedule',
    'Maintenance records with shop, mileage, and cost',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'overview',    baseDur: 4500, narration: 'Fleet Costs dashboard. Total spend, fuel vs maintenance, and a bar chart showing which truck is eating your budget.' },
      { id: 'maintenance', baseDur: 6500, narration: 'Every oil change, tire rotation, brake job logged — shop, mileage, cost. Add a record in seconds.' },
      { id: 'fuel',        baseDur: 6500, narration: 'Freddy caught it. June fifth fill on VEH-001 was sixty-one gallons — three-point-four times the average. That row is lit up red.' },
      { id: 'alerts',      baseDur: 5500, narration: 'One overdue. Two more due soon. Hit Schedule and it lands on the fleet calendar — no chasing techs.' },
    ],
  },

  setup: {
    overview:
      'Enable Freddy in Settings, then add vehicles and set service intervals. Cost tracking starts the moment you log the first record.',
    introBaseDur: 1200,
    introNarration: 'Enable Freddy, add vehicles, set intervals.',
    steps: [
      {
        icon: 'Bot',
        title: 'Enable Freddy',
        body: 'Settings → AI Agents → Freddy The Fleet Manager → Enable. He needs read access to expenses + fleet tables.',
        narration: 'Enable Freddy in Settings, AI Agents.',
        baseDur: 4500,
      },
      {
        icon: 'Truck',
        title: 'Register your vehicles',
        body: 'Fleet → New Vehicle. Enter VIN, make, model, year, current odometer, and fuel card last four digits.',
        narration: 'Add each vehicle. VIN, odometer, fuel card.',
        baseDur: 4500,
      },
      {
        icon: 'Calendar',
        title: 'Set service intervals',
        body: 'Per vehicle: oil every 5,000 mi, tire rotation every 7,500 mi, annual inspection. Freddy fires alerts when milestones approach.',
        narration: 'Set service intervals so Freddy knows when to alert you.',
        baseDur: 5000,
      },
      {
        icon: 'DollarSign',
        title: 'Log first costs',
        body: 'Add any open maintenance records and recent fuel fill-ups. Freddy needs 30 days of fuel data to establish a baseline for anomaly detection.',
        narration: 'Log existing records. Freddy builds a baseline from 30 days of fuel data.',
        baseDur: 5000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      'The cost intelligence layer of Fleet. Tracks fuel logs, maintenance records, and service schedules per vehicle. Freddy runs anomaly detection on fuel fills and sends proactive service-due alerts.',

    howItWorks:
      'Backed by fleet_fuel_logs and fleet_maintenance_records tables (both keyed to fleet_vehicle_id). Fuel anomaly detection computes a per-vehicle trailing 90-day average fill size; fills exceeding 2.5 standard deviations are flagged and written to inbox_tasks. Service alerts are pg_cron jobs scanning next_service_at vs (current_odometer + estimated_daily_miles * lead_days). Cost-per-vehicle aggregates are computed views joining both tables.',

    examples: [
      'VEH-001 June 5 fill: 61.8 gal vs 18.5 gal avg → z-score 3.4 → Freddy alert in inbox',
      'VEH-003 PM Service was due May 1 at 89,000 mi → overdue alert with schedule CTA',
      'YTD fleet cost report: $18,420 total, VEH-003 highest at $5,890 (alternator + tires)',
    ],

    gotchas: [
      'Freddy needs 30+ days of fuel data to compute a reliable baseline. Alerts are suppressed before that.',
      'Maintenance costs are entered manually. They do not auto-pull from Plaid unless the vendor is mapped in Settings → Fleet → Vendors.',
      'Cost-per-vehicle bars include only logged records — if fill-ups are not logged, the fuel bar will be understated.',
    ],

    faqs: [
      {
        q: 'Can Freddy auto-import fuel card transactions?',
        a: 'Yes — if your fuel card is connected via Plaid, transactions land in fleet_fuel_logs automatically via merchant-name matching.',
      },
      {
        q: 'How do I dismiss a flagged fill-up?',
        a: 'Open the fuel log row, set the anomaly_dismissed flag, and add a note. Freddy will exclude it from future baseline calculations.',
      },
    ],

    actions: {
      open: { route: '/fleet', label: 'Open Fleet' },
      freddy: { route: '/agents/freddy', label: 'Open Freddy' },
    },
  },

  lastVerified: '2026-06-11',
  freshUntil: 90,
}
