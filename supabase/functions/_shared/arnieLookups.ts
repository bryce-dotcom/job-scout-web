// Lookups for pages Arnie could not read (permission parity, Bryce 2026-10-27:
// "if the user has permissions or access to anything in jobscout then so
// should Arnie/Jenny"). Each tool reads what ONE page shows, with that page's
// filters, and is offered only to a person the page itself is offered to
// (appMap pageVisible). The lighting pages also need Lenard recruited, as the
// pages do. Look-up only: nothing here writes.
//
//   query_recurring_jobs      /recurring          repeating jobs + memberships
//   query_service_visits      /services/upcoming  warranty / annual / tune-up visits due
//   query_time_log            /time-log           hours logged against jobs
//   query_communications      /communications     calls, texts, emails to customers
//   query_lighting_audits     /lighting-audits    the audits themselves
//   query_utility_programs    /utility-programs + /utility-providers  rebate programs, rates, utilities
//   query_fixture_types       /fixture-types      the fixture catalogue

import type { Rest } from './arnieConfig.ts'
import { readRecordList, readAllRecords } from './arnieRest.ts'
import { pageVisible, whoFromEmployee, type Who } from './appMap.ts'
import { seriesOf, visitDay, FINISHED, CALLED_OFF } from './recurringSeries.ts'

