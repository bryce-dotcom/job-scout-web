// Knowledge Card — Utility Invoices
// Rebate tracking — Project Cost + Utility Owes drive material/labor/
// customer-portion calculations.

export default {
  id: 'utility-invoices',
  title: 'Utility Invoices',
  category: 'Lighting & Energy',
  icon: 'Zap',
  route: '/invoices?type=utility',

  summary:
    "Track every utility rebate from filing to paid. Project Cost + Utility Owes drive the materials / labor / customer-portion calc automatically. AR aging by program shows you which utilities are slow.",

  replaces: ['Snugg Pro rebate tracking', 'manual rebate spreadsheets', 'utility check follow-ups by phone'],
  highlights: [
    'Project Cost + Utility Owes math',
    '70/30 default split (configurable)',
    'AR aging by program',
    'Edge-case rebate types supported',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'empty',     baseDur: 4500, narration: 'Utility Invoices. Every rebate in flight — filed, pending, paid.' },
      { id: 'empty',     baseDur: 6500, narration: 'Open one. Project cost twenty-eight thousand four hundred. Utility owes fourteen thousand seven eighty.' },
      { id: 'empty',     baseDur: 6500, narration: 'The math splits the rebate. Materials seventy percent, labor thirty. Customer portion adjusts. Honest accounting.' },
      { id: 'empty',     baseDur: 6500, narration: 'AR aging by program. RMP pays in thirty. SRP drags ninety. You know where to push.' },
      { id: 'empty',     baseDur: 5500, narration: 'Rebate hits. Invoice flips to paid. General ledger entry posts. Job profitability re-computes.' },
    ],
  },

  setup: {
    overview:
      "Utility invoices are auto-generated from lighting audits — when you mark an audit Won and create the job, a draft utility invoice gets queued. You finish filing it manually with the utility, then mark it Filed in Job Scout to start the AR clock.",
    introBaseDur: 1200,
    introNarration: 'Auto-created from audits. You finish the filing, mark it Filed.',
    steps: [
      {
        icon: 'Lightbulb',
        title: 'Win a lighting audit',
        body: 'Standard flow: audit complete → proposal → customer signs. The job is created and a draft utility invoice queues with the rebate math.',
        narration: 'Win a lighting audit. Draft utility invoice queues automatically.',
        baseDur: 5000,
      },
      {
        icon: 'Sliders',
        title: 'Confirm the split',
        body: 'Default 70/30 materials/labor. Adjust per program if the utility weights it differently.',
        narration: 'Confirm the materials labor split. Default seventy thirty.',
        baseDur: 5000,
      },
      {
        icon: 'FileSignature',
        title: 'File with the utility',
        body: 'Submit the rebate form to RMP / SRP / APS / your utility. Dougie auto-fills the form from the audit. You confirm and submit.',
        narration: 'File the form with the utility. Dougie auto-fills it.',
        baseDur: 5500,
      },
      {
        icon: 'CircleDollarSign',
        title: 'Mark Filed → Paid',
        body: 'When you submit, mark the invoice Filed. AR clock starts. When the check hits, mark Paid. GL posts automatically.',
        narration: 'Mark Filed when submitted. Mark Paid when the check hits.',
        baseDur: 5000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The rebate-tracking variant of an invoice. Project Cost (total job cost) + Utility Owes (the rebate amount) drive automatic computation of: materials portion, labor portion, customer portion (project cost minus rebate). Status workflow: Draft → Filed → Paid → Closed.",

    howItWorks:
      "utility_invoices table (sibling to invoices, distinguished by invoice_type='utility'). project_cost and utility_owes are the inputs; materials_portion, labor_portion, customer_portion are computed via a trigger using utility_invoices.materials_split_pct (default 0.70). Status transitions write to utility_invoice_history. GL posting fires on Paid via the same trigger family as regular invoices but credits Rebate Income instead of Sales.",

    examples: [
      'JOB-2147 Northbridge → audit rebate $14,780 → utility invoice draft → filed with RMP June 1',
      'RMP pays in 32 days → mark Paid → GL writes Cash +14,780, Rebate Income +14,780',
      'AR aging: RMP avg 32d, SRP avg 87d → reschedule cash forecasting accordingly',
    ],

    gotchas: [
      'Project Cost should match the job\'s actual cost, not the proposal estimate. Drift here lies to job profitability.',
      'Customer portion = project_cost - utility_owes. If you over-quote the rebate, customer owes less than expected — invoice generation surfaces this before send.',
      'Some programs (RMP Custom) pay in installments. The system supports installment payments but you have to mark each one as it lands.',
    ],

    faqs: [
      {
        q: 'Does it auto-fill the utility PDF?',
        a: 'Yes — Dougie auto-fills based on the audit. You confirm and submit. Per-utility form templates live in utility_form_bindings.',
      },
      {
        q: 'What if the utility shorts me on the rebate?',
        a: 'Mark Paid with the actual amount. The variance posts to Rebate Variance Income (or Expense if smaller). GL stays honest.',
      },
    ],

    actions: {
      open: { route: '/invoices?type=utility', label: 'Open Utility Invoices' },
      audits: { route: '/lighting-audits', label: 'Lighting Audits' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
