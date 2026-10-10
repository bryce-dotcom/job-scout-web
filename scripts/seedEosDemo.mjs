// The demo company's EOS page: a V/TO, a scorecard with owners and goals, this
// quarter's rocks, an issues list, to-dos, and an accountability chart.
//
// It lives here rather than inline in seed-demo.mjs because the live demo
// tenant can be topped up with exactly these rows without a full re-seed — a
// reset wipes a demo somebody may be in the middle of. One definition, two
// callers.
//
// Two things are deliberately imperfect, because they are what an L10 is FOR:
// one scorecard metric has nobody on it and no goal, and one rock is off track.
// A demo where everything is green demonstrates nothing.
const uid = (n) => `demo-eos-${n}`
const q = Math.ceil((new Date().getMonth() + 1) / 3)
const y = new Date().getFullYear()
const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString()
const day = (ahead) => new Date(Date.now() + ahead * 86400000).toISOString().slice(0, 10)

// ids: 133 Mike Sullivan (owner), 134 Sarah Chen (admin), 135 Carlos Rivera (lead)
export const eosDemo = (OWNER = 133, ADMIN = 134, CREW = 135) => ({
  eos_meeting_cadences: { l10_day: 'Tuesday', l10_time: '08:00', quarterly_next: '', annual_next: '', l10_agenda: [] },

  eos_core_values: [
    { value: 'Show up when we said', description: 'The window we gave is the window we hit.' },
    { value: 'Leave it better', description: 'Cleaner than we found it, every site.' },
    { value: 'Say the hard thing early', description: 'Bad news travels fast here.' },
    { value: 'Own the number', description: 'Everybody has one and everybody knows it.' },
  ],
  eos_core_focus: { purpose: 'Keep the lights on and the buildings running for the people who cannot afford a bad day.', niche: 'Commercial facilities maintenance and lighting retrofits.' },
  eos_ten_year_target: '$25M a year across four states, still owner-run.',
  eos_one_year_plan: { revenue: '4200000', profit: '520000', measurables: 'Four crews fully staffed; callbacks under 2%' },
  eos_three_year_picture: { revenue: '12000000', profit: '1500000', measurables: 'Two more branches; service contracts half of revenue' },

  // A scorecard with owners and goals, both directions, and one metric with
  // nobody on it — so the demo shows the gap the agenda names.
  eos_scorecard: [
    { id: uid('sc-1'), metric: 'Dollar Amount Sold', owner_id: String(ADMIN), goal: '45000', type: 'gte', source: 'sales_won', entity: '', current: '' },
    { id: uid('sc-2'), metric: 'Job Revenue', owner_id: String(OWNER), goal: '72000', type: 'gte', source: 'job_revenue', entity: '', current: '' },
    { id: uid('sc-3'), metric: 'Cash Collected', owner_id: String(ADMIN), goal: '60000', type: 'gte', source: 'cash_collected', entity: '', current: '' },
    { id: uid('sc-4'), metric: 'Jobs Completed', owner_id: String(CREW), goal: '18', type: 'gte', source: 'jobs_completed', entity: '', current: '' },
    { id: uid('sc-5'), metric: 'Callbacks', owner_id: String(CREW), goal: '2', type: 'lte', source: 'callbacks', entity: '', current: '' },
    { id: uid('sc-6'), metric: 'Meetings Set', owner_id: String(ADMIN), goal: '12', type: 'gte', source: 'meetings_created', entity: '', current: '' },
    { id: uid('sc-7'), metric: 'Dollars / Hour', owner_id: String(OWNER), goal: '145', type: 'gte', source: 'dollars_per_hour', entity: '', current: '' },
    { id: uid('sc-8'), metric: 'Open Estimates Aging', owner_id: '', goal: '', type: 'lte', source: 'manual', entity: '', current: '' },
  ],

  eos_rocks: [
    { id: uid('rk-1'), title: 'Hire and badge two service techs', owner_id: String(OWNER), quarter: q, year: y, status: 'on-track', due_date: day(40), business_unit: '', created_at: iso(30) },
    { id: uid('rk-2'), title: 'Get every crew onto the job board daily', owner_id: String(CREW), quarter: q, year: y, status: 'off-track', due_date: day(18), business_unit: '', created_at: iso(44) },
    { id: uid('rk-3'), title: 'Service agreements: 20 buildings under contract', owner_id: String(ADMIN), quarter: q, year: y, status: 'at-risk', due_date: day(25), business_unit: '', created_at: iso(44) },
    { id: uid('rk-4'), title: 'Price book rebuilt from the new supplier sheet', owner_id: String(ADMIN), quarter: q, year: y, status: 'done', due_date: day(-6), business_unit: '', created_at: iso(60) },
  ],

  eos_issues: [
    { id: uid('is-1'), title: 'Techs clocking in without picking a job', priority: 'high', type: 'short', resolved: false, created_at: iso(12), owner_ids: [String(CREW)] },
    { id: uid('is-2'), title: 'Two trucks out of PM at the same time', priority: 'high', type: 'short', resolved: false, created_at: iso(9), owner_ids: [] },
    { id: uid('is-3'), title: 'Supplier lead times on ballasts', priority: 'medium', type: 'long', resolved: false, created_at: iso(21), owner_ids: [String(ADMIN)] },
    { id: uid('is-4'), title: 'Nobody owns the aging estimates number', priority: 'medium', type: 'short', resolved: false, created_at: iso(5), owner_ids: [] },
    { id: uid('is-5'), title: 'Saturday call-out rate', priority: 'low', type: 'long', resolved: false, created_at: iso(33), owner_ids: [] },
    { id: uid('is-6'), title: 'Invoices going out three days late', priority: 'high', type: 'short', resolved: true, created_at: iso(48), resolved_at: iso(26), resolution: 'Sarah invoices every Thursday now.' },
  ],

  eos_todos: [
    { id: uid('td-1'), text: 'Write the one-page job board rule and pin it in the vans', owner_id: String(CREW), due_date: day(-4), done: false, created_at: iso(11), source_issue_id: uid('is-1') },
    { id: uid('td-2'), text: 'Get PM quotes for the two Fords', owner_id: String(OWNER), due_date: day(2), done: false, created_at: iso(8) },
    { id: uid('td-3'), text: 'Ask Graybar for a stocking agreement', owner_id: String(ADMIN), due_date: day(6), done: false, created_at: iso(3), source_issue_id: uid('is-3') },
    { id: uid('td-4'), text: 'Send the new rate sheet to the top 10 accounts', owner_id: String(ADMIN), due_date: day(-11), done: true, created_at: iso(25) },
  ],

  eos_accountability_chart: [
    { id: uid('ac-1'), seat: 'Visionary', person_id: String(OWNER), level: 0, gwc: { g: true, w: true, c: true }, roles: ['Vision and the big accounts', 'Culture', 'Hiring the leadership team'] },
    { id: uid('ac-2'), seat: 'Integrator', person_id: String(ADMIN), level: 1, gwc: { g: true, w: true, c: null }, roles: ['Runs the week', 'Scorecard and the L10', 'Money in and out'] },
    { id: uid('ac-3'), seat: 'Operations', person_id: String(CREW), level: 2, gwc: { g: true, w: null, c: true }, roles: ['Crews and the schedule', 'Quality and callbacks', 'Fleet'] },
  ],
})
