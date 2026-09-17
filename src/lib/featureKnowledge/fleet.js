// Knowledge Card — Fleet & Freddy
//
// This card feeds Help, the walkthrough narration, and Arnie's answers about
// the fleet. The previous version described a product that did not exist —
// fuel logs arriving from Plaid, a z-score anomaly detector, pg_cron reminders
// landing in an inbox, table names nothing in the schema matches. Arnie repeated
// all of it with confidence. Every claim below was walked in-app on 2026-09-17;
// anything not built is listed in gotchas as "Not built yet" rather than left ambiguous.

export default {
  id: 'fleet',
  title: 'Fleet & Freddy',
  category: 'Fleet',
  icon: 'Truck',
  route: '/fleet',

  summary:
    'Every truck, trailer and machine with what it cost, what it is worth today and what it costs per mile to keep — plus live GPS, a service schedule Freddy drafts from the make and model, and a "report a problem" button for whoever is driving it.',

  replaces: ['Fleetio', 'a spreadsheet of purchase prices and oil changes', 'guessing when to sell a truck'],
  highlights: [
    'Lifecycle bar: keep, plan, or sell — per machine',
    'Freddy drafts the PM schedule; you approve it',
    'Drivers report problems from the truck',
    'Live GPS via Moto Watchdog trackers',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'list',      baseDur: 5000, narration: "Open Fleet. Every truck and machine, and across the top, what needs somebody today — unsafe to run, repair requests, services overdue." },
      { id: 'lifecycle', baseDur: 6500, narration: "Each card carries a lifecycle bar. Depreciation is the biggest cost in a fleet and the only one that never sends an invoice — this is where you see it, and when it says sell." },
      { id: 'pm',        baseDur: 6500, narration: "No service schedule? Ask Freddy. He drafts one from the make and model — oil every five thousand or six months, DOT inspection annually — and you edit it before it counts." },
      { id: 'report',    baseDur: 6000, narration: "A driver opens their truck and taps Report a problem. Four levels, worst first. Unsafe to run flags the card and the detail page until someone clears it." },
      { id: 'map',       baseDur: 5000, narration: "Company Map shows who is on the clock and where every tracked vehicle is, on one screen." },
    ],
  },

  setup: {
    overview:
      "Recruit Freddy at Base Camp. Then add each machine once with the three numbers the lifecycle needs — what it cost, when you bought it, and the meter when you bought it — and Freddy can start telling you what it is worth.",
    introBaseDur: 1200,
    introNarration: 'Recruit Freddy. Add your machines. Give him three numbers each.',
    steps: [
      {
        icon: 'Bot',
        title: 'Recruit Freddy',
        body: 'Base Camp → Freddy The Fleet Manager → Recruit. The Fleet pages are locked until he is on.',
        narration: 'Recruit Freddy at Base Camp.',
        baseDur: 4000,
      },
      {
        icon: 'Plus',
        title: 'Add your machines',
        body: 'Fleet → Add Asset. Scan the plate or paste the VIN and the make, model, year and class fill in (NHTSA decode, free). Type the current odometer or hours.',
        narration: 'Add each machine. Scan the plate or paste the VIN.',
        baseDur: 5000,
      },
      {
        icon: 'DollarSign',
        title: 'Give the lifecycle its inputs',
        body: 'On the asset: purchase price, purchase date, and the miles or hours on it when you bought it. With those Freddy draws the bar and prices it per mile. Without the meter-when-bought he will say "wear unknown" rather than guess.',
        narration: 'Purchase price, date, and the meter when bought. Three numbers.',
        baseDur: 5500,
      },
      {
        icon: 'Sparkles',
        title: 'Let Freddy draft the schedule',
        body: 'On the asset → Maintenance → Build one with Freddy. He proposes six to ten services with real intervals; nothing is saved until you tap Save.',
        narration: 'Build the schedule with Freddy, then save it.',
        baseDur: 5000,
      },
      {
        icon: 'UserCheck',
        title: 'Mark your drivers',
        body: 'Employees → set Driver / Operator, licence class and expiry. The asset\'s Assigned operator dropdown then shows who may legally run it and why someone may not.',
        narration: 'Mark drivers on their employee record so the assignment check works.',
        baseDur: 5000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The fleet surface for trucks, trailers and equipment. Per machine: what it cost and is worth (lifecycle / depreciation), what it costs to run (repairs, tires, fuel, insurance, drivers), a preventive-maintenance schedule with two clocks (miles-or-hours AND days, whichever first), service requests anyone can file, live GPS where a tracker is fitted, and who is assigned to run it with a licence check. Freddy is the AI layer: he drafts PM schedules from make/model and reads plates; he does not write to the schedule or move money on his own.",

    howItWorks:
      "Tables: fleet (the asset, incl. purchase_price, purchase_date, miles_at_purchase/hours_at_purchase, asset_class, meter_basis, assigned_to, mileage_hours), fleet_meter_readings → fleet_current_meters view (MAX per column; a typed odometer and telematics both land here — triggers keep fleet.mileage_hours and the readings in step), fleet_pm_schedules + fleet_pm_status view (overdue / due_soon / never_done / ok), fleet_service_requests (severity safety|urgent|normal|minor; safety = do not operate; status open→acknowledged→scheduled→resolved|declined), fleet_repairs (repairs and tires), fleet_fuel_logs (typed in on Freddy → Costs), fleet_recurring_costs (insurance and driver cost, fleet-wide split by value/even/usage or per unit), fleet_maintenance (the older maintenance log — still present). GPS: Moto Watchdog partner API, one JobScout platform account; fleet.gps_device_id is the only link between a tracker and a tenant. Lifecycle maths lives in lib/fleetLifecycle.js (per-class curves, equivalent-annual-cost, two clocks: wear vs age). PM proposals come from the fleet-pm-suggest edge function, which returns proposals only. The Fleet list's pills (unsafe / requests / overdue / due soon) come from useFleetAttention and filter the list in place.",

    examples: [
      '2025 Ram RHO bought new at $83,000, 3,898 miles → worth ~$68,600, $6.00/mile ($5.57 of it depreciation), limited by age not wear → "sell or rent" verdict; driven 25,000 mi/yr the same truck is $2.61/mile',
      'Ask Freddy for a schedule on a 2019 Ram 2500 → 10 services incl. a fuel-filter interval for the 6.7L Cummins and an annual DOT inspection marked safety; owner edits and saves',
      'Driver taps Report a problem → "Unsafe to run: brake pedal goes to the floor" → card and detail page carry a red flag until someone with the truck clears it (confirm required)',
      'Truck typed in at 118,400 miles, tracker later reports 150 → the odometer stays 118,400; readings can raise the header figure, never lower it',
    ],

    gotchas: [
      'Telematics miles are NOT an odometer. A tracker installed last month on an old truck reports a few hundred miles; the lifecycle needs a dash reading (typed odometer or the meter-when-bought) or it says "wear unknown" instead of pricing per mile.',
      'Two PM surfaces coexist: the older Log Maintenance / next PM date on the asset, and the schedule. Once an asset has a schedule, the schedule is what the card, tile and banner report; the old date is ignored for that asset. Logging in the old Maintenance History does not advance the schedule.',
      'A schedule with no history reads "never done" / "not yet logged", not overdue. The miles clock only runs once a service has a last_done_meter; until then only the days clock can make it due.',
      'Idle hours come from tracker breadcrumbs and are withheld (blank) when the ignition record is incomplete rather than shown as 0%.',
      'Fuel is typed in, not imported. There is no bank/fuel-card feed and no anomaly detection — do not promise either.',
      'Not built yet: alerts to the driver (push / SMS / Field Scout banner) when a PM comes due or their request is acknowledged — the counts live on the Fleet page only.',
      'Not built yet: fuel-card or Plaid import of fuel purchases, and any fuel anomaly / theft detection.',
      'Not built yet: automatic market comps for resale value (fleet-valuation exists but is not wired to a live source).',
    ],

    faqs: [
      {
        q: 'Does Freddy track GPS?',
        a: 'Yes, with a Moto Watchdog tracker fitted to the vehicle and linked on the asset (Freddy → Tracking). Company Map shows every tracked vehicle alongside everyone on the clock. Without a tracker there is no vehicle GPS — people on the clock still appear from Field Scout.',
      },
      {
        q: 'Where do I request a repair on my truck?',
        a: 'Open the truck from Fleet, tap Report a problem, pick how bad it is, say what is wrong. "Unsafe to run" flags it everywhere until someone clears it.',
      },
      {
        q: 'How do I set up a maintenance schedule?',
        a: 'On the asset, Maintenance → Build one with Freddy. He proposes intervals from the make and model; you edit and save. Mark a service done from the same list and both clocks reset from today\'s meter.',
      },
      {
        q: 'When should I sell a truck?',
        a: 'The lifecycle bar on each card says keep / plan replacement / sell, from depreciation plus the running costs logged against it. It needs purchase price, purchase date and the meter when bought to be honest; it names what is missing otherwise.',
      },
      {
        q: 'Can I run Freddy alongside other agents?',
        a: 'Yes — each agent is recruited independently at Base Camp and billed on its own.',
      },
    ],

    actions: {
      open: { route: '/fleet', label: 'Open Fleet' },
      map: { route: '/company-map', label: 'Open Company Map' },
      freddy: { route: '/agents/freddy', label: 'Open Freddy' },
    },
  },

  lastVerified: '2026-09-17',
  freshUntil: 90,
}
