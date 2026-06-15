// Knowledge Card — Routes & Route Calendar
// Group jobs into optimized day-routes, see them on a map and calendar.

export default {
  id: 'routes',
  title: 'Routes',
  category: 'Project & Job Management',
  icon: 'Route',
  route: '/routes',

  summary:
    'Group jobs into optimized day-routes, see them on a map and calendar, dispatch a crew to a multi-stop sweep — without paying for OptimoRoute.',

  replaces: ['OptimoRoute', 'Routific', 'ServiceTitan routing', 'Google Maps + spreadsheet'],
  highlights: [
    'Multi-stop routes',
    'Map + calendar view',
    'Crew assignment',
    'Per-stop ETA',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'unassigned', baseDur: 4500, narration: 'Twelve unassigned jobs across the valley. Whose route does each one go on?' },
      { id: 'plan',       baseDur: 6000, narration: 'Drag the four west-side jobs into a route. Map redraws — your sweep is 38 miles, four hours.' },
      { id: 'optimize',   baseDur: 6500, narration: 'Hit Optimize. The system reorders the stops to cut the drive time. Same four jobs, 31 miles now.' },
      { id: 'assign',     baseDur: 6000, narration: 'Pick the crew, pick the day. Route lands on their Field Scout with turn-by-turn for every stop.' },
      { id: 'calendar',   baseDur: 5500, narration: 'Calendar view shows every route, every crew, color-coded. No double-booking, no missed stops.' },
    ],
  },

  setup: {
    overview:
      'Routes pull from your existing Jobs. There is no separate intake — you just group jobs into a route record and assign the crew + day. Maps work out of the box with a Google Maps key.',
    introBaseDur: 1200,
    introNarration: 'Routes ride on top of Jobs. Quick setup.',
    steps: [
      {
        icon: 'KeyRound',
        title: 'Set your Google Maps key',
        body: 'In Settings → Integrations, paste your Google Maps API key with Directions + Distance Matrix enabled. Required for optimization.',
        narration: 'Paste your Google Maps API key in Settings, Integrations.',
        baseDur: 5000,
      },
      {
        icon: 'MapPin',
        title: 'Create a route',
        body: 'Routes page, click New Route, name it (Tuesday West), pick the day, pick a crew lead.',
        narration: 'New Route. Name it. Pick the day. Pick a crew lead.',
        baseDur: 5000,
      },
      {
        icon: 'Plus',
        title: 'Add jobs',
        body: 'Drag jobs from the unassigned panel into the route. Map redraws on each drop with the new sweep.',
        narration: 'Drag jobs into the route. Map redraws with the new sweep.',
        baseDur: 5000,
      },
      {
        icon: 'Sparkles',
        title: 'Optimize and dispatch',
        body: 'Hit Optimize to reorder stops by drive time. Hit Save Route — the crew sees it on Field Scout with turn-by-turn.',
        narration: 'Optimize. Save. Crew sees the route on Field Scout with turn-by-turn for every stop.',
        baseDur: 5500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Multi-stop route planning on top of Jobs. A route record groups N jobs into a single dispatch unit with a crew lead, scheduled date, optimized stop order, and route geometry. Renders on a map and on the route_calendar.",

    howItWorks:
      "routes + route_stops tables. route_stops.position drives the order on the map. Optimize calls Google Distance Matrix API to compute pairwise drive times, then a nearest-neighbor reorder (TSP heuristic). Map render uses Google Maps JS API with DirectionsService for polyline + per-leg ETAs.",

    examples: [
      'PM builds Tuesday West: drag 4 jobs from unassigned, hit Optimize, save',
      'Crew opens Field Scout Tuesday — sees Route Tuesday West with 4 stops in order',
      'Calendar view shows Mon/Tue/Wed across all crews, color by lead',
    ],

    gotchas: [
      'Optimization needs a Google Maps API key with Directions + Distance Matrix enabled. Without it, the order stays as-dropped.',
      'Adding a job mid-day to an in-progress route requires a Save + re-dispatch. The crew\'s Field Scout will not auto-refresh.',
    ],

    faqs: [
      {
        q: 'Does optimization cost extra?',
        a: 'It uses your existing Google Maps API key — you pay Google for Distance Matrix calls. Roughly $5 per 1,000 stop pairs.',
      },
      {
        q: 'Can I drag a stop from one route to another?',
        a: 'Yes — drag between routes on the Routes page. Both routes recalculate their geometry.',
      },
    ],

    actions: {
      open: { route: '/routes', label: 'Open Routes' },
      calendar: { route: '/routes', label: 'Route Calendar', hint: 'Switch to calendar view' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
