export default {
  id: 'bookings',
  title: 'Bookings',
  category: 'Sales & CRM',
  icon: 'CalendarDays',
  route: null,
  summary: 'Self-serve booking pages where leads pick a slot off your team\'s live availability — like Calendly but stitched directly into the lead pipeline.',
  replaces: ['Calendly', 'Acuity Scheduling', 'HubSpot Meetings'],
  highlights: [
    'Public booking page',
    'Real availability',
    'Auto-creates lead',
    'Team round-robin',
  ],
  marketing: {
    voice: 'Bill',
    scenes: [
      {
        id: 'page',
        baseDur: 4500,
        narration: 'Customers land on your branded booking page, pick a service type, choose a date, and grab an open slot — no back-and-forth emails required.',
      },
      {
        id: 'slots',
        baseDur: 6500,
        narration: 'On the admin side, each salesperson controls their own available hours. Green means open, gray means busy — and the booking page only ever shows real slots.',
      },
      {
        id: 'confirm',
        baseDur: 6500,
        narration: 'The customer fills in their info, hits Book, and instantly knows what happens next. Your rep gets a calendar invite; the lead gets a confirmation email automatically.',
      },
      {
        id: 'lead',
        baseDur: 4500,
        narration: 'The moment the booking is confirmed, a new lead appears in your pipeline — source set to Booking, rep assigned, appointment already attached. Zero manual entry.',
      },
    ],
  },
  setup: {
    overview: 'Enable your booking page in Settings, set each rep\'s availability, choose an assignment rule, and customize confirmation emails.',
    introBaseDur: 1200,
    introNarration: 'Getting Bookings live takes about five minutes.',
    steps: [
      {
        icon: 'Globe',
        title: 'Set up your booking page',
        body: 'Settings → Bookings → Enable. Customize heading, service types offered, and duration. Your page lives at yourdomain.jobscout.app/book.',
        narration: 'Flip the switch in Settings, pick your service types and appointment length, and your booking URL is live.',
        baseDur: 4500,
      },
      {
        icon: 'Clock',
        title: 'Set team availability',
        body: 'Bookings → Availability. Each salesperson sets their available hours and days. Bookings only show slots when someone is free.',
        narration: 'Each rep marks the hours they\'re open. The calendar only surfaces slots that are genuinely available — no double-books.',
        baseDur: 5000,
      },
      {
        icon: 'UserPlus',
        title: 'Choose assignment rules',
        body: 'Round-robin (rotate through available reps), ownership-based (existing customers to their rep), or manual. Settings → Bookings → Assignment.',
        narration: 'Decide how new bookings get claimed — rotate fairly across the team, route returning customers to their owner, or assign manually.',
        baseDur: 5000,
      },
      {
        icon: 'Mail',
        title: 'Configure confirmations',
        body: 'Settings → Bookings → Email Templates. Customize the confirmation email the lead receives and the internal notification your team gets.',
        narration: 'Tailor what the customer sees in their inbox and what your team gets notified with — both fire automatically on every confirmed booking.',
        baseDur: 4500,
      },
    ],
  },
  agentKnowledge: {
    whatItIs: 'Public-facing self-serve scheduling. Customers pick a real available slot; the system auto-creates a lead and appointment simultaneously.',
    howItWorks: 'bookings table (id, company_id, booking_page_id, customer_name, customer_email, customer_phone, service_type, requested_at, assigned_to, status) and booking_pages table (slug, settings JSON with availability, service_types, assignment_rule). On booking confirmed → auto-insert into leads (source=booking) and appointments rows in a single transaction. Assignment rule evaluated at booking time against current availability.',
    examples: [
      'Show me all bookings this week',
      'Which rep has the most bookings this month?',
      'List bookings with status no-show',
      'What service types are available on our booking page?',
    ],
    gotchas: [
      'A lead is not created until the booking is confirmed — pending bookings do not appear in the lead list',
      'Availability must be set per employee or no slots will show on the public page',
      'Assignment rule is evaluated at booking time; changing the rule does not reassign existing bookings',
      'The booking page slug is company-unique; changing it breaks any existing shared links',
    ],
    faqs: [
      {
        q: 'Can a customer book for an existing lead?',
        a: 'Yes — if a matching email exists in leads, the booking is attached to that lead rather than creating a duplicate.',
      },
      {
        q: 'What happens if no slots are available?',
        a: 'The booking page shows a "No availability" message for that date. The customer can try another date or contact you directly.',
      },
      {
        q: 'Can we have multiple booking pages?',
        a: 'Yes — each booking_pages row has its own slug and settings, so you can have separate pages for different service lines or territories.',
      },
    ],
    actions: {
      open: { route: '/settings/bookings', label: 'Booking Settings' },
    },
  },
  lastVerified: '2026-06-10',
  freshUntil: 90,
}
