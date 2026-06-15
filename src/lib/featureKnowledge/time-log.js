export default {
  id: 'time-log',
  title: 'Time Log',
  category: 'Payroll, HR & Onboarding',
  icon: 'Clock',
  route: '/time-log',
  summary: 'Every clock-in and clock-out from every employee, linked to the job they worked on — with overtime auto-computed and manager edit access for corrections.',
  replaces: ['paper time cards', 'Excel time tracking', 'TSheets', 'When I Work time log'],
  highlights: [
    'All employee punches',
    'Job-linked time entries',
    'Edit and correct entries',
    'OT auto-computed',
  ],
  marketing: {
    voice: 'Bill',
    scenes: [
      {
        id: 'log',
        baseDur: 4500,
        narration: 'Every punch from every employee — this week, filtered by job, date, or person. Spot the missing clock-out before payroll does.',
      },
      {
        id: 'entry',
        baseDur: 6500,
        narration: 'Click any row to see the full entry: job linked, GPS location at punch, exact times, and a notes field for context.',
      },
      {
        id: 'correction',
        baseDur: 6500,
        narration: 'Manager corrections are one dialog away — log the reason, save, and the audit trail records exactly who changed what and when.',
      },
      {
        id: 'summary',
        baseDur: 4500,
        narration: 'Weekly employee summaries break hours down by job so you know exactly where the overtime came from before you cut payroll.',
      },
    ],
  },
  setup: {
    overview: 'Enable job-linked punches on mobile, verify web clock-in for office staff, then review the time log weekly before payroll closes.',
    introBaseDur: 1200,
    introNarration: 'Three steps to accurate, job-costed time tracking.',
    steps: [
      {
        icon: 'Smartphone',
        title: 'Field crews use mobile',
        body: 'Job Scout mobile → Clock In/Out. GPS is captured at each punch. The app prompts job selection at clock-in.',
        narration: 'Techs clock in from the field — GPS is captured automatically and the job is selected right at punch.',
        baseDur: 4500,
      },
      {
        icon: 'Monitor',
        title: 'Office staff use web',
        body: 'Any browser → Time Clock → Clock In. Or managers can manually enter time for employees without smartphones.',
        narration: 'Office staff clock in from any browser, and managers can enter time manually for anyone without a phone.',
        baseDur: 5000,
      },
      {
        icon: 'Link',
        title: 'Link every entry to a job',
        body: 'Settings → Time Clock → Require Job Selection: ON. Techs select the job at clock-in. This drives job costing — time is money.',
        narration: 'Turn on Require Job Selection in settings — every hour gets tied to a job, which feeds directly into your job costing.',
        baseDur: 5000,
      },
      {
        icon: 'CheckSquare',
        title: 'Review weekly before payroll',
        body: 'Time Log → This Week. Look for missing clock-outs and OT. Fix them before the payroll window closes.',
        narration: 'Before payroll closes, open This Week, check for amber missing-clock-out flags, and correct anything off.',
        baseDur: 4500,
      },
    ],
  },
  agentKnowledge: {
    whatItIs: 'The canonical time-tracking record. Every employee punch lives here, linked to a job. Powers payroll, job costing, and OT calculations. Manager-editable with full audit trail.',
    howItWorks: 'time_log table: id, employee_id, company_id, job_id (nullable), clock_in, clock_out, regular_hours, ot_hours, total_hours, lat_in, lng_in, lat_out, lng_out, notes, corrected_by, original_clock_out, correction_reason. OT computed: IF total_weekly_hours > 40 then ot_hours = total - 40. Daily OT: IF daily_hours > 8 (California rules, optional flag). Missing clock-out detected when clock_out IS NULL and date < today. Clock-out GPS is not required — some employees clock out from the office.',
    examples: [
      'Show me all time entries for Marcus Webb this week',
      'Which employees are missing clock-outs today?',
      'How many OT hours did we have last week?',
      'What jobs did Carlos punch into on Monday?',
    ],
    gotchas: [
      'clock_out can be NULL — always check before computing hours',
      'job_id is nullable; not all entries are job-linked (Admin, Drive time)',
      'OT is weekly-aggregate logic; daily OT rules must be opted in via settings',
      'GPS coordinates are captured at punch but are advisory — not used to block clock-in',
      'corrected_by stores the employee_id of the manager who made the edit, not a name',
    ],
    faqs: [
      {
        q: 'Can a manager edit someone else\'s time entry?',
        a: 'Yes. Any user with manager or admin role can open any entry and correct clock-in or clock-out times. The edit is logged with corrected_by, original_clock_out, and correction_reason.',
      },
      {
        q: 'What happens if an employee forgets to clock out?',
        a: 'The row will have clock_out IS NULL. It appears highlighted in amber in the Time Log view. A manager must manually set the clock-out time and select a correction reason before payroll can include that entry.',
      },
      {
        q: 'How is overtime calculated?',
        a: 'The system sums all hours for the employee in the current workweek. Once the running total exceeds 40 hours, remaining hours are flagged as ot_hours. California daily OT (>8h/day) is optional and enabled in settings.',
      },
      {
        q: 'Can employees clock in without selecting a job?',
        a: 'Only if Require Job Selection is OFF in Time Clock settings. When it is ON, the mobile app forces job selection at clock-in. Entries without a job_id are still valid but will not contribute to job costing.',
      },
    ],
    actions: {
      open: { route: '/time-log', label: 'Open Time Log' },
    },
  },
  lastVerified: '2026-06-11',
  freshUntil: 90,
}