const num = (v: unknown) => parseFloat(v as string) || 0
const money = (n: number) => Math.round(n * 100) / 100
const DAY = /^\d{4}-\d{2}-\d{2}$/
const dayOr = (v: unknown, fallback: string) => DAY.test(String(v || '')) ? String(v) : fallback
// A search term inside a PostgREST filter: no commas, brackets or wildcards.
const term = (v: unknown) => String(v || '').replace(/[,()*%\\"]/g, ' ').trim().slice(0, 60)
const ilike = (v: unknown) => encodeURIComponent(`*${term(v)}*`)
const clip = (s: unknown, n = 300) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n)}…` : t }
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

export interface LookupCtx { companyId: number; employeeId: number | null; level: number; email?: string | null; today: string }

const PAGE_OF: Record<string, string> = {
  query_recurring_jobs: '/recurring',
  query_service_visits: '/services/upcoming',
  query_time_log: '/time-log',
  query_communications: '/communications',
  query_lighting_audits: '/lighting-audits',
  query_utility_programs: '/utility-programs',
  query_fixture_types: '/fixture-types',
}
const NEEDS_LENARD = new Set(['query_lighting_audits', 'query_utility_programs', 'query_fixture_types'])
export const LOOKUP_NAMES = new Set(Object.keys(PAGE_OF))

export const LOOKUP_TOOLS = [
  {
    name: 'query_recurring_jobs',
    description: 'The Recurring Jobs page: jobs that repeat (weekly, monthly, quarterly, yearly) — one line per series with the customer, how often, the next visit and when the series ends; series that have STOPPED (every visit done, nothing booked next); and membership plans with who is on them. Use for "what recurring work do we have", "when is the Smith monthly next", "how many quarterly customers", "which recurring jobs are stuck". Read only.',
    input_schema: { type: 'object', properties: {
      customer: { type: 'string', description: 'Only series for a customer whose name contains this' },
      due_within_days: { type: 'integer', description: 'Only series whose next visit is within this many days (overdue included)' },
    } },
  },
  {
    name: 'query_service_visits',
    description: 'The Service Visits page: warranty, annual, tune-up, repair, upsell and callback visits that are DUE — customer, kind, due date, days until (negative = overdue), coverage, rep. Visits already done are left out. Use for "who is due for service this month", "what warranty visits are overdue". Read only.',
    input_schema: { type: 'object', properties: {
      within_days: { type: 'integer', description: 'Due within this many days from today; default 60. Overdue visits always come back too' },
      kind: { type: 'string', enum: ['annual', 'warranty', 'tune_up', 'repair', 'upsell', 'callback'] },
    } },
  },
  {
    name: 'query_time_log',
    description: 'The Time Log page: hours logged against jobs (category, clock in/out, notes), with totals by person and by job. This is the older hours log — clock-ins live in the time clock. Managers see everyone; anyone else sees only their own hours. Use for "how many hours went into the Intercon job", "what did Noah log last week". No pay rates. Read only.',
    input_schema: { type: 'object', properties: {
      from: { type: 'string', description: 'YYYY-MM-DD; default 30 days ago' },
      to: { type: 'string', description: 'YYYY-MM-DD; default today' },
      employee: { type: 'string', description: 'A person\'s name, as on the roster' },
      job: { type: 'string', description: 'A job number, or words from its title or customer' },
    } },
  },
  {
    name: 'query_communications',
    description: 'The Communications page: the log of texts, emails and calls to and from customers — when, what kind, which way, to whom, delivered or not, who sent it, and what it said. Use for "did anyone text the Kelleys", "what went out to Intercon this week", "did the invoice text deliver". Read only.',
    input_schema: { type: 'object', properties: {
      customer: { type: 'string', description: 'A customer whose name contains this' },
      type: { type: 'string', description: 'sms, email, call or note' },
      direction: { type: 'string', enum: ['in', 'out'] },
      from: { type: 'string', description: 'YYYY-MM-DD; default 30 days ago' },
      to: { type: 'string', description: 'YYYY-MM-DD; default today' },
    } },
  },
  {
    name: 'query_lighting_audits',
    description: 'The Lighting Audits page: each audit — customer, status, address, utility, fixtures counted, existing → proposed watts, estimated rebate, yearly savings, project cost and payback — with totals. Use for "what audits are still in draft", "how much rebate is in our audits", "find the audit for Step Saver". Read only.',
    input_schema: { type: 'object', properties: {
      customer: { type: 'string', description: 'Customer name, audit number, city or address words' },
      status: { type: 'string' },
      mine: { type: 'boolean', description: 'Only audits this person created' },
    } },
  },
  {
    name: 'query_utility_programs',
    description: 'The Utility Programs and Utility Providers pages: utilities (territory, rebate program, phone, which is the company default), their rebate programs (type, state, dates, caps, DLC and pre-approval rules), and each program\'s REBATE RATES — fixture category, measure, wattage band, rate and unit, caps. Use for "what does Rocky Mountain Power pay per fixture", "does SRP need pre-approval", "which utilities have programs in Arizona". Name a utility or state to get rates. Read only.',
    input_schema: { type: 'object', properties: {
      utility: { type: 'string', description: 'Utility or program name words, e.g. "Rocky Mountain"' },
      state: { type: 'string', description: 'Two-letter state, e.g. UT' },
      measure: { type: 'string', description: 'Only rates whose fixture category or measure contains this, e.g. "high bay"' },
    } },
  },
  {
    name: 'query_fixture_types',
    description: 'The Fixture Types page: the fixture catalogue audits count against — name, category, lamp type and count, system watts, the LED replacement watts. Use for "what LED replaces a 4-lamp T8", "what is a 400W metal halide in our catalogue". Read only.',
    input_schema: { type: 'object', properties: {
      search: { type: 'string', description: 'Words from the fixture name' },
      category: { type: 'string' },
    } },
  },
]

async function whoIs(r: Rest, employeeId: number | null): Promise<Who> {
  if (employeeId == null) return whoFromEmployee(null)
  const [e] = await readRecordList(r, `employees?select=role,user_role,is_developer,has_hr_access&id=eq.${employeeId}&limit=1`)
  return whoFromEmployee(e)
}

async function hasLenard(r: Rest, companyId: number): Promise<boolean> {
  const rows = await readRecordList(r, `company_agents?select=subscription_status,agent:agents(slug)&company_id=eq.${companyId}`)
  return rows.some((x: any) => x?.agent?.slug === 'lenard-lighting' && x?.subscription_status === 'active')
}

/** Runs one of these lookups for this person, after the page's own gate. */
export async function runLookup(r: Rest, name: string, input: any, ctx: LookupCtx): Promise<any> {
  const route = PAGE_OF[name]
  if (!route) return { error: `Unknown lookup ${name}` }
  if (!pageVisible(route, await whoIs(r, ctx.employeeId))) return { restricted: `That page (${route}) is not open to this person, so neither is the lookup.` }
  if (NEEDS_LENARD.has(name) && !(await hasLenard(r, ctx.companyId))) return { restricted: 'The lighting pages come with Lenard, and this company has not recruited him.' }
  const co = `company_id=eq.${ctx.companyId}`
  const coOrGlobal = `or=(company_id.eq.${ctx.companyId},company_id.is.null)`
  switch (name) {
    case 'query_recurring_jobs': return recurringJobs(r, co, input, ctx)
    case 'query_service_visits': return serviceVisits(r, co, input, ctx)
    case 'query_time_log': return timeLog(r, co, input, ctx)
    case 'query_communications': return communications(r, co, input, ctx)
    case 'query_lighting_audits': return lightingAudits(r, co, input, ctx)
    case 'query_utility_programs': return utilityPrograms(r, co, coOrGlobal, input, ctx)
    case 'query_fixture_types': return fixtureTypes(r, co, input)
  }
}

// ── /recurring ──────────────────────────────────────────────────────────
// The page's own rules (RecurringJobs.jsx): one line per series, keyed on
// recurrence_parent_id || id, the open occurrence preferred; finished series
// hidden; the next visit is start_date, else service_due_date.
const FREQ: Record<string, string> = { Daily: 'daily', Weekly: 'weekly', 'Bi-Weekly': 'every 2 weeks', 'Every 6 Weeks': 'every 6 weeks', Monthly: 'monthly', 'Bi-Monthly': 'every 2 months', Quarterly: 'quarterly', 'Bi-Annually': 'every 6 months', Annually: 'yearly' }

async function recurringJobs(r: Rest, co: string, input: any, ctx: LookupCtx) {
  const [jobs, plans, members] = await Promise.all([
    readAllRecords(r, `jobs?${co}&recurrence=not.is.null&recurrence=neq.None&status=neq.Archived&select=id,job_id,job_title,status,recurrence,recurrence_end_date,recurrence_parent_id,start_date,service_due_date,customer_id,customer_name,business_name&order=start_date.asc`, 2000),
    readRecordList(r, `membership_plans?${co}&select=*`),
    readRecordList(r, `customer_memberships?${co}&select=*,customer:customers!customer_id(name,business_name)`),
  ])
  const { open, stalled: stopped } = seriesOf(jobs, ctx.today)
  const line = (j: any) => ({
    job: j.job_id || `#${j.id}`, job_id: j.id, customer: j.business_name || j.customer_name || null, title: j.job_title,
    how_often: FREQ[j.recurrence] || j.recurrence, ends: j.recurrence_end_date || 'no end date',
  })
  let series = open.map((j: any) => ({ ...line(j), next_visit: visitDay(j), status: j.status }))
  let stalled = stopped.map((j: any) => ({ ...line(j), last_visit: visitDay(j), last_status: j.status }))
  if (input?.customer) {
    const t = term(input.customer).toLowerCase()
    const has = (s: any) => String(s.customer || '').toLowerCase().includes(t)
    series = series.filter(has); stalled = stalled.filter(has)
  }
  if (Number.isFinite(Number(input?.due_within_days)) && input?.due_within_days != null) {
    const until = addDays(ctx.today, Math.max(0, Math.round(Number(input.due_within_days))))
    series = series.filter((s) => s.next_visit && s.next_visit <= until)
  }
  series.sort((a, b) => String(a.next_visit || '9999').localeCompare(String(b.next_visit || '9999')))
  const byFreq: Record<string, number> = {}
  for (const s of series) byFreq[s.how_often] = (byFreq[s.how_often] || 0) + 1
  return {
    series: series.length, by_how_often: byFreq, list: series.slice(0, 60),
    overdue: series.filter((s) => s.next_visit && s.next_visit < ctx.today).length,
    stalled: stalled.length ? { count: stalled.length, list: stalled.slice(0, 60), means: 'Every visit in these series is finished and nothing is booked next, so the series has stopped. Booking the next visit (or setting an end date if the customer stopped) restarts or closes it.' } : 'none',
    memberships: plans.length ? {
      plans: plans.map((p: any) => ({ name: p.name || p.plan_name, price: p.price ?? p.amount ?? null, every: p.interval || p.billing_interval || null, active: p.active ?? null })),
      members: members.length,
      list: members.slice(0, 40).map((m: any) => ({ customer: m.customer?.business_name || m.customer?.name || null, status: m.status || null, plan_id: m.plan_id ?? m.membership_plan_id ?? null, started: m.start_date || m.created_at?.slice?.(0, 10) || null })),
    } : 'No membership plans set up.',
    scope: `One line per series. next_visit is the earliest visit not yet done (${FINISHED.join('/')} count as done; ${CALLED_OFF.join('/')} as called off) — a past next_visit is overdue or was done and never marked. The next visit is created when the current one is marked done.`,
  }
}

