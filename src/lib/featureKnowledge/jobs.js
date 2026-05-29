// Knowledge Card — Jobs
// Every won estimate becomes a job with line items, photos, signatures,
// job-costing rollups, and an auto-close trigger when the invoice is paid.

export default {
  id: 'jobs',
  title: 'Jobs',
  category: 'Project & Job Management',
  icon: 'Briefcase',
  route: '/jobs',

  summary:
    'Every won estimate becomes a job with line items, photos, signatures, costing rollups, source-system traceability, and an auto-close trigger when the invoice is paid in full.',

  replaces: ['HousecallPro jobs', 'Jobber jobs', 'ServiceTitan jobs', 'spreadsheet job logs'],
  highlights: [
    'Auto-close on payment',
    'Job costing rollup (materials + labor + expenses)',
    'Lead → quote → job → invoice chain',
    'Photo + signature capture per job',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'won',      baseDur: 4500, narration: 'A quote just got signed. The lead becomes a job — automatically.' },
      { id: 'detail',   baseDur: 6500, narration: 'Every line item, every photo, every note from the quote carries over. Nothing gets re-typed.' },
      { id: 'costing',  baseDur: 6500, narration: 'Materials, labor, and expenses roll up live. You see the margin before the truck rolls.' },
      { id: 'complete', baseDur: 6000, narration: 'Tech marks the job complete with a signature on glass. The customer gets the invoice the same day.' },
      { id: 'close',    baseDur: 5500, narration: 'Customer pays the invoice. Job auto-closes. The lifecycle finishes itself.' },
    ],
  },

  setup: {
    overview:
      'Jobs are auto-created the moment an estimate is marked Won. There is almost no setup — you do not have to manage a separate jobs board. Just make sure your team marks quotes Won as soon as the customer signs.',
    introBaseDur: 1200,
    introNarration: 'Almost zero setup. Here is what you should know.',
    steps: [
      {
        icon: 'FileCheck',
        title: 'Win a quote',
        body: 'On the Estimates page, mark a signed quote as Won. The job appears in Jobs the same second.',
        narration: 'Mark a signed quote as Won on the Estimates page. The job appears instantly.',
        baseDur: 4500,
      },
      {
        icon: 'Briefcase',
        title: 'Open the job',
        body: 'The job carries every line item, photo, and note from the quote. Add field notes, photos, and section assignments.',
        narration: 'Open the job. Every line item, photo, and note carried over. Add field notes as the crew works.',
        baseDur: 5500,
      },
      {
        icon: 'Camera',
        title: 'Tech captures completion',
        body: 'In Field Scout, the tech taps Complete and signs on glass. Photos and signature time-stamp into the job record.',
        narration: 'Tech taps Complete in Field Scout, signs on glass. Photos and signature land in the job.',
        baseDur: 5500,
      },
      {
        icon: 'CircleDollarSign',
        title: 'Invoice and auto-close',
        body: 'Send the invoice from the job. When the customer pays in full, a trigger flips the job status to Closed.',
        narration: 'Send the invoice from the job. Customer pays, job auto-closes. Lifecycle done.',
        baseDur: 5500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The job is the work-in-progress record — created from a won quote and carrying it through completion, invoicing, and payment. Every job links back to a lead, a customer, and an estimate, with line items, photos, signatures, time entries, expenses, and a live cost-vs-margin rollup.",

    howItWorks:
      "Backed by the jobs table (company_id-scoped, RLS enforced). Created via a trigger when leads.status flips to Won. Inherits lines, photos, and notes from estimate_lines + estimate_photos. job_costing rolls up labor (time_log entries with job_id), materials (job_lines marked as material), and allocated expenses (expense_job_allocations). A second trigger auto-closes the job when invoices.paid_total >= invoices.total_amount.",

    examples: [
      'Estimate signed → trigger creates jobs row → job appears in /jobs',
      'Tech clocks in against job → labor cost rolls into job_costing',
      'Final payment lands → trigger flips status to Closed',
    ],

    gotchas: [
      'Marking a quote Won is required — Lost or Pending will not create a job.',
      'If you delete an estimate, the linked job stays — delete intentionally.',
      'Job cost rollups exclude unallocated expenses. Allocate via Books → Transactions for accurate margin.',
    ],

    faqs: [
      {
        q: 'Does the customer need to sign?',
        a: 'Only on completion (in Field Scout). The acceptance signature happens on the quote, not the job.',
      },
      {
        q: 'Can I create a job without a quote?',
        a: 'Yes — click New Job on the Jobs page. You lose the quote audit trail, but you can still capture lines, time, and invoices.',
      },
    ],

    actions: {
      open: { route: '/jobs', label: 'Open Jobs' },
      board: { route: '/job-board', label: 'PM Job Board', hint: 'Drag-to-schedule view' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
