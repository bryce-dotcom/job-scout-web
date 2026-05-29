// Knowledge Card — Sales Pipeline
// The kanban view of every lead from Appointment Set → Won.

export default {
  id: 'sales-pipeline',
  title: 'Sales Pipeline',
  category: 'Sales & CRM',
  icon: 'GitBranch',
  route: '/pipeline',

  summary:
    'A Kanban pipeline (Appointment Set → Qualified → Quoted → Won) that lives on the lead itself — no separate deals table, no double entry. Drag a card; the lead row updates.',

  replaces: ['Salesforce opportunities', 'HubSpot Deals', 'Pipedrive', 'ServiceTitan sales board'],
  highlights: [
    'Lead IS the deal — no double entry',
    'Stage-age tracking per card',
    'Drag-and-drop between stages',
    'Per-rep filter + revenue forecast',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'board',     baseDur: 5500, narration: 'Four stages — Appointment Set, Qualified, Quoted, Won. Every lead lives on this board.' },
      { id: 'drag',      baseDur: 6500, narration: 'Drag a card from Appointment Set to Qualified. The lead row updates; no double entry.' },
      { id: 'quoted',    baseDur: 6000, narration: 'When you send a quote, the card moves to Quoted automatically with the quote total on the front.' },
      { id: 'forecast',  baseDur: 6500, narration: 'Each column tallies its revenue forecast at the top so the owner sees the funnel in one glance.' },
      { id: 'won',       baseDur: 6000, narration: 'On Won, the lead converts to a customer, the quote becomes a job, and the bonus tracker stamps the close.' },
    ],
  },

  setup: {
    overview:
      'Sales Pipeline is automatic — every lead shows up on the board as soon as it has an appointment booked. You only need to configure the stage labels (rare) and the per-stage commission rules.',
    introBaseDur: 1200,
    introNarration: "There's almost no setup. Here's what to know.",
    steps: [
      {
        icon: 'Eye',
        title: 'Open Pipeline',
        body: "Sales Flow → Pipeline. Leads with an appointment booked show up automatically in the right column.",
        narration: 'Open Pipeline under Sales Flow. Leads with appointments appear automatically.',
        baseDur: 4500,
      },
      {
        icon: 'Move',
        title: 'Drag cards between stages',
        body: "Tap and drag to move a deal forward. Each move stamps the stage history so reports can show velocity.",
        narration: 'Drag a card forward as the deal progresses. The stage history writes itself.',
        baseDur: 5500,
      },
      {
        icon: 'Filter',
        title: 'Filter by rep',
        body: "Each sales rep sees their own deals by default. Owners can flip to All Reps to see the whole funnel.",
        narration: 'Each rep sees their own deals. Owners can switch to All Reps for the whole funnel.',
        baseDur: 5500,
      },
      {
        icon: 'Trophy',
        title: 'Mark Won when the deal closes',
        body: "Hit Won. The lead converts, the quote becomes a job, the bonus tracker fires. One click does all three.",
        narration: 'Hit Won when the deal closes. Convert, job, bonus — all three in one click.',
        baseDur: 6000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The Kanban-style view of the leads table filtered by sales stage. Lives on the same lead row that intake created — no separate deals/opportunities table. Stages: Appointment Set, Qualified, Quoted, Won, Lost.",

    howItWorks:
      "Reads from leads WHERE status IN (the stages). Drag-drop calls updateLead with status + stage_changed_at timestamp. Won converts the lead via leads.converted_customer_id + auto-creates a customer + flips any associated quote into a job. Per-stage revenue forecast aggregates the quote_total of leads in that column.",

    examples: [
      "Setter books an appointment → lead lands in Appointment Set",
      "Rep visits, qualifies → drag to Qualified",
      "Quote sent → auto-moves to Quoted with $ amount visible",
      "Customer signs → drag to Won → job + customer + bonus all fire",
    ],

    gotchas: [
      "There's no 'Deals' table. The Pipeline IS the leads table. Don't go looking for a separate deals report.",
      "Stage history is timestamped — Reports can show stage velocity per rep.",
      "Won is one-way — if a deal falls through, mark it Lost (don't drag back to Quoted).",
    ],

    faqs: [
      {
        q: 'Can I add custom stages?',
        a: 'In Settings → Pipeline Stages. The defaults work for most service businesses; add custom stages if you have a longer cycle.',
      },
    ],

    actions: {
      open: { route: '/pipeline', label: 'Open Pipeline' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
