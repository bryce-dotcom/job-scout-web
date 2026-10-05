// Knowledge Card — Dougie The Document Reader
// Lenard's handwritten-takeoff reader, with a per-company corrections loop.
// Bryce, 2026-09-26: Dougie lives inside Lenard and stays there; bid
// packages are Benny's job (benny.js). This card says only what Dougie does.

export default {
  id: 'dougie',
  title: 'Dougie The Document Reader',
  category: 'Operations',
  icon: 'FileSearch',
  route: '/lighting-audits',

  summary:
    "The document reader. Snap a receipt on the job and Dougie reads it into the books — merchant, total, date, category, tax line — costed to the job and matched to the bank charge. Photograph a handwritten lighting takeoff form and he transcribes it into the Lenard audit, learning your corrections.",

  replaces: ['typing up receipts', 'retyping takeoff forms', 'manual data entry from field sheets'],
  highlights: [
    'Receipt photo or PDF → costed expense on the job',
    'Category + tax line from your own list',
    'Handwritten takeoff form → structured audit',
    'Per-company correction loop on takeoffs',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'upload',   baseDur: 4500, narration: 'Photograph the takeoff sheet from the site walk. Handwriting, arrows, a coffee ring.' },
      { id: 'extract',  baseDur: 6500, narration: 'Dougie transcribes it, then structures it: areas, fixture types, counts, heights, controls — matched to your price book.' },
      { id: 'correct',  baseDur: 6500, narration: 'He read a 4 as a 9 in the warehouse. You fix it. Dougie records the correction.' },
      { id: 'learn',    baseDur: 6500, narration: 'Next sheet from the same crew — Dougie applies what he learned. He gets sharper every week.' },
      { id: 'use',      baseDur: 6000, narration: 'The audit is built. Lenard prices it, the estimate follows.' },
    ],
  },

  setup: {
    overview:
      "Dougie ships inside Lenard. On a lighting audit, choose the takeoff photos and let him read them; correct anything off and he remembers it for your company.",
    introBaseDur: 1200,
    introNarration: "Photograph the form. Correct what is off. He gets sharper.",
    steps: [
      { icon: 'Camera', title: 'Photograph the takeoff form', body: 'On a Lenard audit (RMP or SRP), add the photos of the handwritten takeoff sheet — up to five pages.', narration: 'Add the photos of the takeoff sheet.', baseDur: 4500 },
      { icon: 'Eye', title: 'Review what he read', body: 'Dougie returns the header and every area with its fixture lines. Check counts and fixture types against the sheet.', narration: 'Review the areas and counts.', baseDur: 5000 },
      { icon: 'GraduationCap', title: 'Correct + train', body: 'Fix anything off. Corrections post to dougie_corrections and are replayed as examples on the next read for your company.', narration: 'Correct what is off. Dougie remembers per company.', baseDur: 5500 },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Dougie reads two kinds of paper. Receipts: snapped in Field Scout on the job, on the job page, on the Expenses page, or attached to a bank row in Books (scan-receipt Edge Function in 'expense' mode, behind lib/receiptReader.js) — he returns merchant, total, date, what was bought, line items, and a category from the company's own list, and the expense lands on the job and in Books, where it is matched to the bank charge. Handwritten lighting takeoff forms for Lenard (dougie-analyze), from the Lenard audit pages. He is also the name on the paperclip in every AI chat box: a photo or PDF dropped there is read into that conversation. He does not do bids — that is Benny (benny-bid-intake).",

    howItWorks:
      "Receipts: scan-receipt (Claude vision, image or PDF, one file per call) with the company's category names passed in; the pick is one of them or null. receiptReader uploads first, then reads, then fills only the blanks on the form. expenseMatch.autoLinkReceipts links the receipt to its bank row when the match is exact. Takeoffs: dougie-analyze, up to 5 page images → PASS 1 raw transcription → PASS 2 structuring into { header, areas[] } with the images alongside so handwriting can be cross-checked; recent dougie_corrections rows (per company) are replayed as few-shot examples.",

    examples: [
      'Receipt photo on the job → Dougie: Lowes · $389.42 · 2026-09-12 · Job Materials (Line 2 - Cost of goods sold) → on the job\'s costing → Books links the Visa charge two days later',
      'Takeoff photo → Dougie: header (customer, site), 4 areas, 240 fixtures, T12/T8/HID types with heights and controls, matched to the price book',
      'Correction: warehouse count 49 → 4 fixed by the user → replayed as an example on the next takeoff read',
    ],

    gotchas: [
      "Takeoffs take page images only (JPEG/PNG); receipts take a photo or a PDF.",
      "Takeoff corrections are keyed per company (LENARD_COMPANY_ID in the function today), so they help HHH; other tenants get no replayed examples yet. Receipt reads have no correction loop.",
      "He does not read utility bills into Utility Invoices, W-9s or insurance certificates, and he does not fill rebate forms (Lenard fills the RMP application). There are no document-type schemas or confidence scores. Answer the question asked; do not recount what earlier cards claimed.",
    ],

    actions: {
      open: { route: '/lighting-audits', label: 'Lighting audits' },
    },
  },

  lastVerified: '2026-09-26',
  freshUntil: 90,
}
