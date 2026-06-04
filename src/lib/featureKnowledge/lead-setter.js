// Knowledge Card — Lead Setter
// The setter's daily workspace — split-pane kanban + week calendar
// with drag-drop appointment booking.
//
// Sourced from src/pages/LeadSetter.jsx — kept in lockstep with the
// real component. Updating the page means updating this card.

export default {
  id: 'lead-setter',
  title: 'Lead Setter',
  category: 'Sales & CRM',
  icon: 'Headphones',
  route: '/lead-setter',

  summary:
    "The setter's daily workspace. Left pane: a 4-column kanban (New, Contacted, Callback, Scheduled) with a stats strip on top. Right pane: a 7-day week calendar from 7am to 7pm with rep-color overlays. Drag a lead to a column to log the outcome, drag it to a calendar slot to book the appointment.",

  replaces: ['Calendly', 'Acuity Scheduling', 'Salesloft', 'spreadsheet call queues'],
  highlights: [
    'Split-pane kanban + calendar',
    'Per-rep color overlays + "Only mine" toggle',
    'Live commission strip ($/appt, pending, earned)',
    'Drag to schedule, drag to reschedule, drag to block out',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'board',    baseDur: 5500, narration: "Morning. The setter opens the Lead Setter page. Four stats strip — New, Contacted, Callback, Scheduled — and a kanban on the left, the week calendar on the right." },
      { id: 'contact',  baseDur: 6500, narration: 'Click a New lead. Phone, email, address, notes history — all there. Tap call, log the outcome, and the lead moves to Contacted with the attempts counter ticked up.' },
      { id: 'callback', baseDur: 7000, narration: "Customer says call back Thursday at two. Drag the lead to the Callback column — the contact modal opens to capture the date. The card lands with the orange callback chip ready to resurface." },
      { id: 'schedule', baseDur: 7000, narration: "Drag the lead onto Tuesday two pm on the calendar. The Schedule Appointment modal opens with the time pre-filled. Pick the rep, save. The chip lands in the calendar in the rep's color." },
      { id: 'commission', baseDur: 6000, narration: "Top of the page — the green commission strip. Setter pay per appointment, pending count, earned dollars. Updates the second the appointment is booked." },
    ],
  },

  setup: {
    overview:
      "Lead Setter ships on. There are exactly three things to configure: how much you pay per appointment, what triggers the bonus from pending to earned, and (admin only) who shows on the calendar overlay.",
    introBaseDur: 1200,
    introNarration: "Here's the three things you set up. Takes a minute.",
    steps: [
      {
        icon: 'DollarSign',
        title: 'Set per-appointment pay',
        body: 'Settings icon on the page → Setter pay per appointment. Default $25. Source pay per lead defaults to $0 — turn it on to pay a flat fee per lead from a specific source.',
        narration: 'Setter pay per appointment defaults to twenty-five dollars. The settings icon on the page is where you change it.',
        baseDur: 5500,
      },
      {
        icon: 'ClipboardCheck',
        title: 'Pick the qualification rule',
        body: "Same Settings modal — Commission requires quote toggle. ON = bonus moves from pending to earned only when a quote is created (the canonical rule field is setter_qualification_rule='quote_created'). OFF = bonus is earned as soon as the appointment is set.",
        narration: "Pick when the bonus moves from pending to earned. Quote created is the most common rule.",
        baseDur: 6500,
      },
      {
        icon: 'Users',
        title: 'Pick which reps show on the calendar',
        body: "Above the calendar grid — Show: pills for each salesperson. Click to toggle that rep's appointments onto the overlay. Per-user selections persist across navigations.",
        narration: 'Above the calendar — Show pills for each rep. Click to overlay their appointments.',
        baseDur: 5500,
      },
      {
        icon: 'Play',
        title: 'Work the board',
        body: "Daily loop: click leads in the kanban → log contacts → drag to Callback when they'll call back later → drag onto a calendar slot to book. The Find Prospects button (purple) opens AI prospect research when the New column runs dry.",
        narration: 'Daily loop — log contacts, drag callbacks, drop onto the calendar. Find Prospects fills the New column when it runs dry.',
        baseDur: 6500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The setter's daily workspace. Split-pane UI: left is a 4-column kanban (New, Contacted, Callback, Scheduled) plus a Qualified read-only stat. Right is a 7-day calendar with a 7am-7pm hour grid showing appointments and Block-Out-Time entries. Header carries a live commission strip and the AI Find Prospects button.",

    howItWorks:
      "Reads from leads + appointments + setter_commissions. Lead fetch: status IN ('New','Assigned','Contacted','Callback','Appointment Set'), excludes any lead with a linked lighting_audit (those belong on the sales pipeline). Drag-to-Scheduled-column or drag-to-calendar-slot opens the appointment modal which inserts an appointments row + updates the lead (status='Appointment Set', appointment_time, appointment_id, salesperson_id, lead_owner_id) + writes a lead_commissions row (commission_type='appointment_set'). Drag-to-Callback opens the contact modal so callback_date is captured atomically with the status flip. Setter qualification rule lives on companies.setter_qualification_rule.",

    examples: [
      "Drag a New lead onto Tuesday 2pm slot → appointment modal opens with start_time pre-filled → pick rep → save",
      "Drag a New lead to the Callback column → contact modal opens → enter Thursday 2pm → status=Callback + callback_date saved together",
      "Setter triages 12 New leads in the morning, books 4, callbacks 5, no-answer/contacted 3 — commission strip shows 4× pending",
    ],

    gotchas: [
      "The Scheduled column mirrors the visible calendar week. Navigate the calendar → column updates in lockstep.",
      "Leads with a linked lighting_audit don't appear here — they live on the sales pipeline view instead.",
      "The 'Only mine' toggle filters BOTH the calendar grid and the Scheduled kanban column to appointments where you're the salesperson or in salesperson_ids[].",
      "Pending commissions don't pay out. The bonus has to flip to Earned via the qualification rule before payroll picks it up.",
    ],

    faqs: [
      {
        q: "What if I drag a lead but the customer never picks up?",
        a: 'Open the lead instead — the Log This Contact form has a "No Answer" button. Stays in New (or Contacted if previously contacted) and ticks the attempt counter without changing the column.',
      },
      {
        q: "Why are there 4 stages instead of just New / Contacted?",
        a: "Callback and Scheduled used to be hidden — callbacks were bundled into Contacted, scheduled was just a top-strip stat. They're now first-class columns so a setter can see their whole day at a glance.",
      },
      {
        q: 'Where does the Find Prospects button come from?',
        a: 'Top right of the header (purple). Opens the ProspectResearchDrawer where Claude does live web research and returns ranked candidates the setter can import as leads.',
      },
    ],

    actions: {
      open: { route: '/lead-setter', label: 'Open Lead Setter' },
      settings: { route: '/lead-setter', label: 'Open settings', hint: 'Settings icon next to Find Prospects' },
    },
  },

  lastVerified: '2026-06-03',
  freshUntil: 90,
}