// ── /services/upcoming ──────────────────────────────────────────────────
const VISIT_DONE = ['Completed', 'Verified Complete', 'Paid', 'Closed', 'Archived']

async function serviceVisits(r: Rest, co: string, input: any, ctx: LookupCtx) {
  const rows = await readAllRecords(r, `jobs?${co}&service_due_date=not.is.null&select=id,job_id,job_title,status,service_kind,service_due_date,parts_coverage,labor_coverage,parent_job_id,customer_name,business_name,salesperson&order=service_due_date.asc`, 2000)
  const within = Number.isFinite(Number(input?.within_days)) && input?.within_days != null ? Math.max(0, Math.round(Number(input.within_days))) : 60
  const until = addDays(ctx.today, within)
  const t0 = Date.parse(`${ctx.today}T00:00:00Z`)
  const due = rows
    .filter((s: any) => !VISIT_DONE.includes(s.status) && (!input?.kind || s.service_kind === input.kind))
    .map((s: any) => {
      const d = String(s.service_due_date).slice(0, 10)
      return { job: s.job_id || `#${s.id}`, job_id: s.id, customer: s.business_name || s.customer_name || null, title: s.job_title, kind: s.service_kind || null, due: d, days_until: Math.floor((Date.parse(`${d}T00:00:00Z`) - t0) / 86400000), status: s.status, parts_coverage: s.parts_coverage || null, labor_coverage: s.labor_coverage || null, rep: s.salesperson || null, from_job: s.parent_job_id || null }
    })
    .filter((s: any) => s.due <= until)
  const overdue = due.filter((s: any) => s.days_until < 0)
  const byKind: Record<string, number> = {}
  for (const s of due) byKind[s.kind || 'unspecified'] = (byKind[s.kind || 'unspecified'] || 0) + 1
  return {
    due_within_days: within, count: due.length, overdue: overdue.length, by_kind: byKind, list: due.slice(0, 60),
    later: rows.filter((s: any) => !VISIT_DONE.includes(s.status) && String(s.service_due_date).slice(0, 10) > until).length,
    scope: `Visits not yet done, due on or before ${until} (overdue included). "later" counts the ones due after that.`,
  }
}

