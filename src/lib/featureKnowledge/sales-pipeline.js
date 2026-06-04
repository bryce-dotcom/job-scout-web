// Knowledge Card — Sales Pipeline
// Sourced from src/pages/SalesPipeline.jsx.
// When that page changes, this card needs to follow.

export default {
  id: 'sales-pipeline',
  title: 'Sales Pipeline',
  category: 'Sales & CRM',
  icon: 'GitBranch',
  route: '/pipeline',

  summary:
    "The kanban board for every lead from New → Won. Two collapsible tracks: Sales funnel (drag-drop stages from New to Won) and Delivery funnel (auto-synced from jobs). Stats strip shows Sales Won, Active, Won count, and Pipeline value with MTD/YTD/30d/90d/All date filter. Drag a card to advance stage; drop on Won to confirm and auto-create a job.",

  replaces: ['Salesforce Opportunities', 'HubSpot Deals', 'Pipedrive', 'ServiceTitan sales board'],
  highlights: [
    'Lead IS the deal — same row, no double entry',
    'Two-track: Sales funnel + Delivery funnel (auto-synced)',
    'Stats strip: Sales Won $ · Active · Won · Pipeline $ with date range',
    'Drop on Won → notes → job auto-created in Delivery',
    'Quote Sent stage shows individual estimate cards (not lead cards)',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'overview',  baseDur: 5500, narration: "The Sales Pipeline. Two collapsible tracks side by side. Sales on top, Delivery below. Stats strip across the header — Sales Won, Active leads, Win count, and Pipeline value. MTD is the default window." },
      { id: 'board',     baseDur: 7000, narration: "Open the Sales track and every stage gets a column. New, Contacted, Scheduled, Qualified, Estimate Sent, Negotiation, Won, Lost. Each column shows count, dollar value, and draggable lead cards." },
      { id: 'drag',      baseDur: 6500, narration: "Drag a card forward. The column lights up as the drop target. Drop it and the lead status updates immediately — no double entry, no separate deals table." },
      { id: 'won',       baseDur: 6500, narration: "Drag to Won. A confirm modal asks for notes. Save and the lead flips to Won — a Job record is auto-created in the Delivery Pipeline. Quote, job, and bonus all fire in one move." },
      { id: 'delivery',  baseDur: 6000, narration: "The Delivery Pipeline is auto-synced from jobs. Chillin, Job Scheduled, In Progress, Job Complete, Invoiced, Paid. Sales doesn't touch it — Operations moves cards through until the deal is closed." },
    ],
  },

  setup: {
    overview:
      "The pipeline ships ready. Every lead shows up automatically. The only optional setup is customizing stage names and which stats appear in the header strip.",
    introBaseDur: 1200,
    introNarration: "Almost no setup. Here's what to know.",
    steps: [
      {
        icon: 'Eye',
        title: 'Open Pipeline',
        body: 'Sales Flow → Pipeline (or click Board View from the Leads page). All leads with any status show immediately.',
        narration: 'Open Pipeline. All leads are already there.',
        baseDur: 4500,
      },
      {
        icon: 'Move',
        title: 'Drag cards to advance',
        body: 'Grab a card and drop it on the target stage column. The column highlights on hover. Won and Lost trigger confirm modals.',
        narration: 'Drag a card to advance the stage. Won and Lost ask for confirmation.',
        baseDur: 5500,
      },
      {
        icon: 'Filter',
        title: 'Filter by rep or date',
        body: 'All Owners dropdown scopes the board to one rep. Date range buttons (MTD/YTD/30d/90d/All) filter the Sales Won stat and Won column count.',
        narration: 'Use the owner filter to scope a rep\'s pipeline. MTD is the default date window.',
        baseDur: 5500,
      },
      {
        icon: 'Trophy',
        title: 'Mark Won — job auto-creates',
        body: 'Drop a lead on Won, add notes in the confirm modal. The lead converts and a Job row is immediately created in the Delivery Pipeline (status=Chillin). One drop does all three.',
        narration: 'Drop on Won, confirm with notes. Lead converts, job is created, bonus fires — one drop.',
        baseDur: 6000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Kanban view of the leads table. Desktop: two collapsible sections — Sales Pipeline (New/Contacted/Scheduled/Qualified/Estimate Sent/Negotiation/Won/Lost) and Delivery Pipeline (Chillin/Job Scheduled/In Progress/Job Complete/Invoiced/Paid/Closed). Both always show a stage-headers strip with count badge and $ total; cards only visible when expanded. Header: title + search + stats strip + date range toggle + owner filter + BU filter + List View (→ /leads) + Add Lead.",

    howItWorks:
      "Reads from leads table (company_id-scoped) plus joined jobs and quotes. Stage display names differ from DB values: 'Appointment Set' → 'Scheduled', 'Quote Sent' → 'Estimate Sent'. Pre-estimate stages (New/Contacted/Appointment Set/Qualified) show lead cards. Estimate stages (Quote Sent/Negotiation/Won) show one card per attached quote. Delivery stages show job rows. Drag-drop calls updateLead(status). Dropping on Won → confirm modal → updateLead(status='Won') + auto-create jobs row (status='Chillin'). Dropping on Lost → confirm modal → updateLead(status='Lost'). Stats: 'Sales Won' uses wonJobsInRange(jobs, cutoff) from jobMetrics.js — NOT lead.status=Won count.",

    examples: [
      "Setter books appointment → lead appears in Scheduled column (Appointment Set status)",
      "Rep sends estimate → lead moves to Estimate Sent, shows estimate card with $ amount",
      "Drag David Kim (Qualified, $24,500) to Estimate Sent → lead auto-advances",
      "Drop Jennifer Walsh EST-047 on Won → modal → job auto-created → appears in Delivery/Chillin",
    ],

    gotchas: [
      "There is NO Deals table. The Pipeline IS the leads table filtered by status.",
      "'Quote Sent' status displays as 'Estimate Sent' on the board (stage display name mapping).",
      "Sales Won stat in the header counts JOBS created in the date window (wonJobsInRange), not lead.status=Won.",
      "List View button (top-right) navigates to /leads — same data, grid layout.",
      "Delivery Pipeline is read-only from the pipeline — Operations moves cards from within the Jobs pages.",
      "Field techs are auto-scoped to their own pipeline (canViewAll=false); cannot see other reps' deals.",
    ],

    faqs: [
      {
        q: 'Can I add custom pipeline stages?',
        a: 'Yes — Settings icon (top-right, Super Admin only) opens Pipeline Settings where you can add, rename, reorder, and color stages. Won and Lost are system stages and cannot be deleted.',
      },
      {
        q: "Why does the Won column count differ from the 'Sales Won' stat?",
        a: "Sales Won counts jobs created in the selected date window (using jobMetrics.wonJobsInRange). The Won column count shows leads with status=Won. They'll differ if won jobs moved to the Delivery track before the filter window.",
      },
      {
        q: 'How do I see the pipeline for just one rep?',
        a: "Use the All Owners dropdown in the header. Field techs are automatically scoped to themselves and cannot see other reps' pipelines.",
      },
    ],

    actions: {
      open:  { route: '/pipeline', label: 'Open Pipeline' },
      leads: { route: '/leads',    label: 'Switch to List View' },
    },
  },

  lastVerified: '2026-06-04',
  freshUntil: 90,
}
