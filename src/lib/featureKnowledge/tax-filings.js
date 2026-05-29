// Knowledge Card — Tax Engine & Filings
// Generates 941, 940, W-2, W-3, TC-941, 1099-NEC, 1096 PDFs.

export default {
  id: 'tax-filings',
  title: 'Tax Filings',
  category: 'Payroll, HR & Onboarding',
  icon: 'FileBadge',
  route: '/tax-filings',

  summary:
    'Generates 941, 940, W-2, W-3, TC-941, 1099-NEC, 1096 PDFs with snapshot data, filing status tracking, and amendment support — quarterly and year-end tax filings without the Gusto fee.',

  replaces: ['Gusto tax filings', 'ADP year-end', 'TaxBandits', 'Track1099'],
  highlights: [
    'Quarterly 941 + state',
    'Year-end W-2 + W-3 + 1099-NEC',
    'Amendment tracking',
    'PDF snapshots locked',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'quarter', baseDur: 4500, narration: 'Quarter ends. Job Scout assembles the 941 from your payroll runs automatically.' },
      { id: 'pdf',     baseDur: 6500, narration: 'PDF generated. Snapshot locks the numbers. You can print, mail, or file electronically via EFTPS.' },
      { id: 'state',   baseDur: 6500, narration: 'State filings — TC nine forty one for Utah, A-1 for Arizona — same flow per state you operate in.' },
      { id: 'year',    baseDur: 6500, narration: 'Year end. W-twos for every W-2 employee, ten ninety-nine NECs for every contractor, W-three and ten ninety-six rollups.' },
      { id: 'amend',   baseDur: 5500, narration: 'Need to amend a return? Original snapshot stays locked. Amendment generates with a delta and ties to the original.' },
    ],
  },

  setup: {
    overview:
      'Tax filings pull from payroll_runs. As long as your payroll is running and your tax registrations are set, filings generate themselves at quarter and year end.',
    introBaseDur: 1200,
    introNarration: 'Filings generate automatically. Make sure registrations are set.',
    steps: [
      {
        icon: 'Building2',
        title: 'Federal EIN + state IDs',
        body: 'Settings → Company → Tax IDs. Federal EIN, state withholding accounts, state unemployment IDs.',
        narration: 'Federal EIN. State withholding IDs. State unemployment.',
        baseDur: 5000,
      },
      {
        icon: 'MapPin',
        title: 'States you operate in',
        body: 'Add each state where you have employees. Drives which state forms generate per quarter.',
        narration: 'Add each state where you have employees.',
        baseDur: 4500,
      },
      {
        icon: 'Calendar',
        title: 'Deposit schedule',
        body: 'Federal: monthly or semiweekly depositor — depends on payroll size. Pick yours; the inbox surfaces deadlines.',
        narration: 'Set your federal deposit schedule. Inbox surfaces deadlines.',
        baseDur: 5000,
      },
      {
        icon: 'FileBadge',
        title: 'Quarterly review',
        body: 'End of each quarter, Filings → Q-941 → review the PDF → mark filed (or file via EFTPS link). Same for state forms.',
        narration: 'Quarter end: review the PDF. Mark filed or file via EFTPS.',
        baseDur: 5500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Tax form generation + filing tracking. Quarterly: 941 (federal), state withholding (TC-941, A-1, etc), FUTA 940. Year-end: W-2 per employee, W-3 rollup, 1099-NEC per contractor, 1096 rollup. Each form locks a snapshot of the source data and tracks filing status with amendment support.",

    howItWorks:
      "Backed by tax_filings table. Generation pulls payroll_run aggregates by quarter/year. PDF rendering via pdfme with form-specific templates. Snapshot data frozen at generation in tax_filings.snapshot_jsonb (so future payroll edits don't drift the filed return). Amendment workflow: amend_of_filing_id → new filing with delta computation. EFTPS integration for federal deposits (placeholder for v2).",

    examples: [
      'Q1 ends → 941 auto-generated → review → mark filed via EFTPS',
      'Year-end → 12 W-2s + 3 1099-NECs + W-3 + 1096 → mailed to employees, e-filed',
      'IRS sends notice on Q2 941 → amend → original locked, amendment carries delta',
    ],

    gotchas: [
      'Snapshot data is intentionally locked. Edits to payroll_run after filing don\'t change filed returns — file an amendment instead.',
      'EFTPS requires a PIN you set up with the IRS. Job Scout can\'t do that for you.',
      '1099-NEC threshold is $600/year per contractor. Below that, no form required (but Job Scout still tracks).',
    ],

    faqs: [
      {
        q: 'Do you e-file my taxes?',
        a: 'Generates the forms. E-filing is one click via EFTPS (federal) or state portal — Job Scout opens the right URL with the right data attached.',
      },
      {
        q: 'What about W-2 distribution?',
        a: 'Each employee gets a digital W-2 in My Pay. Paper copies print on demand and mail via PDF.',
      },
    ],

    actions: {
      open: { route: '/tax-filings', label: 'Open Tax Filings' },
      inbox: { route: '/payroll-inbox', label: 'Payroll Inbox' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
