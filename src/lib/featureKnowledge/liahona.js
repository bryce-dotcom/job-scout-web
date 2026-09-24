// Knowledge Card — Liahona (the canvassing map)
// Sourced from src/components/liahona/* and src/pages/SalesPipeline.jsx.
// When the map changes, this card needs to follow.

export default {
  id: 'liahona',
  title: 'Liahona',
  category: 'Sales & CRM',
  icon: 'MapPin',
  route: '/pipeline',

  summary:
    "The canvassing map inside the Sales Pipeline (Board | Liahona toggle; List | Map on a phone). Every lead is a pin coloured by stage. Tap a pin for the lead card: call, move the stage, log the knock, set the appointment. Tap a house for the county record — owner of record, year built, size, value — and the neighbours around it. Draw territories, assign them, route the day's stops.",

  replaces: ['SalesRabbit', 'SPOTIO', 'Badger Maps', 'a paper turf map'],
  highlights: [
    'Pins by stage, territories, overlays (counties, cities, ZIPs, utilities, radar, reps)',
    'Lead card: stage chips, one-tap knock log, Set appointment, Directions',
    'County record on any house: owner of record, built, sq ft, value — free in 22 counties and states',
    'Cloverleaf: the neighbours around a finished job, add them all as leads or route them',
    'Finished jobs overlay: every job with an address, lead or not (imports included), cloverleaf from any of them',
    'Managers: By rep load, assign a territory\'s leads to its owner, hand-over on owner change',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'map',       baseDur: 6000, narration: "Open the Pipeline and flip Board to Liahona. Every lead is a pin, coloured by stage. Tap a stage chip to hide or show it. The map remembers where you left it." },
      { id: 'card',      baseDur: 7000, narration: "Tap a pin. The card shows who it is, tap to call, and every stage as a chip. Not home? Talked? One tap logs the knock and sets when to come back. The pin wears a badge for the rest of the day." },
      { id: 'house',     baseDur: 7000, narration: "In drop mode, tap any house. The county record comes back in a second: owner of record, year built, square feet, value. Add lead here, and the name and address are already filled in." },
      { id: 'clover',    baseDur: 7000, narration: "Cloverleaf. Tap a finished job and every neighbour within five hundred feet lists nearest first, owners included. Tick the ones worth a knock, add them as leads in one go, or route them from where you stand." },
      { id: 'territory', baseDur: 6500, narration: "Draw a territory, or click a county, city, ZIP or utility area and make it one. Give it a rep. Managers see the load per rep and hand a territory, leads and all, to someone else." },
    ],
  },

  setup: {
    overview:
      "Liahona ships on. Leads with an address are pinned automatically (new ones as they are saved, the rest by a background job every ten minutes). The only setup worth doing is territories, and only if you carve up turf.",
    introBaseDur: 1200,
    introNarration: "Almost no setup. Here's what to know.",
    steps: [
      {
        icon: 'MapPin',
        title: 'Flip the Pipeline to Liahona',
        body: 'Sales Flow → Pipeline → the Board | Liahona toggle in the section header. On a phone it is the List | Map toggle. Unpinned leads show a "Map N unpinned" button; tap it to geocode them now.',
        narration: 'Open the Pipeline and flip Board to Liahona. Unpinned leads get a button.',
        baseDur: 5500,
      },
      {
        icon: 'PenTool',
        title: 'Draw territories (optional)',
        body: 'Draw territory, tap the corners, Finish. Or turn on a boundary overlay (counties, cities, ZIPs, utilities) and click an area to make it a territory in one move. Name it, colour it, pick an owner and a utility.',
        narration: 'Draw a territory, or click a county or utility area and make it one.',
        baseDur: 6000,
      },
      {
        icon: 'Users',
        title: 'Assign the turf',
        body: 'Managers: the territory row shows "Assign N to <owner>"; the filtered-area card has a rep picker. Changing a territory\'s owner offers to hand its leads to the new rep.',
        narration: 'Assign a territory\'s leads to its owner in one tap. Hand-over comes with an owner change.',
        baseDur: 5500,
      },
      {
        icon: 'Clover',
        title: 'Work the day from the map',
        body: 'Tap a pin for the card. Log knocks, set appointments, plan the route from what is on screen. Tap Neighbors on a finished job to cloverleaf the street.',
        narration: 'Tap a pin, log the knock, set the appointment, plan the route.',
        baseDur: 5500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "A Leaflet map view of the leads table inside the Sales Pipeline page (salesView 'liahona' on desktop, mobileMap on a phone). Pins are leads with latitude/longitude, coloured by pipeline stage; won and in-delivery leads are green dots on the Customers overlay. Side panel (bottom sheet on a phone) holds the lead card, the drop-lead form, the neighbours list, the route, territories and the By rep summary.",

    howItWorks:
      "Coordinates: leads.latitude/longitude, filled on save (client geocode) and by the geocode-leads cron every 10 minutes (Census, then Nominatim); the DB clears them when the address changes. Pins: stage colour from the company's pipeline stages; same-spot pins fan out in a ring. Lead card: stage chips call the board's own stage mover (Won/Lost open the same dialogs); knock buttons insert lead_follow_ups rows (method 'visit', note 'Knocked: …') and set next_follow_up_at; Set appointment goes through lib/bookAppointment exactly like the Lead Setter (appointment, lead status Appointment Set, setter and lead-source commissions). Parcels: county detected from a Census point query; Utah via UGRC with Salt Lake and Utah County owner names merged in; 22 other county/state services in lib/parcelSources.js; elsewhere the parcel-lookup edge function calls Regrid (metered, cached, sandbox token expires 2026-10-16). Territories: sales_territories rows (GeoJSON polygon, owner, utility); point-in-polygon decides which leads are inside. Finished jobs: jobs.latitude/longitude, geocoded by the same cron (migration 20260924120000) and drawn on a canvas as teal (done) or blue (open) dots; tap one for Neighbors or Open job — this is how HousecallPro-era work with no lead reaches the map. Routes: greedy nearest-neighbour order from the phone's GPS, then Google Directions (optimised) or OSRM for road geometry, opened in Google Maps. Overlays: Census TIGERweb (counties, places, ZCTAs), HIFLD utility territories, RainViewer radar, employee last-known locations.",

    examples: [
      "Rep on a phone: List | Map → tap a pin → Not home → the pin gets a grey badge and the follow-up is due in 2 days",
      "Rep finishes a job: tap the pin → Neighbors → 27 parcels within 500 ft with owners → Add 27 as leads → they appear as New pins, source Cloverleaf",
      "Manager turns on Finished jobs: 6,000 dots of past cleaning and lighting work, lead or not → tap one → Neighbors → the street around a job done years ago",
      "Rep taps a house in drop mode in Holladay: 'Owner of record: Mikhail Sergachev · Built 1955 · 1,350 sq ft · $1.13M' → Add lead here",
      "Manager: territory Sandy East shows 'Assign 14 to Tyler' → one tap, the 14 unowned leads inside it are Tyler's",
      "Manager edits a territory's owner from Cole to Jordan → 'Also hand its 9 leads to Jordan' ticked → saved → 9 leads reassigned",
      "Owner asks Arnie 'who knocked the most today?' → the By rep panel on the map shows knocks today per rep",
    ],

    gotchas: [
      "Only leads with coordinates are pins. 'Map N unpinned' in the toolbar geocodes the rest; a lead whose address the geocoders cannot resolve stays off the map until someone pins it by hand (drag any pin to correct it).",
      "Owner names are free only where the county publishes them: Utah (Salt Lake and Utah County), and the 22 registry sources. Elsewhere the parcel comes from Regrid, whose current token is a sandbox covering only Marion County IN and expiring 2026-10-16 — the panel says so in plain words.",
      "The map inherits the Pipeline's owner, business-unit and date filters. A lead hidden by the board's date window is hidden on the map too.",
      "Territory filter 'My territories' shows nothing for a rep who owns none; the filter is ignored when the company has no territories at all.",
      "Booking from the lead card writes the setter commission to whoever is signed in, exactly like the Lead Setter — a rep booking their own appointment is recorded as its setter.",
      "On a phone the app's Arnie button and chat bubble float over the bottom-right of the sheet; scroll the sheet to reach what is under them.",
    ],

    faqs: [
      {
        q: 'Where is Liahona?',
        a: "Sales Flow → Pipeline. Desktop: the Board | Liahona toggle in the Sales Pipeline section header. Phone: the List | Map toggle next to the page title.",
      },
      {
        q: 'Why is a lead not on the map?',
        a: "It has no coordinates yet, or its status is hidden by a stage chip, or the Pipeline's owner/date filter excludes it. Tap 'Map N unpinned' to geocode the backlog; drag a pin to fix a wrong spot.",
      },
      {
        q: 'Does tapping a house cost anything?',
        a: "No, in Utah, Maricopa and Pima AZ, and the other registry sources — those county servers are free. Outside them the lookup is metered through the nationwide parcel plan and cached for 90 days.",
      },
      {
        q: 'Can I plan a route for the day?',
        a: "Plan route orders the open leads in view from where your phone is, draws the road route, and opens it in Google Maps (first 10 stops in the hand-off). Neighbors → Route does the same for a cloverleaf.",
      },
      {
        q: 'Who can assign leads to other reps?',
        a: "Anyone except field techs, the same rule as the board's owner filter. Reps can only take unowned leads for themselves.",
      },
    ],

    actions: {
      open: { route: '/pipeline', label: 'Open the Pipeline (flip to Liahona)' },
    },
  },

  lastVerified: '2026-09-24',
  freshUntil: 90,
}
