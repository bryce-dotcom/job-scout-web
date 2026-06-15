// Knowledge Card — Appointments
// Scheduled meetings with multi-salesperson support, outcome logging, and Google Calendar two-way sync.

export default {
  id: 'appointments',
  title: 'Appointments',
  category: 'Sales & CRM',
  icon: 'CalendarCheck',
  route: '/appointments',

  summary:
    'Every scheduled meeting — sales call, site visit, install kickoff — with multi-salesperson support, outcome logging, and Google Calendar two-way sync.',

  replaces: ['Calendly', 'Acuity Scheduling', 'Google Calendar manual booking'],
  highlights: [
    'Multi-salesperson support',
    'Google Calendar two-way sync',
    'Outcome tracking',
    'Lead-linked booking',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      {
        id: 'list',
        baseDur: 4500,
        narration: "Every appointment your team has, in one list. Customer, type, who\'s going, when — and the status at a glance.",
      },
      {
        id: 'detail',
        baseDur: 6500,
        narration: 'Open an appointment and the whole picture is there — address, salesperson, scheduled time, and a direct link to the lead it came from.',
      },
      {
        id: 'calendar',
        baseDur: 6500,
        narration: 'Month view shows every rep\'s appointments as color-coded dots. Spot conflicts, gaps, and heavy weeks before they become problems.',
      },
      {
        id: 'gcal',
        baseDur: 6500,
        narration: 'Connect Google Calendar once and it stays in sync automatically — create in JobScout, it appears in Google. Update in Google, it reflects here.',
      },
      {
        id: 'outcome',
        baseDur: 4500,
        narration: 'Outcomes tell the real story. Who\'s converting, who\'s no-showing, where the funnel leaks — all built from the outcome you log after each appointment.',
      },
    ],
  },

  setup: {
    overview:
      'Connect Google Calendar, enable your sales reps, configure appointment types, and log outcomes consistently to power conversion analytics.',
    introBaseDur: 1200,
    introNarration: 'Connect, configure, log. Appointments run themselves.',
    steps: [
      {
        icon: 'Calendar',
        title: 'Connect Google Calendar',
        body: 'Settings → Integrations → Google Calendar. OAuth one-time — appointments sync both ways automatically.',
        narration: 'One OAuth flow. Appointments sync both directions from that point on.',
        baseDur: 4500,
      },
      {
        icon: 'Users',
        title: 'Add your sales team',
        body: 'Employees → each rep → enable "Takes Appointments". They appear in the salesperson picker when booking.',
        narration: 'Enable each rep once. They show up in the salesperson picker from that moment forward.',
        baseDur: 5000,
      },
      {
        icon: 'Tag',
        title: 'Set appointment types',
        body: 'Settings → Appointment Types. Sales Call, Site Visit, Install Kickoff — set duration and default outcome options per type.',
        narration: 'Name your types, set their duration, and define which outcome options apply.',
        baseDur: 5000,
      },
      {
        icon: 'CheckSquare',
        title: 'Log outcomes consistently',
        body: 'After every appointment, set the outcome. Freddy reads them for conversion analytics. No outcome means gaps in your funnel data.',
        narration: 'Every appointment needs an outcome. That\'s the data Freddy uses to find your conversion leaks.',
        baseDur: 4500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      'The scheduling surface for all sales and field appointments. Every appointment is linked to a lead and assigned to a salesperson. Outcomes feed conversion analytics.',

    howItWorks:
      'appointments table: id, lead_id (FK leads), company_id, employee_id, appointment_type, scheduled_at, duration_minutes, outcome, notes, gcal_event_id. Calendar sync via Google Calendar OAuth credentials stored in the integrations table. Two-way sync: create in JobScout → write to gcal; update in gcal → webhook back to JobScout updates the row. Outcome options are settings-driven via the appointment_outcome_options key in the settings table.',

    examples: [
      'Book a Sales Call for lead #482 assigned to rep Cole → appointment row created, gcal_event_id populated within seconds',
      'Rep updates the Google Calendar event time → webhook fires → scheduled_at updated in appointments table',
      'Outcome set to Interested → Freddy picks it up for conversion funnel analytics',
    ],

    gotchas: [
      'gcal_event_id is null until the Google Calendar integration is connected — appointments still work, they just don\'t sync.',
      'Outcome options are settings-driven. If a type has no options configured, the outcome dropdown is empty. Check appointment_outcome_options in settings.',
      'Multi-salesperson appointments use salesperson_ids (array) on the lead. The employee_id on the appointment row is the primary assignee.',
      'Webhook delivery can lag — if gcal changes don\'t reflect immediately, check the integrations table for last_webhook_at.',
    ],

    faqs: [
      {
        q: 'Can multiple reps be assigned to one appointment?',
        a: 'The appointment row has a single employee_id (primary). Multi-rep coverage is tracked via salesperson_ids on the linked lead.',
      },
      {
        q: 'What outcome options are available?',
        a: 'Outcome options are settings-driven (appointment_outcome_options). Defaults: Interested, Not Interested, Needs Follow-up, Closed, No-show. Admins can customize per appointment type.',
      },
      {
        q: 'What happens to the Google Calendar event if I delete the appointment in JobScout?',
        a: 'The gcal event is deleted automatically via the Calendar API as part of the delete operation.',
      },
    ],

    actions: {
      open: { route: '/appointments', label: 'Open Appointments' },
      calendar: { route: '/calendar', label: 'Calendar view' },
    },
  },

  lastVerified: '2026-06-12',
  freshUntil: 90,
}
