// Knowledge Card — Benny The Bid Builder
// The buyer's bid package in, a priced bid in their format out (2026-09-25;
// named Benny on 2026-09-26 — Bryce: Dougie stays inside Lenard as the
// takeoff reader, "so users know what he does").

export default {
  id: 'benny',
  title: 'Benny The Bid Builder',
  category: 'Sales',
  icon: 'ClipboardList',
  route: '/agents/benny',

  summary:
    "Drop in the buyer's invitation to bid and Benny reads the schedule of items, matches each to your catalog (exact, an equivalent with his reasoning, or flagged to source), prices what the catalog lacks from the web with the supplier page on the line, and builds the bid in the buyer's format. Sourced prices stay redlined until someone opens the page and marks them verified.",

  replaces: ['retyping a bid schedule by hand', 'guessing which catalog item the spec means', 'hunting supplier prices by hand'],
  highlights: [
    'Bid package → priced bid',
    'Exact / equivalent / must-source match',
    'Web-sourced prices with the supplier page on the line',
    'Bid schedule in the buyer\'s format',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'upload',   baseDur: 4500, narration: 'Drop the invitation to bid into Benny. Fourteen pages, a schedule of nine items, a due date on page two.' },
      { id: 'extract',  baseDur: 6500, narration: 'Benny reads it. Item numbers, quantities, units, the spec text for every line — and the buyer\'s own sections, base bid and alternates.' },
      { id: 'correct',  baseDur: 6500, narration: 'He matches each item to your catalog: seven exact, one equivalent with his reasoning written on the line, one he had to source — found on a supplier page, link on the line, redlined.' },
      { id: 'learn',    baseDur: 6500, narration: 'You open the page, the price holds up, you mark it verified. The redline clears. Until then the bid cannot be sent — a bid binds you to its numbers.' },
      { id: 'use',      baseDur: 6000, narration: 'Send the bid: their format, their item numbers, a PDF for their portal and a page for their inbox.' },
    ],
  },

  setup: {
    overview:
      "Recruit Benny under Settings → AI Agents and he appears under Estimates. Drop a bid package on his page (or on an empty bid) and the bid builds itself. Verify anything he sourced before it goes out.",
    introBaseDur: 1200,
    introNarration: "Drop the bid package in. Verify what he sourced. Send.",
    steps: [
      { icon: 'Bot', title: 'Recruit Benny', body: 'Settings → AI Agents → Benny → Recruit. He shows up under Estimates in the sidebar.', narration: 'Recruit Benny in Settings, AI Agents.', baseDur: 4500 },
      { icon: 'FileUp', title: 'Drop in the bid package', body: 'On Benny\'s page, pick the lead or customer and choose the PDF (or a photo of the bid form). Or open an empty bid and use the card there.', narration: 'Pick who it is for and choose the package.', baseDur: 5000 },
      { icon: 'Eye', title: 'Review the match', body: 'Each line says how it was matched. Exact and equivalent lines carry the catalog price; must-source lines carry a price Benny found on the web, redlined, with the page linked.', narration: 'Review how each item was matched.', baseDur: 5000 },
      { icon: 'ShieldCheck', title: 'Verify what he sourced', body: 'Open the page on the line and mark it verified. A bid with an unverified sourced price cannot be sent; an estimate or proposal warns.', narration: 'Verify each sourced price against its page.', baseDur: 5500 },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Benny turns a buyer's bid package (invitation to bid, RFQ, bid form — PDF or photos) into a priced bid in the buyer's format, through the estimate-intake contract. Not Dougie: Dougie reads handwritten lighting takeoff forms inside Lenard.",

    howItWorks:
      "benny-bid-intake Edge Function (Claude through _shared/anthropic.ts, metered as 'benny'). The browser uploads the package to the project-documents bucket; the function makes three passes: READ (buyer's format + schedule of items as JSON), MATCH (each item against the tenant's own catalog candidates → exact | equivalent | must_source with justification), and PRICE (server-side web_search for must-source items → a current supplier price and the exact page URL). The PRICE pass itself moved to _shared/bennySource.ts on 2026-09-29, because Arnie's quote rail needed the same hand for an estimate line the price book does not carry — one sourcing module, two callers, each metered under its own feature name; Arnie additionally asks it for the install HOURS and prices them off the tenant's labor_rates. Matched lines take the CATALOG price; sourced lines take the web price as sourced_price with price_source='ai_sourced', source_url set, and no price_verified_at — redlined. Writes go through _shared/estimateIntakeRest (header + lines or nothing). quotes.bid_intake holds the buyer's format; presentation_mode 'bid' renders lib/bidSchedule on the portal and lib/bidPdf for the buyer's portal. send-estimate refuses a bid with an unverified sourced price (409) and asks on an estimate/proposal (_shared/sourcedPricing.ts; lib/sourcedPricing.js is the browser twin).",

    examples: [
      'ITB 2026-114 PDF (3 pages) → Benny: 10 items in Base Bid + Alternate 1, due Oct 14 2:00 PM, 4 exact, 3 equivalent with reasoning, 3 must-source priced from Zoro / Pole Base / a labor-rate page — redlined with links',
      'Verify: open the Zoro page on the line → price holds → Mark verified → redline clears → Send Bid enabled',
      'An estimate (not a bid) with one sourced price → "1 price came from Benny and has not been verified… Send anyway?"',
    ],

    gotchas: [
      "A web-sourced price is a starting point, not a quote: the page can be a pricing guide rather than a cart price. That is why it stays redlined until a person opens the page and ticks verified — never auto-verified.",
      "He only fills an EMPTY estimate (mode 'fill'); a draft with lines already on it refuses, so nothing gets doubled. Make a new bid instead.",
      "Exact/equivalent lines take the catalog unit_price even when it is 0 — a 0 there means the price book needs the number, not Benny.",
      "The bid presentation mode is offered only when the document is a bid or the company produces bids (settings.document_types).",
      "Reads the fixture schedule and spec tables in plan sheets if they are in the package; does NOT yet count fixture symbols off drawings (a takeoff from plans).",
      "The packet (Phase 2, 2026-09-27): after the bid is written Benny reads the package's submission requirements into a checklist (bid_submissions.checklist; a bid or performance bond is never auto-ticked, only a bonding-capacity letter is). The Bid packet card on the bid drafts the cover letter (bid-packet-ai), renders the qualification statement, maps the buyer's fillable form fields (blanks left for a person; signatures, notarization and bonds are always human), pulls the certificates off the company, and merges one PDF (lib/pdfPackage). lib/bidPacket.submitReadiness lists every reason it may not go yet.",
      "Submitting (Phase 3, 2026-09-29): a Manager ticks the exact approval sentence (bid-submit refuses unless lib/bidPacket's readiness passes and the packet is built), then by the notice's method — email from bids@appsannex.com with the packet attached (over 40 MB: signed links), reply_to = the tenant's bid inbox, approver and signer in CC, delivery/bounce from the Resend webhook onto the submission (a bounce notifies at once); portal = upload the files and record the confirmation; mail = label sheet (lib/bidLabelPdf: envelope wording, ship-by two business days before) and record the tracking. Reminders 24 h / 4 h before due (api/cron/bid-reminders) until it is in. Outcome won/lost/no award with amounts closes the opportunity and teaches Sal's profile (by_outcome, by_buyer, spreads).",
      "Not built: auto-send without a click (Bryce's call), SAM.gov award matching, Excel/Word packages (PDF or images only), the daily nudge for a missing package.",
    ],

    actions: {
      open: { route: '/agents/benny', label: 'Open Benny' },
      estimates: { route: '/estimates', label: 'Bids and estimates' },
    },
  },

  lastVerified: '2026-09-29',
  freshUntil: 90,
}
