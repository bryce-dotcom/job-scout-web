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
    "Lenard's document reader. Photograph a handwritten lighting takeoff form and Dougie transcribes it, structures it into areas and fixture lines matched to the price book, and learns your corrections so the next form reads better.",

  replaces: ['retyping takeoff forms', 'manual data entry from field sheets'],
  highlights: [
    'Handwritten takeoff form → structured audit',
    'Two-pass read: transcribe, then structure against the images',
    'Per-company correction loop',
    'Photo or PDF page in',
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
      "Dougie reads handwritten lighting takeoff forms for Lenard (dougie-analyze), called from the Lenard audit pages (LenardUTRMP, LenardAZSRP). He is not a general document reader and he does not do bids — that is Benny (benny-bid-intake).",

    howItWorks:
      "dougie-analyze Edge Function: up to 5 page images → PASS 1 raw transcription (Claude through _shared/anthropic.ts) → PASS 2 structuring into { header, areas[] } with the images alongside so handwriting can be cross-checked. Recent rows from dougie_corrections (per company) are replayed as few-shot examples. Returns header, areas and the raw transcription.",

    examples: [
      'Takeoff photo → Dougie: header (customer, site), 4 areas, 240 fixtures, T12/T8/HID types with heights and controls, matched to the price book',
      'Correction: warehouse count 49 → 4 fixed by the user → replayed as an example on the next read',
    ],

    gotchas: [
      "Image input only (JPEG/PNG page photos); a PDF has to be rasterised by the caller first.",
      "Corrections are keyed per company (LENARD_COMPANY_ID in the function today), so they help HHH; other tenants get no replayed examples yet.",
      "Not built: utility bills, receipts, W-9s, insurance certs, rebate forms, doc-type schemas, confidence scores — an earlier card claimed these; none exist.",
    ],

    actions: {
      open: { route: '/lighting-audits', label: 'Lighting audits' },
    },
  },

  lastVerified: '2026-09-26',
  freshUntil: 90,
}
