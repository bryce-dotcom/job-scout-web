// Knowledge Card — Dougie The Document Reader
// OCR + structured field extraction + per-company learning loop.

export default {
  id: 'dougie',
  title: 'Dougie The Document Reader',
  category: 'Operations',
  icon: 'FileSearch',
  route: '/agents/dougie',

  summary:
    "AI document reader. Utility bills, receipts, audit forms, rebate applications — Dougie reads them, extracts the fields you care about, and learns your corrections so he gets sharper every week.",

  replaces: ['Veryfi', 'Mindee', 'manual data entry', 'rubber-stamped utility bill PDFs'],
  highlights: [
    'Structured field extraction',
    'Per-company learning loop',
    'Audit form pre-fill',
    'PDF + photo input',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'upload',   baseDur: 4500, narration: 'Drop a utility bill into Dougie. Twelve pages, dense, ugly.' },
      { id: 'extract',  baseDur: 6500, narration: 'Dougie reads it. Account number, billing period, kWh used, demand peak, current charges, last twelve months — all structured.' },
      { id: 'correct',  baseDur: 6500, narration: 'He got the demand wrong on page seven — service charge confused him. You fix it. Dougie records the correction.' },
      { id: 'learn',    baseDur: 6500, narration: 'Next bill from the same utility — Dougie applies the correction automatically. He gets smarter every week.' },
      { id: 'use',      baseDur: 6000, narration: 'Pre-fill rebate forms. Build energy baselines. Generate audit reports. The data flows everywhere.' },
    ],
  },

  setup: {
    overview:
      "Dougie ships ready. Drop documents into him from anywhere — Field Scout, Expenses, Lenard audits — and the structured fields land in the right table. Train him as you go.",
    introBaseDur: 1200,
    introNarration: "Drop documents in. Correct mistakes. He gets sharper.",
    steps: [
      {
        icon: 'Bot',
        title: 'Unlock Dougie',
        body: 'Settings → AI Agents → Dougie → Enable. He needs read on storage buckets + write on the extraction tables.',
        narration: 'Unlock Dougie in Settings, AI Agents.',
        baseDur: 4500,
      },
      {
        icon: 'FileUp',
        title: 'Upload a document',
        body: 'From any context that supports it (Expenses, Utility Invoices, Audit photos, Field Scout)— or directly via the Dougie page.',
        narration: 'Upload a document from anywhere — receipts, bills, forms.',
        baseDur: 5000,
      },
      {
        icon: 'Eye',
        title: 'Review extracted fields',
        body: 'Dougie returns structured JSON. Each field carries a confidence score. Below 90% flags for human review.',
        narration: 'Review the fields. Below ninety percent flags for review.',
        baseDur: 5000,
      },
      {
        icon: 'GraduationCap',
        title: 'Correct + train',
        body: 'Fix anything off. Corrections post to dougie_corrections — Dougie uses them as few-shot examples on the next pass. Per-company learning loop.',
        narration: 'Correct what is off. Dougie remembers per company.',
        baseDur: 5500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Universal document reader. Takes PDFs and photos, returns structured JSON via Gemini Vision. Domain-specific extractors for utility bills, receipts, audit forms, rebate applications, W-9s, insurance certs. Per-company corrections training loop.",

    howItWorks:
      "dougie-analyze Edge Function. PDF → page rasterize → Gemini Vision per page → schema-validated JSON. Schemas per doc-type (utility_bill, receipt, audit_form, w9, insurance_cert) in dougie_schemas table. Corrections written to dougie_corrections (per-company, per-doc-type, per-field) and replayed as few-shot examples in subsequent prompts. Confidence scores per field — Edge Function flags <90% to UI for review.",

    examples: [
      'Utility bill PDF → 12 pages → Dougie: account 408XXX, period May, kWh 24,180, demand 78kW, total $3,840',
      'Receipt photo → Dougie: vendor Lowes, total $228.61, tax $19.21, line items [...]',
      'Audit form PDF → Dougie: 4 areas, 240 fixtures, fixture types matched to catalog',
    ],

    gotchas: [
      'Multi-page PDFs cost more credits per call. Compress to single page or first-N pages if the data is concentrated.',
      'Low-light photos degrade OCR. Use the flash on receipts in dim shops.',
      'Corrections train per-company. A different company\'s corrections don\'t help yours.',
    ],

    faqs: [
      {
        q: 'Can Dougie handle handwritten notes?',
        a: 'For short handwritten content (signature line, scribbled phone number) — yes. For full handwritten letters or scribbles — patchy.',
      },
      {
        q: 'What if I disagree with all the extractions?',
        a: 'Flag the doc as "Schema mismatch" on the correction page. We review centrally to improve the schema for everyone.',
      },
    ],

    actions: {
      open: { route: '/agents/dougie', label: 'Open Dougie' },
      corrections: { route: '/agents/dougie/corrections', label: 'Correction queue' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
