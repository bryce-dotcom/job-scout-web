// Knowledge Card — Lead Setter
// The setter's daily workspace — kanban + calendar + appointment booking.

export default {
  id: 'lead-setter',
  title: 'Lead Setter',
  category: 'Sales & CRM',
  icon: 'Headphones',
  route: '/lead-setter',

  summary:
    "A dialer-style workspace where setters kanban through New / Contacted / Callback / Not Qualified leads and drag onto a calendar to book the rep, with setter commission paid per meeting that becomes a quote.",

  replaces: ['Calendly', 'Acuity Scheduling', 'Salesloft', 'Apollo Dialer'],
  highlights: [
    'Drag-to-schedule calendar',
    'Contact-attempt counter per lead',
    'Setter commission per booked meeting',
    'Today + this-week earnings visible',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'board',     baseDur: 5500, narration: "Four columns — New, Contacted, Callback, Qualified. The setter's whole day in one view." },
      { id: 'attempt',   baseDur: 6500, narration: 'Click a lead, log the contact attempt — phone, email, text — and the counter ticks up.' },
      { id: 'callback',  baseDur: 6500, narration: "Move the lead to Callback with a date, and it auto-resurfaces in the morning queue when it's time." },
      { id: 'schedule',  baseDur: 7000, narration: "Drag the lead onto the calendar to book the rep. The appointment lands in the rep's calendar with one motion." },
      { id: 'earnings',  baseDur: 6500, narration: 'Top of the page shows today\'s booked appointments and pending earnings. Setters know what they\'re worth in real time.' },
    ],
  },

  setup: {
    overview:
      "Lead Setter assigns one setter to one or more reps. Each booked appointment that converts to a quote earns the setter a commission. Configure the pay-per-appointment in Settings.",
    introBaseDur: 1200,
    introNarration: "Here's how to set up the workflow.",
    steps: [
      {
        icon: 'DollarSign',
        title: 'Set per-appointment pay',
        body: 'Settings → Payroll → setter_pay_per_appointment. Default $25. Only counts when the appointment becomes a quote.',
        narration: 'Set the per-appointment pay in Settings. Twenty-five dollars is a common starting point.',
        baseDur: 5500,
      },
      {
        icon: 'UserCheck',
        title: 'Assign setters to reps',
        body: 'Each setter sees the leads of the reps they\'re paired with. The owner can pair multiple setters to multiple reps.',
        narration: 'Pair each setter with the reps whose calendar they can book.',
        baseDur: 5500,
      },
      {
        icon: 'ClipboardList',
        title: 'Setter qualification rule',
        body: "Settings → setter_qualification_rule. \"quote_created\" means the bonus fires when a quote is generated. \"deposit_paid\" is a tighter trigger.",
        narration: "Choose the rule that fires the setter's bonus. Quote-created is the most common.",
        baseDur: 6500,
      },
      {
        icon: 'Phone',
        title: 'Setter logs in and works the board',
        body: "Daily flow: triage New → log Contact Attempts → schedule Callbacks → drag onto the calendar to book. Earnings update live.",
        narration: 'Setters log in and work the board. Earnings update in real time as they book.',
        baseDur: 6500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The setter's primary workspace. A two-pane UI: kanban on the left (New / Contacted / Callback / Qualified / Not Qualified columns) and a drag-target calendar on the right showing the assigned reps' availability. Setters drag a lead onto the calendar to book an appointment, which creates an appointments row tied to the lead and the rep.",

    howItWorks:
      "Reads from leads + appointments tables. Drag-drop calls supabase.from('appointments').insert + updates lead.status + lead.contact_attempts. Setter pay is tracked in payroll: appointments WHERE created_by = setter AND linked_quote_id IS NOT NULL × setter_pay_per_appointment. The Reactivate Customer button creates a new lead from a past customer for re-engagement campaigns.",

    examples: [
      'Morning triage: setter opens the board, sees 12 callbacks scheduled for today',
      "Phone call connects: setter logs attempt, drags lead to Contacted column",
      "Customer wants to meet Tuesday at 2pm: setter drags lead onto Tuesday 2pm slot on rep's calendar",
    ],

    gotchas: [
      "Callbacks reappear automatically on their scheduled date — no manual move needed.",
      "Setter only sees leads owned by reps they're paired with.",
      "Setter bonus is paid only AFTER the appointment becomes a quote (or whatever qualification rule is set).",
    ],

    faqs: [
      {
        q: "What's the difference between owner and setter?",
        a: 'The owner is the sales rep who visits the customer; the setter is the person who books the appointment. The setter earns a per-meeting commission; the owner earns the deal commission on close.',
      },
      {
        q: 'Can a setter book for multiple reps?',
        a: 'Yes. In Settings, pair the setter with as many reps as you like. They see all those reps\' calendars.',
      },
    ],

    actions: {
      open: { route: '/lead-setter', label: 'Open Lead Setter' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
