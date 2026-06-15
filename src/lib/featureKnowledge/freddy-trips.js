// Knowledge Card — Freddy Trips & Driver Scores
// GPS trip tracking, driver scorecards, and mileage reimbursement.

export default {
  id: 'freddy-trips',
  title: 'Trips & Driver Scores',
  category: 'Fleet',
  icon: 'MapPin',
  route: '/fleet/trips',

  summary:
    'Every drive is logged automatically — start, stop, miles, duration, job link — and Freddy scores each driver weekly on speed, hard brakes, and idle time so you can coach before costs spiral.',

  replaces: ['TripLog', 'MileIQ', 'Samsara driver scorecards', 'manual mileage sheets'],
  highlights: [
    'Automatic trip capture + job linking',
    'Driver scorecards A–F each week',
    'IRS-rate mileage reimbursement export',
    'Hard brake + idle anomaly alerts',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'trips',         baseDur: 4500, narration: 'Every drive, logged. Date, driver, vehicle, miles, duration — and which job it was for.' },
      { id: 'trip',          baseDur: 6500, narration: 'Tap any trip. Route on the map, stats below, and a one-click link to the job. Freddy ties the drive to the dollar.' },
      { id: 'drivers',       baseDur: 6500, narration: 'Driver scorecards. Marcus earns an A — smooth, on time. Cole racks up hard brakes and gets a C. Now you know who to coach.' },
      { id: 'reimbursement', baseDur: 5500, narration: 'Month-end — one click exports personal-vehicle mileage at the IRS rate. Payroll gets the number, nothing falls through.' },
    ],
  },

  setup: {
    overview:
      'Freddy Trips runs on top of the Fleet module. Enable GPS tracking in Freddy settings, assign vehicles, and trips start flowing in.',
    introBaseDur: 1200,
    introNarration: 'Enable Freddy Trips. Assign vehicles. Trips flow in.',
    steps: [
      {
        icon: 'Bot',
        title: 'Enable Freddy Trips',
        body: 'Settings → AI Agents → Freddy → Trips & Scoring → Enable. Freddy needs GPS access on driver phones or telematics hardware.',
        narration: 'Enable Freddy Trips in Settings, AI Agents.',
        baseDur: 4500,
      },
      {
        icon: 'Truck',
        title: 'Assign vehicles to drivers',
        body: 'Fleet → each vehicle → Assign Driver. Primary driver trips auto-post to their scorecard.',
        narration: 'Assign drivers to vehicles. Scorecard starts tracking.',
        baseDur: 4500,
      },
      {
        icon: 'DollarSign',
        title: 'Set reimbursement rate',
        body: 'Settings → Fleet → Mileage Rate. Defaults to current IRS rate ($0.67/mi for 2026). Override per employee if needed.',
        narration: 'Set the mileage reimbursement rate. Defaults to IRS.',
        baseDur: 4500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      'GPS trip log, driver scorecard engine, and mileage reimbursement calculator. Every trip captured from telematics or driver-app GPS is stored, linked to a job if the driver was dispatched, and scored on speed, hard braking, and idle percentage.',

    howItWorks:
      'Backed by fleet_trips, fleet_trip_waypoints, fleet_driver_scores tables. Trips linked to jobs via fleet_trips.job_id foreign key. Freddy scores each driver on a 7-day rolling window: speed_score (% of time > posted limit), brake_score (hard events per 10 miles), idle_score (idle minutes / total runtime). Composite A–F grade posted to fleet_driver_scores weekly by pg_cron. Reimbursement pulls trips where vehicle_type = personal and sums miles x rate.',

    examples: [
      'Driver clocks out at a job site → Freddy links the return trip to JOB-041',
      'Cole averages 44 mph on 28-mph streets → hard_brake_count 7 this month → score drops to C',
      'Month-end: Marcus drove 42 personal miles → $28.14 reimbursement exported to payroll CSV',
    ],

    gotchas: [
      'Job linking is best-effort — Freddy matches trip start/end time to job dispatch windows. Manual override available on each trip.',
      'Hard-brake detection requires telematics or a phone accelerometer. Without hardware, only GPS miles + speed are scored.',
      'Personal vs. company vehicle type is set on the vehicle record. Reimbursement only exports personal-vehicle trips.',
    ],

    faqs: [
      {
        q: 'Can drivers see their own scores?',
        a: 'Yes — the Employee self-service portal shows their current score and last 4 weeks of trend.',
      },
      {
        q: 'What if a trip is split between two jobs?',
        a: 'Freddy links to the job active at trip-start. Split the trip manually in the detail view if needed.',
      },
    ],

    actions: {
      open: { route: '/fleet/trips', label: 'Open Trips' },
      fleet: { route: '/fleet', label: 'Open Fleet' },
    },
  },

  lastVerified: '2026-06-11',
  freshUntil: 90,
}
