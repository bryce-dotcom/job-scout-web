// Knowledge Card — Employees
// Admin staff directory with pay rates, roles, calendar colors.

export default {
  id: 'employees',
  title: 'Employees',
  category: 'Payroll, HR & Onboarding',
  icon: 'Users',
  route: '/employees',

  summary:
    "The admin staff directory. Roster, roles, pay rates, calendar colors, commission overrides, certifications. Everything Payroll, Job Board, Field Scout, and the calendar pull employee data from.",

  replaces: ['BambooHR roster', 'Gusto employees', 'spreadsheet contact lists', 'manual pay-rate notes'],
  highlights: [
    'Roster + roles',
    'Per-employee pay + commission',
    'Calendar colors',
    'Certifications + expirations',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'list',      baseDur: 4500, narration: 'Eight employees on the roster. Lead techs, setters, sales, admin.' },
      { id: 'detail',    baseDur: 6500, narration: 'Open one. Role, hourly rate, commission, calendar color, hire date, allotted hours, certs.' },
      { id: 'pay',       baseDur: 6500, narration: 'Per-employee pay rates. Cole at thirty-eight an hour, Marcus at thirty-two. Drives the payroll engine.' },
      { id: 'certs',     baseDur: 6500, narration: "Certifications and expirations. Cole's electrical license expires in ninety days. Renewal task fires automatically." },
      { id: 'invite',    baseDur: 5500, narration: 'New hire? Send Onboarding Link. Magic SMS lands on their phone. Two clicks and they\'re in the system.' },
    ],
  },

  setup: {
    overview:
      "Set up your roster once. Most fields you set during onboarding; the directory is where admin manages role + pay + certifications going forward.",
    introBaseDur: 1200,
    introNarration: 'Set roster once. Maintenance is light.',
    steps: [
      {
        icon: 'UserPlus',
        title: 'Add the first employee',
        body: 'Employees → New. Name, role, email, phone. Or send Onboarding Link to have them self-serve W-4 + I-9 + deposit.',
        narration: 'Add employees or send onboarding link.',
        baseDur: 5000,
      },
      {
        icon: 'DollarSign',
        title: 'Set pay rates',
        body: 'Per employee: hourly rate, salary, commission overrides, allotted hours. Drives payroll and the job board.',
        narration: 'Set pay rates per employee.',
        baseDur: 5000,
      },
      {
        icon: 'Palette',
        title: 'Pick calendar colors',
        body: 'Per lead tech, pick a color. Their jobs render in that color on the Job Calendar and Lead Setter calendar.',
        narration: 'Pick a calendar color per lead tech.',
        baseDur: 4500,
      },
      {
        icon: 'BadgeCheck',
        title: 'Track certifications',
        body: 'Add electrical license, EPA cert, OSHA, etc. with expiration dates. Renewal tasks auto-fire 90 days out.',
        narration: 'Track certs and expirations.',
        baseDur: 5000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The admin-side staff directory. employees table is referenced by jobs.assigned_employees, time_log.employee_id, payroll_run_lines.employee_id, leads.salesperson_id, fleet_driver_assignments.driver_id — basically everywhere person-data lives.",

    howItWorks:
      "employees table (multi-tenant, company_id scoped). Roles per role enum (developer/super_admin/admin/manager/team_lead/user). Pay fields: hourly_rate, salary, commission_setter_rate, commission_rep_pct. Allotted hours drive Job Board math. Calendar color drives visual schedules. Certifications stored in employee_certifications with expires_at + auto-renewal-task trigger. Onboarding tokens in employee_onboarding_tokens for the new-hire magic-link flow.",

    examples: [
      'Roster: 4 lead techs, 2 setters, 1 sales rep, 1 admin = 8 employees',
      'Cole (lead tech) → $38/hr → 8h allotted/day → calendar color green',
      'Cert: Cole electrical license → expires 2026-08-31 → renewal task auto-fires June 1',
    ],

    gotchas: [
      'Deactivating an employee preserves their history (time logs, jobs, etc.) — they just stop appearing on dropdowns.',
      'Pay rate changes apply going-forward. Past payroll runs retain the rate active at the time.',
      'Per-employee commission overrides take precedence over company-wide rates.',
    ],

    faqs: [
      {
        q: 'How do I handle contractors / 1099s?',
        a: 'employees.classification = 1099. They show in the directory but skip W-2 payroll math and roll into 1099-NEC generation at year-end.',
      },
      {
        q: 'What about subcontractors who aren\'t on payroll?',
        a: 'Add them as employees with classification=1099 and no pay rate. They get jobs assigned but no time clock.',
      },
    ],

    actions: {
      open: { route: '/employees', label: 'Open Employees' },
      payroll: { route: '/payroll', label: 'Open Payroll' },
    },
  },

  lastVerified: '2026-06-03',
  freshUntil: 90,
}
