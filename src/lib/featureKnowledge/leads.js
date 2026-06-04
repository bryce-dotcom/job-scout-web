// Knowledge Card — Leads
// Sourced from src/pages/Leads.jsx + src/lib/statusColors.js.
// When those pages change, this card needs to follow.

export default {
  id: 'leads',
  title: 'Leads',
  category: 'Sales & CRM',
  icon: 'UserPlus',
  route: '/leads',

  summary:
    "Every potential customer starts here. Grid of lead cards with name, business, phone, status pill, service type, and appointment chip. Filter by status, source, or owner. Group by City to organize territories. One-click Book Appointment flips the lead to Appointment Set. Convert to Customer when they're ready to buy.",

  replaces: ['HubSpot CRM', 'Pipedrive leads', 'spreadsheet lead lists', 'HousecallPro lead intake'],
  highlights: [
    'Status pipeline: New → Contacted → Appointment Set → Qualified → Won',
    'Group by City — collapses leads under collapsible city headers',
    'Appt button books straight to setter calendar',
    'Quote button navigates to /estimates/new pre-linked to the lead',
    'Board View button switches to /pipeline (kanban)',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'empty',    baseDur: 4500, narration: "Empty Leads page. UserPlus icon, no leads yet. Every potential customer — phone call, web form, Prospect Scout, or import — starts here. Click Add Lead." },
      { id: 'add',      baseDur: 7000, narration: 'Add Lead modal opens. Customer name is the only required field. Drop in business name, email, phone, address, service type, source, and the rep who owns it.' },
      { id: 'grid',     baseDur: 6000, narration: 'Leads land in a card grid. Status pill shows where they are — New in blue, Contacted in purple, Appointment Set in green. Filter by owner, status, or source at the top.' },
      { id: 'schedule', baseDur: 6500, narration: 'Click Appt on any card to open Schedule Appointment. Start time is pre-filled when dragged from the setter calendar. Save and the lead flips to Appointment Set.' },
      { id: 'city',     baseDur: 5500, narration: 'Toggle Group by City and leads collapse under collapsible city headers with a count. Click any header to expand. Route your team by territory.' },
    ],
  },

  setup: {
    overview:
      "Leads ships ready. There's nothing to configure before you can start capturing. The Add Lead form takes 30 seconds — only Name is required. Source and owner are optional but recommended for attribution.",
    introBaseDur: 1200,
    introNarration: "Almost no setup. Here's how to capture leads.",
    steps: [
      {
        icon: 'Plus',
        title: 'Click Add Lead',
        body: 'Top-right of the Leads page. Required: customer_name. Optional but recommended: business_name, email, phone, address, service_type, lead_source, lead_owner_id, setter_owner_id.',
        narration: 'Click Add Lead — name is the only required field. Everything else fills in as you learn the prospect.',
        baseDur: 5000,
      },
      {
        icon: 'Upload',
        title: 'Or bulk import',
        body: 'Import button opens the CSV importer. Maps to leadsFields schema. Re-runnable safely — existing leads are matched and updated rather than duplicated.',
        narration: 'Bulk import from CSV. Re-runnable without making duplicates.',
        baseDur: 5000,
      },
      {
        icon: 'User',
        title: 'Assign owner + setter',
        body: 'Lead Owner is the sales rep who owns the deal. Setter Owner is who the Lead Setter kanban shows the lead to for appointment-booking. Both can be set on the Add Lead modal.',
        narration: 'Set the owner so the rep can act on it, and the setter so it shows up on the Lead Setter board.',
        baseDur: 5500,
      },
      {
        icon: 'GitBranch',
        title: 'Convert when ready',
        body: 'When the customer signs or pays a deposit, open the lead and hit Convert to Customer. A customers row is created with all fields copied; the lead row stays with status=Won for attribution.',
        narration: 'When they sign, hit Convert. The customer record is created and the lead stays for attribution.',
        baseDur: 6500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The single intake for every potential customer. Grid of EntityCards (auto-fill, 320px min). Each card shows: name, business_name, status pill (leadStatusColors), phone, email, address, service_type chip, appointment_time chip (#d1fae5/#059669), and footer buttons — Edit · Appt · Quote. Search by name/business/email. Filters: owner (SearchableSelect), status (select), source (select). Group by City toggle (localStorage-persisted) parses city from address and shows collapsible headers.",

    howItWorks:
      "Reads from leads (RLS company_id-scoped). LEAD_STATUSES = ['New','Contacted','Appointment Set','Qualified','Quote Sent','Negotiation','Won','Lost']. STATUS_LABELS = {'Quote Sent': 'Estimate Sent'} — 'Quote Sent' shows as 'Estimate Sent' in the UI. Appt button → Schedule Appointment modal → inserts appointments row + updates lead (status='Appointment Set', appointment_time, appointment_id). Quote button → navigates to /estimates/new?lead_id=<id>. Board View button → /pipeline (same leads data, kanban view). Convert to Customer → creates customers row + sets lead.status='Won', converted_at, customer_id.",

    examples: [
      "Search 'northbridge' → matches customer_name and business_name → 1 result",
      "Status filter 'Appointment Set' → leads with green Appt Set pill + calendar date chip",
      "Group by City ON → Salt Lake City (3), Draper (1), Highland (1) — click header to expand",
    ],

    gotchas: [
      "'Quote Sent' status displays as 'Estimate Sent' in the UI (STATUS_LABELS alias) — the DB value is still 'Quote Sent'.",
      "Board View (top-right) navigates to /pipeline — same leads table, kanban layout by status.",
      "Converting a lead does NOT delete it — both rows exist after conversion. Lead stays for attribution.",
      "Group by City parses the address field heuristically. Addresses without a comma may not parse correctly.",
      "lead_source is a plain string (not a FK). Values come from the company's leadSources settings array.",
    ],

    faqs: [
      {
        q: "What's the difference between a lead and a customer?",
        a: "Leads are potential customers who haven't committed. Customers are confirmed — they've converted. The conversion is one-click (opens a confirm dialog). The lead row stays for attribution and pay-per-lead reporting.",
      },
      {
        q: "What does the Quote button do?",
        a: "Navigates to /estimates/new?lead_id=<id>. The estimate is pre-linked to the lead so conversion tracking flows through.",
      },
      {
        q: 'How do I see leads in a kanban instead of a grid?',
        a: "Click Board View (top-right) — navigates to /pipeline which shows the same leads in a drag-drop kanban by status.",
      },
    ],

    actions: {
      open: { route: '/leads',    label: 'Open Leads' },
      add:  { route: '/leads',    label: 'Add a lead', hint: 'Top-right + Add Lead' },
      board:{ route: '/pipeline', label: 'Switch to Board View' },
    },
  },

  lastVerified: '2026-06-04',
  freshUntil: 90,
}
