export default {
  id: 'freddy-tracking',
  title: 'Live Tracking',
  category: 'Fleet & Vehicles',
  icon: 'MapPin',
  route: '/agents/freddy/tracking',
  summary: 'See every truck on a live map using driver phone GPS — no expensive hardware dongle, no third-party subscription.',
  replaces: ['Samsara GPS', 'Verizon Connect', 'Google Maps manual sharing'],
  highlights: [
    'Live truck positions',
    'No hardware required',
    'Geofence alerts',
    'Per-driver history',
  ],
  marketing: {
    voice: 'Bill',
    scenes: [
      {
        id: 'map',
        baseDur: 4500,
        narration: 'Every truck shows up live on the map — green means moving, yellow is idling, gray is offline. No dongle, no subscription, just the phones your drivers already carry.',
      },
      {
        id: 'detail',
        baseDur: 6500,
        narration: 'Tap any marker and a sidebar slides in with everything you need — driver name, current speed, exact address, battery level, and how many seconds ago the last ping came through.',
      },
      {
        id: 'history',
        baseDur: 6500,
        narration: 'Pull up today\'s breadcrumb trail for any truck and scrub the timeline slider to see exactly where it was — every job stop, lunch break, and supply run with timestamps.',
      },
      {
        id: 'geofence',
        baseDur: 4500,
        narration: 'Set geofence rules in seconds — alert if a truck leaves the job site early, enters a restricted zone, or moves after hours. Freddy fires the alert the moment it happens.',
      },
    ],
  },
  setup: {
    overview: 'Drivers enable location on their phones, you draw geofences, then set ping frequency and privacy rules — done in under ten minutes.',
    introBaseDur: 1200,
    introNarration: 'Three steps and your fleet is on the map.',
    steps: [
      {
        icon: 'Smartphone',
        title: 'Enable GPS on driver phones',
        body: 'Drivers open Job Scout mobile → Settings → Allow Location. iOS: always allow. Android: precise location. No additional app install beyond Job Scout itself.',
        narration: 'Drivers grant location permission once inside Job Scout — iOS needs always-allow, Android needs precise location.',
        baseDur: 4500,
      },
      {
        icon: 'MapPin',
        title: 'Set up geofences',
        body: 'Tracking → Geofences → New. Draw a radius or polygon on the map. Choose alert condition: enter, exit, or both. Set the recipient.',
        narration: 'Draw a radius or polygon, pick enter or exit as the trigger, and choose who gets the alert.',
        baseDur: 5000,
      },
      {
        icon: 'Bell',
        title: 'Configure ping frequency',
        body: 'Settings → Fleet → Tracking. Active (clock-in) pings every 60s. Idle pings every 5min. After-hours every 15min. Adjust to battery budget.',
        narration: 'Active pings hit every 60 seconds; idle and after-hours slow down automatically to protect battery life.',
        baseDur: 4500,
      },
      {
        icon: 'Shield',
        title: 'Privacy settings',
        body: 'Drivers can see their own track. Only managers see all trucks. Toggle tracking off for their days off in Settings → Tracking Privacy.',
        narration: 'Drivers see only their own history — managers see the full fleet, and drivers can opt out on days off.',
        baseDur: 5000,
      },
    ],
  },
  agentKnowledge: {
    whatItIs: 'Real-time GPS tracking using driver phones. No hardware. Freddy computes geofence events, idle time, and after-hours movement from the ping stream.',
    howItWorks: 'location_pings table: id, vehicle_id, employee_id, lat, lng, accuracy_m, speed_kmh, heading, battery_pct, ts. Freddy processes pings every 5 min: computes distance-from-job, idle detection (speed < 2 for 10+ min), geofence entry/exit events. Geofences stored as PostGIS geometry in the geofences table. After-hours pings are only recorded if vehicle status = "In Use". Drivers can query their own pings; manager role sees all vehicles.',
    examples: [
      'Show me where VEH-003 is right now',
      'Which trucks have been idle more than 20 minutes?',
      'Did Marcus leave the job site before 4pm today?',
      'List all geofence alerts from this week',
    ],
    gotchas: [
      'iOS background location requires "Always Allow" — "While Using" will drop pings when the screen locks',
      'Accuracy degrades in urban canyons; accuracy_m > 50 pings are flagged and filtered from history trails',
      'After-hours pings stop if vehicle status flips to "Out of Service" — make sure dispatch keeps status current',
      'Geofence polygons must be valid PostGIS geometry; the UI enforces closure but API callers should validate',
    ],
    faqs: [
      {
        q: 'Do drivers need a separate GPS app?',
        a: 'No. Location comes from the Job Scout mobile app. Drivers just grant permission once.',
      },
      {
        q: 'How accurate is phone GPS vs a hardware dongle?',
        a: 'Typically 3–10 m in open areas, 15–50 m near buildings. Hardware dongles are similar unless they use OBD odometer fusion, which Job Scout does not.',
      },
      {
        q: 'Can a driver turn off tracking?',
        a: 'Drivers can revoke location permission on their phone or toggle off in Settings → Tracking Privacy for scheduled days off. Managers are notified when a vehicle goes offline unexpectedly.',
      },
      {
        q: 'How long is location history retained?',
        a: 'Pings are retained for 90 days by default. Company admins can adjust this in Settings → Data Retention.',
      },
    ],
    actions: {
      open: { route: '/agents/freddy/tracking', label: 'Open Live Map' },
    },
  },
  lastVerified: '2026-06-11',
  freshUntil: 90,
}