// ── /time-log ───────────────────────────────────────────────────────────
async function timeLog(r: Rest, co: string, input: any, ctx: LookupCtx) {
  const to = dayOr(input?.to, ctx.today)
  const from = dayOr(input?.from, addDays(to, -30))
  let who = ''
  let people: any[] = []
  if (ctx.level < 2) {
    if (ctx.employeeId == null) return { error: 'There is no employee record on this sign-in.' }
    who = `&employee_id=eq.${ctx.employeeId}`
  } else if (input?.employee) {
    people = await readRecordList(r, `employees?${co}&select=id,name&name=ilike.${ilike(input.employee)}&limit=10`)
    if (!people.length) return { count: 0, note: `No one on the roster matches "${term(input.employee)}".` }
    if (people.length > 1) return { ambiguous: people.map((p: any) => p.name), note: 'More than one person matches — ask which one.' }
    who = `&employee_id=eq.${people[0].id}`
  }
  let jobIds: number[] | null = null
  if (input?.job) {
    const t = term(input.job)
    const jobs = /^\d+$/.test(t)
      ? await readRecordList(r, `jobs?${co}&select=id&or=(id.eq.${t},job_id.ilike.*${t}*)&limit=20`)
      : await readRecordList(r, `jobs?${co}&select=id&or=(job_title.ilike.${ilike(t)},customer_name.ilike.${ilike(t)},business_name.ilike.${ilike(t)})&limit=50`)
    if (!jobs.length) return { count: 0, note: `No job matches "${t}".` }
    jobIds = jobs.map((j: any) => j.id)
  }
  const rows = await readAllRecords(r, `time_log?${co}${who}${jobIds ? `&job_id=in.(${jobIds.join(',')})` : ''}&date=gte.${from}&date=lte.${to}&select=date,employee_id,job_id,category,hours,clock_in_time,clock_out_time,is_clocked_in,notes&order=date.desc`, 5000)
  const empIds = [...new Set(rows.map((x: any) => x.employee_id).filter(Boolean))]
  const jIds = [...new Set(rows.map((x: any) => x.job_id).filter(Boolean))]
  const [emps, jobs] = await Promise.all([
    empIds.length ? readRecordList(r, `employees?${co}&select=id,name&id=in.(${empIds.join(',')})`) : [],
    jIds.length ? readRecordList(r, `jobs?${co}&select=id,job_id,job_title,customer_name,business_name&id=in.(${jIds.join(',')})`) : [],
  ])
  const nameOf = Object.fromEntries(emps.map((e: any) => [e.id, e.name]))
  const jobOf = Object.fromEntries(jobs.map((j: any) => [j.id, `${j.job_id || `#${j.id}`} ${j.job_title || ''}${(j.business_name || j.customer_name) ? ` — ${j.business_name || j.customer_name}` : ''}`.trim()]))
  const byPerson: Record<string, number> = {}, byJob: Record<string, number> = {}
  let total = 0
  for (const x of rows) {
    const h = num(x.hours); total += h
    const p = nameOf[x.employee_id] || 'unknown'; byPerson[p] = money((byPerson[p] || 0) + h)
    const j = x.job_id ? (jobOf[x.job_id] || `#${x.job_id}`) : 'no job'; byJob[j] = money((byJob[j] || 0) + h)
  }
  return {
    period: `${from} to ${to}`, entries: rows.length, total_hours: money(total),
    clocked_in_now: rows.filter((x: any) => x.is_clocked_in).map((x: any) => nameOf[x.employee_id] || 'unknown'),
    by_person: byPerson, by_job: Object.fromEntries(Object.entries(byJob).sort((a, b) => b[1] - a[1]).slice(0, 25)),
    list: rows.slice(0, 40).map((x: any) => ({ date: x.date, person: nameOf[x.employee_id] || null, job: x.job_id ? (jobOf[x.job_id] || `#${x.job_id}`) : null, category: x.category || 'Regular', hours: num(x.hours), in: x.clock_in_time, out: x.clock_out_time, notes: clip(x.notes, 160) || null })),
    scope: ctx.level < 2 ? 'Only this person\'s own hours.' : 'The time log: hours typed or logged against jobs. Clock-ins and punches are the time clock, a separate record.',
  }
}

// ── /communications ─────────────────────────────────────────────────────
async function communications(r: Rest, co: string, input: any, ctx: LookupCtx) {
  const to = dayOr(input?.to, ctx.today)
  const from = dayOr(input?.from, addDays(to, -30))
  let cust = ''
  if (input?.customer) {
    const cs = await readRecordList(r, `customers?${co}&select=id&or=(name.ilike.${ilike(input.customer)},business_name.ilike.${ilike(input.customer)})&limit=50`)
    if (!cs.length) return { count: 0, note: `No customer matches "${term(input.customer)}".` }
    cust = `&customer_id=in.(${cs.map((c: any) => c.id).join(',')})`
  }
  const type = input?.type ? `&type=ilike.${encodeURIComponent(term(input.type))}` : ''
  const dir = input?.direction === 'in' || input?.direction === 'out' ? `&direction=eq.${input.direction}` : ''
  const rows = await readAllRecords(r, `communications_log?${co}${cust}${type}${dir}&sent_date=gte.${from}&sent_date=lte.${to}&select=sent_date,created_at,type,direction,trigger,recipient,status,response,customer:customers!customer_id(name,business_name),employee:employees!employee_id(name)&order=sent_date.desc,created_at.desc`, 3000)
  const byType: Record<string, number> = {}, byStatus: Record<string, number> = {}
  for (const x of rows) { byType[x.type || 'other'] = (byType[x.type || 'other'] || 0) + 1; byStatus[x.status || 'unknown'] = (byStatus[x.status || 'unknown'] || 0) + 1 }
  return {
    period: `${from} to ${to}`, count: rows.length, by_type: byType, by_status: byStatus,
    list: rows.slice(0, 30).map((x: any) => ({
      date: x.sent_date, type: x.type, direction: x.direction === 'in' ? 'in' : 'out', why: x.trigger || null,
      customer: x.customer?.business_name || x.customer?.name || null, to: x.recipient || null, status: x.status || null,
      by: x.employee?.name || null, said: clip(String(x.response || '').replace(/\s*\[SM[0-9a-f]+\]\s*$/i, ''), 300) || null,
    })),
    scope: 'The communications log: texts, emails and calls JobScout sent or someone logged. "why" is what sent it (an invoice, a routine, a person). Messages sent from someone\'s own phone are not here unless logged.',
  }
}

// ── /lighting-audits ────────────────────────────────────────────────────
async function lightingAudits(r: Rest, co: string, input: any, ctx: LookupCtx) {
  let rows = await readAllRecords(r, `lighting_audits?${co}&select=id,audit_id,status,created_by,created_at,address,city,state,job_id,lead_id,total_fixtures,total_existing_watts,total_proposed_watts,annual_savings_kwh,annual_savings_dollars,estimated_rebate,est_project_cost,net_cost,payback_months,rebate_capped,customer:customers(name,business_name),utility_provider:utility_providers(provider_name)&order=created_at.desc`, 2000)
  if (input?.status) { const s = term(input.status).toLowerCase(); rows = rows.filter((a: any) => String(a.status || 'Draft').toLowerCase() === s) }
  if (input?.mine && ctx.email) rows = rows.filter((a: any) => String(a.created_by || '').toLowerCase() === String(ctx.email).toLowerCase())
  if (input?.customer) {
    const t = term(input.customer).toLowerCase()
    rows = rows.filter((a: any) => [a.customer?.business_name, a.customer?.name, a.audit_id, a.address, a.city].some((v) => String(v || '').toLowerCase().includes(t)))
  }
  const byStatus: Record<string, number> = {}
  for (const a of rows) byStatus[a.status || 'Draft'] = (byStatus[a.status || 'Draft'] || 0) + 1
  return {
    count: rows.length, by_status: byStatus,
    total_estimated_rebate: money(rows.reduce((s: number, a: any) => s + num(a.estimated_rebate), 0)),
    total_annual_savings: money(rows.reduce((s: number, a: any) => s + num(a.annual_savings_dollars), 0)),
    list: rows.slice(0, 40).map((a: any) => ({
      audit: a.audit_id || `#${a.id}`, customer: a.customer?.business_name || a.customer?.name || null, status: a.status || 'Draft',
      where: [a.address, a.city, a.state].filter(Boolean).join(', ') || null, utility: a.utility_provider?.provider_name || null,
      created: String(a.created_at || '').slice(0, 10), by: a.created_by || null, fixtures: num(a.total_fixtures),
      watts: `${num(a.total_existing_watts)} → ${num(a.total_proposed_watts)}`, yearly_kwh_saved: num(a.annual_savings_kwh),
      yearly_savings: num(a.annual_savings_dollars), estimated_rebate: num(a.estimated_rebate), rebate_capped: !!a.rebate_capped,
      project_cost: num(a.est_project_cost), net_cost: num(a.net_cost), payback_months: a.payback_months ?? null, job_id: a.job_id || null,
    })),
    scope: 'Lighting audits as the Lighting Audits page lists them. The estimate or job made from an audit is a separate record (job_id).',
  }
}

// ── /utility-programs + /utility-providers ──────────────────────────────
async function utilityPrograms(r: Rest, co: string, coOrGlobal: string, input: any, ctx: LookupCtx) {
  const u = input?.utility ? term(input.utility).toLowerCase() : ''
  const st = input?.state ? term(input.state).toUpperCase().slice(0, 2) : ''
  const [providers, programs, defaults] = await Promise.all([
    readRecordList(r, `utility_providers?${coOrGlobal}&select=id,provider_name,state,service_territory,has_rebate_program,rebate_program_url,contact_phone&order=provider_name`),
    readRecordList(r, `utility_programs?${coOrGlobal}&select=*&order=program_name`),
    readRecordList(r, `settings?${co}&key=eq.default_utility_provider_id&select=value&limit=1`),
  ])
  const defaultId = Number(String(defaults?.[0]?.value ?? '').replace(/"/g, '')) || null
  const pick = (name: unknown, state: unknown) => (!u || String(name || '').toLowerCase().includes(u)) && (!st || String(state || '').toUpperCase().includes(st))
  const prov = providers.filter((p: any) => pick(p.provider_name, p.state) || (u && String(p.service_territory || '').toLowerCase().includes(u)))
  const progs = programs.filter((p: any) => (!u || [p.program_name, p.utility_name].some((v) => String(v || '').toLowerCase().includes(u))) && (!st || String(p.state || '').toUpperCase().includes(st)))
  const filtered = !!(u || st)
  let rates: any[] = []
  if (filtered && progs.length) {
    const ids = progs.slice(0, 40).map((p: any) => p.id)
    rates = await readRecordList(r, `incentive_measures?${coOrGlobal}&program_id=in.(${ids.join(',')})&select=program_id,fixture_category,measure_category,measure_subcategory,measure_type,location_type,control_level,calc_method,rate,rate_value,rate_unit,min_watts,max_watts,cap_amount,per_unit_cap,cap_percent,project_cap_percent,tier,effective_date,expiration_date,requirements&limit=1000`)
    if (input?.measure) { const m = term(input.measure).toLowerCase(); rates = rates.filter((x: any) => [x.fixture_category, x.measure_category, x.measure_subcategory, x.measure_type].some((v) => String(v || '').toLowerCase().includes(m))) }
  }
  const progName = Object.fromEntries(progs.map((p: any) => [p.id, p.program_name]))
  return {
    utilities: prov.slice(0, filtered ? 30 : 80).map((p: any) => ({ name: p.provider_name, state: p.state, territory: p.service_territory || null, has_rebate_program: !!p.has_rebate_program, program_page: p.rebate_program_url || null, phone: p.contact_phone || null, company_default: p.id === defaultId })),
    programs: progs.slice(0, filtered ? 40 : 60).map((p: any) => ({
      name: p.program_name, utility: p.utility_name, type: p.program_type || null, state: p.state || null,
      effective: p.effective_date || null, expires: p.expiration_date || null, max_cap_percent: p.max_cap_percent ?? null,
      dlc_required: p.dlc_required ?? null, pre_approval_required: p.pre_approval_required ?? null,
    })),
    rates: filtered ? rates.slice(0, 120).map((x: any) => ({
      program: progName[x.program_id] || x.program_id, fixture: x.fixture_category || null,
      measure: [x.measure_category, x.measure_subcategory, x.measure_type].filter(Boolean).join(' / ') || null,
      where: x.location_type || null, controls: x.control_level || null,
      watts: x.min_watts != null || x.max_watts != null ? `${x.min_watts ?? 0}–${x.max_watts ?? '∞'} W` : null,
      rate: x.rate_value ?? x.rate ?? null, unit: x.rate_unit || x.calc_method || null,
      caps: [x.cap_amount != null ? `$${x.cap_amount}` : null, x.per_unit_cap != null ? `$${x.per_unit_cap}/unit` : null, x.cap_percent != null ? `${x.cap_percent}%` : null, x.project_cap_percent != null ? `${x.project_cap_percent}% of project` : null].filter(Boolean).join(', ') || null,
      tier: x.tier || null, effective: x.effective_date || null, expires: x.expiration_date || null, requirements: clip(x.requirements, 200) || null,
    })) : 'Name a utility or a state to get the rebate rates.',
    scope: 'Utilities and programs from JobScout\'s shared catalogue plus any this company added. Rates are what the programs publish; the utility\'s own approval decides the real incentive.',
    ...(rates.length > 120 ? { more_rates: rates.length - 120, note: 'Narrow by measure to see the rest.' } : {}),
  }
}

// ── /fixture-types ──────────────────────────────────────────────────────
async function fixtureTypes(r: Rest, co: string, input: any) {
  let rows = await readAllRecords(r, `fixture_types?${co}&select=fixture_id,fixture_name,category,lamp_type,lamp_count,system_wattage,led_replacement_watts,visual_characteristics&order=fixture_name`, 2000)
  if (input?.search) { const words = term(input.search).toLowerCase().split(/\s+/).filter(Boolean); rows = rows.filter((f: any) => words.every((w) => String(f.fixture_name || '').toLowerCase().includes(w))) }
  if (input?.category) { const c = term(input.category).toLowerCase(); rows = rows.filter((f: any) => String(f.category || '').toLowerCase().includes(c)) }
  return {
    count: rows.length,
    list: rows.slice(0, 60).map((f: any) => ({ name: f.fixture_name, category: f.category || null, lamp: [f.lamp_count, f.lamp_type].filter(Boolean).join(' × ') || null, system_watts: num(f.system_wattage), led_replacement_watts: f.led_replacement_watts == null ? null : num(f.led_replacement_watts), looks_like: clip(f.visual_characteristics, 160) || null })),
    scope: 'This company\'s fixture catalogue, as the Fixture Types page lists it.',
  }
}
