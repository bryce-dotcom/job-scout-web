// Knowledge Card — Dougie The Document Reader
// Bid packages → priced bids (2026-09-25), and Lenard's handwritten takeoff
// forms. Says only what is built; the previous card described a universal
// document reader with Gemini Vision and doc-type schemas that never existed.

export default {
  id: 'dougie',
  title: 'Dougie The Document Reader',
  category: 'Sales',
  icon: 'FileSearch',
  route: '/agents/dougie',

  summary:
    "AI document reader. Drop in the buyer's bid package and Dougie reads the schedule of items, matches each to your catalog (exact, an equivalent with his reasoning, or flagged to source), prices it, and builds the bid in the buyer's format. Anything he had to source lands redlined until someone verifies it with a link. He also reads handwritten lighting takeoff forms for Lenard.",

  replaces: ['retyping a bid schedule by hand', 'guessing which catalog item the spec means', 'manual data entry from takeoff forms'],
  highlights: [
    'Bid package → priced bid',
    'Exact / equivalent / must-source match',
    'Sourced prices redlined until verified',
    'Bid schedule in the buyer\'s format',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'upload',   baseDur: 4500, narration: 'Drop the invitation to bid into Dougie. Fourteen pages, a schedule of nine items, a due date on page two.' },
      { id: 'extract',  baseDur: 6500, narration: 'Dougie reads it. Item numbers, quantities, units, the spec text for every line — and the buyer\'s own sections, base bid and alternates.' },
      { id: 'correct',  baseDur: 6500, narration: 'He matches each item to your catalog: seven exact, one equivalent with his reasoning written on the line, one he had to source — redlined.' },
      { id: 'learn',    baseDur: 6500, narration: 'You paste the distributor link and mark it verified. The redline clears. Until then the bid cannot be sent — a bid binds you to its numbers.' },
      { id: 'use',      baseDur: 6000, narration: 'Send the bid: their format, their item numbers, a PDF for their portal and a page for their inbox.' },
    ],
  },

  setup: {
    overview:
      "Recruit Dougie under Settings → AI Agents and he appears under Estimates. Drop a bid package on his page (or on an empty bid) and the bid builds itself. Verify anything he sourced before it goes out.",
    introBaseDur: 1200,
    introNarration: "Drop the bid package in. Verify what he sourced. Send.",
    steps: [
      { icon: 'Bot', title: 'Recruit Dougie', body: 'Settings → AI Agents → Dougie → Recruit. He shows up under Estimates in the sidebar.', narration: 'Recruit Dougie in Settings, AI Agents.', baseDur: 4500 },
      { icon: 'FileUp', title: 'Drop in the bid package', body: 'On Dougie\'s page, pick the lead or customer and choose the PDF (or a photo of the bid form). Or open an empty bid and use the card there.', narration: 'Pick who it is for and choose the package.', baseDur: 5000 },
      { icon: 'Eye', title: 'Review the match', body: 'Each line says how it was matched. Exact and equivalent lines carry the catalog price; must-source lines carry Dougie\'s estimate, redlined.', narration: 'Review how each item was matched.', baseDur: 5000 },
      { icon: 'ShieldCheck', title: 'Verify what he sourced', body: 'Paste the source link on the line and mark it verified. A bid with an unverified sourced price cannot be sent; an estimate or proposal warns.', narration: 'Verify each sourced price with a link.', baseDur: 5500 },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Dougie reads documents into JobScout. Two jobs today: (1) bid packages — an invitation to bid, RFQ or bid form → a priced bid in the buyer's format, through the estimate-intake contract; (2) Lenard's handwritten lighting takeoff forms (dougie-analyze, called from the Lenard audit pages) with a per-company corrections loop.",

    howItWorks:
      "dougie-bid-intake Edge Function (Claude through _shared/anthropic.ts, metered). The browser uploads the package to the project-documents bucket; the function reads it in two passes: READ (buyer's format + schedule of items as JSON) and MATCH (each item against the tenant's own catalog candidates → exact | equivalent | must_source with justification). Matched lines take the CATALOG price; must-source lines take Dougie's market estimate as sourced_price with price_source='ai_sourced' and no price_verified_at — redlined. Writes go through _shared/estimateIntakeRest (header + lines or nothing). quotes.bid_intake holds the buyer's format; presentation_mode 'bid' renders lib/bidSchedule on the portal and lib/bidPdf for the buyer's portal. send-estimate refuses a bid with an unverified sourced price (409) and asks on an estimate/proposal (_shared/sourcedPricing.ts; lib/sourcedPricing.js is the browser twin).",

    examples: [
      'ITB 2026-114 PDF (14 pages) → Dougie: 9 items in Base Bid + Alternate 1, due Oct 14 2:00 PM, 7 exact catalog matches, 1 equivalent ("DLC-listed 150W high bay, different brand, same lumen output"), 1 must-source (pole base) at $412 estimated — redlined',
      'Verify: paste https://distributor.example/pole-base-24 on the line → Mark verified → redline clears → Send Bid enabled',
      'Handwritten takeoff photo → Dougie (via Lenard): 4 areas, 240 fixtures, types matched to the price book',
    ],

    gotchas: [
      "A must-source price comes from a web search (server-side web_search tool, up to 3 searches per item): Dougie brings back the supplier page he read it on and puts the link on the line. It is STILL redlined until a person opens that page and ticks verified — the rule is a human stands behind every sourced number. If the search finds nothing reliable, the line falls back to his market estimate with no link.",
      "He only fills an EMPTY estimate (mode 'fill'); a draft with lines already on it refuses, so nothing gets doubled. Make a new bid instead.",
      "Exact/equivalent lines take the catalog price even when the catalog price is 0 — a 0 there means the price book needs the number, not Dougie.",
      "The bid presentation mode is offered only when the document is a bid or the company produces bids (settings.document_types).",
      "Not built: reading bid packages that arrive as Excel/Word (PDF or images only); auto-submitting to a buyer's portal; the old 'universal document reader' with doc-type schemas.",
    ],

    actions: {
      open: { route: '/agents/dougie', label: 'Open Dougie' },
      estimates: { route: '/estimates', label: 'Bids and estimates' },
    },
  },

  lastVerified: '2026-09-25',
  freshUntil: 90,
}
