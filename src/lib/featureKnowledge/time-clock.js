// Knowledge Card — Time Clock
// GPS-stamped punch in/out, lunch breaks, admin adjustments.

export default {
  id: 'time-clock',
  title: 'Time Clock',
  category: 'Payroll, HR & Onboarding',
  icon: 'Clock',
  route: '/time-clock',

  summary:
    'Web + mobile clock in/out with GPS lat/lng, address reverse-geocode, lunch breaks, and admin-side adjustments with audit trail. Job-linked clock so labor cost lands on the right job automatically.',

  replaces: ['ADP RUN', 'When I Work', 'TimeClock Plus', 'Buddy Punch', 'TSheets'],
  highlights: [
    'GPS on every punch',
    'Lunch breaks',
    'Adjustment audit',
    'Job-linked labor',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'in',       baseDur: 4500, narration: 'Tech taps Clock In. GPS stamps the punch with lat, long, and reverse-geocoded address.' },
      { id: 'work',     baseDur: 6500, narration: 'They pick the job — labor cost rolls into that job\'s costing in real time.' },
      { id: 'lunch',    baseDur: 6000, narration: 'Lunch break? Tap the timer. Auto-resumes when they punch back in.' },
      { id: 'out',      baseDur: 6500, narration: 'Clock out with another GPS stamp. Hours land in the time log. Admin sees everything.' },
      { id: 'adjust',   baseDur: 5500, narration: 'Forgot to punch out? Admin adjusts with a reason. Audit trail captures the before, after, and who.' },
    ],
  },

  setup: {
    overview:
      'Time Clock is on by default. The only thing to configure is which roles get the simple punch-in screen versus the admin time log.',
    introBaseDur: 1200,
    introNarration: 'Time Clock works out of the box. Almost no setup.',
    steps: [
      {
        icon: 'Settings',
        title: 'Confirm GPS permission',
        body: 'In the PWA, the tech grants location once. After that, every punch carries a lat/lng.',
        narration: 'Confirm GPS permission. One tap.',
        baseDur: 4500,
      },
      {
        icon: 'Briefcase',
        title: 'Job-link your jobs',
        body: 'Jobs show up automatically on the clock screen for any tech assigned to the section. They pick the job before punching in.',
        narration: 'Tech picks the job before punching in.',
        baseDur: 5000,
      },
      {
        icon: 'ShieldCheck',
        title: 'Turn on verification',
        body: 'Settings → Time Clock → require clock-out verification. Unverified clockouts hit the payroll inbox for admin review.',
        narration: 'Turn on clock-out verification. Unverified ones flag for admin.',
        baseDur: 5000,
      },
      {
        icon: 'List',
        title: 'Use the Time Log',
        body: 'Admin → Time Log shows every entry. Adjust with a reason — every change captured in the audit trail.',
        narration: 'Admin Time Log to adjust missed punches. Every edit audited.',
        baseDur: 5000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Web + mobile time clock with GPS-stamped punches, lunch break tracking, job linkage so labor cost rolls into job_costing, and admin-side adjustments with full audit trail.",

    howItWorks:
      "time_log table. Punch in/out write rows with lat, lng, address (reverse geocoded via Google Maps), job_id, job_section_id. Lunch break = paused state with break_start / break_end. Background location pings (configurable interval) write to gps_pings while clocked in. Admin adjustments write to time_log_adjustments (before, after, reason, admin_user_id). Clockout verification rule flags unverified entries to payroll_inbox_tasks.",

    examples: [
      'Cole clocks in 8:04am at 40.4276°N -111.7987°W → Northbridge address → JOB-2147',
      'Lunch 12:00-12:30 → 30 min auto-deducted',
      'Clocks out 4:52pm → 8.3h on JOB-2147 → labor cost $498 rolls into job_costing',
    ],

    gotchas: [
      'GPS spoofing is technically possible — Job Scout flags unrealistic location jumps for admin review.',
      'Background pings consume some battery. Default interval is 5 minutes; lower for higher confidence.',
      'Admin adjustments require a reason field. Auto-reject if reason is blank.',
    ],

    faqs: [
      {
        q: 'Can techs clock in from their browser?',
        a: 'Yes — the time clock works on any browser. GPS still captured (if permission granted).',
      },
      {
        q: 'What about overtime?',
        a: 'OT calculated at payroll run time per FLSA — 1.5x over 40h/week, or per state law where stricter.',
      },
    ],

    actions: {
      open: { route: '/time-clock', label: 'Open Time Clock' },
      log:  { route: '/time-log', label: 'Admin Time Log' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
