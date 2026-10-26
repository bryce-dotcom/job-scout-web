// Reading a crew sheet's rows (the sheet itself is crewSheet.ts).
//
// `get(path)` is PostgREST: the crew-sheet function passes one on the service
// key after it has checked who is asking; Arnie's query_crew_sheet does the
// same. Every query is scoped to the one company.

import { dayStartUtc } from './repGoals.ts'
import { parseCrew, isOnCrew } from './crewRoster.ts'
import {
  type Any, LADDER_MAX_FT, SCISSOR_MAX_FT, reachFor, heightFromNotes, matchAreas, installNote,
  isFixture, rateFromHistory, laborFor, pullList, flagsFor, shortName, type Rate,
} from './crewSheet.ts'

type Get = (path: string) => Promise<Any[]>
const CLOSED = '(Cancelled,Canceled)'
// Work that is done is not on a crew sheet, whatever date it carries.
const DONE = /^(cancel+ed|completed?|closed|paid|invoiced|verified|archived)$/i
const inList = (ids: (number | string)[]) => `(${[...new Set(ids)].join(',')})`

/** All of a list query, past the 1000-row page. */
async function all(get: Get, path: string, page = 1000): Promise<Any[]> {
  let out: Any[] = []
  for (let o = 0; ; o += page) {
    const rows = await get(`${path}&offset=${o}&limit=${page}`)
    out = out.concat(Array.isArray(rows) ? rows : [])
    if (!Array.isArray(rows) || rows.length < page) return out
  }
}

export type SheetOpts = {
  from: string; to: string; tz: string
  /** Only the jobs this person is on (someone below Team Lead asks for their own sheet). */
  onlyFor?: { name: string } | null
  /** Narrow to one crew member's jobs, by name. */
  crew?: string | null
}

/**
 * The calendar day a schedule value falls on. A stored midnight UTC is a DATE
 * with no time (the demo's jobs, and any job scheduled by day): read in the
 * company's zone it would be 6 pm the evening before, and the job would drop
 * off its own day. Anything else is a real time, read in the zone.
 */
export function scheduleDay(iso: unknown, tz: string): string | null {
  const s = String(iso || '')
  if (!s) return null
  if (isDateOnly(s)) return s.slice(0, 10)
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d)
}
export const isDateOnly = (iso: unknown) => /T00:00:00(\.0+)?(\+00(:?00)?|Z)$/.test(String(iso || ''))

export async function loadCrewSheet(get: Get, companyId: number, o: SheetOpts) {
  // A day either side, then each job is placed on its own calendar days.
  const before = new Date(Date.parse(`${o.from}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  const after = new Date(Date.parse(`${o.to}T12:00:00Z`) + 2 * 86_400_000).toISOString().slice(0, 10)
  const start = dayStartUtc(before, o.tz).toISOString()
  const end = dayStartUtc(after, o.tz).toISOString()

  // Jobs on the schedule in the range: starting in it, or running through it.
  let jobs = await get(`jobs?select=id,job_id,job_title,status,business_unit,customer_id,customer_name,business_name,job_address,start_date,end_date,assigned_team,job_lead_id,salesperson_id,phone,email,allotted_time_hours,quote_id,lead_id,details,parts_status&company_id=eq.${companyId}&start_date=lt.${end}&or=(end_date.gte.${start},and(end_date.is.null,start_date.gte.${start}))&status=not.in.${CLOSED}&order=start_date&limit=200`)
  jobs = (Array.isArray(jobs) ? jobs : [])
    .filter((j) => !DONE.test(String(j.status || '').trim()))
    .filter((j) => {
      const s = scheduleDay(j.start_date, o.tz)
      const e = scheduleDay(j.end_date, o.tz)
      const last = e && s && e >= s ? e : s
      return !!s && s <= o.to && !!last && last >= o.from
    })
  if (o.onlyFor) jobs = jobs.filter((j) => isOnCrew(j.assigned_team, o.onlyFor))
  if (o.crew) jobs = jobs.filter((j) => isOnCrew(j.assigned_team, { name: o.crew }))
  const base = { from: o.from, to: o.to, tz: o.tz, reach: { ladderMaxFt: LADDER_MAX_FT, scissorMaxFt: SCISSOR_MAX_FT } }
  if (!jobs.length) return { ...base, jobs: [], pull_list: [], generated_at: new Date().toISOString() }

  const ids = jobs.map((j) => j.id)
  const [lines, people, customers, quoteLines, audits] = await Promise.all([
    all(get, `job_lines?select=id,job_id,item_id,quantity,notes,description,allocated_qty,po_line_id&job_id=in.${inList(ids)}&order=id`),
    get(`employees?select=id,name&company_id=eq.${companyId}&limit=1000`),
    get(`customers?select=id,name,phone,email&company_id=eq.${companyId}&id=in.${inList(jobs.map((j) => j.customer_id).filter(Boolean).concat([0]))}`),
    get(`quote_lines?select=quote_id,item_id,quantity&quote_id=in.${inList(jobs.map((j) => j.quote_id).filter(Boolean).concat([0]))}&limit=2000`),
    get(`lighting_audits?select=id,job_id,lead_id&company_id=eq.${companyId}&or=(job_id.in.${inList(ids)},lead_id.in.${inList(jobs.map((j) => Number(j.lead_id)).filter(Boolean).concat([0]))})&limit=200`),
  ])
  const areas = audits.length ? await get(`audit_areas?select=audit_id,area_name,ceiling_height,fixture_count,existing_wattage,led_wattage,led_replacement_id,product_qty,lighting_type&audit_id=in.${inList(audits.map((a: Any) => a.id))}&limit=2000`) : []

  // Products and what is inside the bundles.
  const itemIds = [...new Set(lines.map((l) => Number(l.item_id)).filter(Boolean))]
  const comps = itemIds.length ? await get(`product_components?select=parent_product_id,component_product_id,quantity&parent_product_id=in.${inList(itemIds)}&limit=2000`) : []
  const allIds = [...new Set([...itemIds, ...comps.map((c: Any) => Number(c.component_product_id))])]
  const prods = allIds.length ? await get(`products_services?select=id,name,vendor_sku,material_or_labor,type&id=in.${inList(allIds)}&limit=2000`) : []
  const P = new Map<number, Any>(prods.map((p: Any) => [Number(p.id), p]))
  const C = new Map<number, { id: number; qty: number }[]>()
  for (const c of comps) C.set(Number(c.parent_product_id), [...(C.get(Number(c.parent_product_id)) || []), { id: Number(c.component_product_id), qty: Number(c.quantity) || 1 }])

  // The POs the lines are on.
  const poLineIds = lines.map((l) => l.po_line_id).filter(Boolean)
  const poLines = poLineIds.length ? await get(`purchase_order_lines?select=id,po_id&id=in.${inList(poLineIds)}`) : []
  const pos = poLines.length ? await get(`purchase_orders?select=id,po_number,status,expected_delivery_date&id=in.${inList(poLines.map((x: Any) => x.po_id))}`) : []
  const poOfLine = new Map<number, Any>(poLines.map((x: Any) => [Number(x.id), pos.find((p: Any) => p.id === x.po_id)]))

  const rates = await historyRates(get, companyId)
  const name = (id: unknown) => people.find((p: Any) => p.id === id)?.name || null

  const sheetJobs = jobs.map((j) => {
    const mine = lines.filter((l) => l.job_id === j.id).map((l) => {
      const p = P.get(Number(l.item_id))
      const parts = (C.get(Number(l.item_id)) || []).map((c) => P.get(c.id)).filter(Boolean)
      return { ...l, product_name: shortName(p?.name || l.description), job_title: j.job_title, is_fixture: isFixture(p), lift_on_bid: parts.some((x: Any) => x.material_or_labor === 'labor' && /lift/i.test(x.name)) || /\blift\b/i.test(String(p?.name || '')) }
    })
    const myAreas = areas.filter((a: Any) => audits.some((x: Any) => x.id === a.audit_id && (x.job_id === j.id || (j.lead_id && Number(x.lead_id) === Number(j.lead_id)))))
    const areaOf = matchAreas(mine.filter((l) => l.is_fixture), myAreas)
    const crew = parseCrew(j.assigned_team)
    const out = mine.map((l) => {
      const area = areaOf.get(l.id) || null
      const height = heightFromNotes(l.notes) ?? (area?.ceiling_height ? Number(area.ceiling_height) : null)
      return {
        qty: Number(l.quantity) || 0,
        product: l.product_name,
        parts: (C.get(Number(l.item_id)) || []).map((c) => P.get(c.id)).filter((x: Any) => x && x.material_or_labor !== 'labor').map((x: Any) => ({ name: shortName(x.name), order_code: x.vendor_sku ? String(x.vendor_sku).trim() : null })),
        note: installNote(l, area),
        height,
        reach: l.is_fixture || l.lift_on_bid ? reachFor(height, l.lift_on_bid) : null,
        on_po: poOfLine.get(Number(l.po_line_id))?.po_number || null,
        is_fixture: l.is_fixture,
      }
    })
    const fixtures = out.filter((l) => l.is_fixture).reduce((s, l) => s + l.qty, 0)
    const plannedHours = j.start_date && j.end_date ? (Date.parse(j.end_date) - Date.parse(j.start_date)) / 3_600_000 : null
    const rate: Rate | null = rates.get(String(j.business_unit || '')) || rates.get('*') || null
    const jobPos = pos.filter((p: Any) => poLines.some((x: Any) => x.po_id === p.id && mine.some((l) => Number(l.po_line_id) === Number(x.id))))
    const cust = customers.find((c: Any) => c.id === j.customer_id)
    return {
      id: j.id, job_id: j.job_id, title: j.job_title, status: j.status, business_unit: j.business_unit,
      customer: j.business_name || j.customer_name, address: j.job_address,
      start: j.start_date, end: j.end_date, crew, lead: name(j.job_lead_id), sales: name(j.salesperson_id),
      // A day with no time: show the date alone, never "6:00 PM the day before".
      day: scheduleDay(j.start_date, o.tz), all_day: isDateOnly(j.start_date),
      contact: { name: cust?.name || null, phone: j.phone || cust?.phone || null, email: j.email || cust?.email || null },
      details: j.details || null,
      lines: out,
      reach: {
        ladder: out.filter((l) => l.reach === 'ladder').reduce((s, l) => s + l.qty, 0),
        scissor: out.filter((l) => l.reach === 'scissor lift').reduce((s, l) => s + l.qty, 0),
        boom: out.filter((l) => l.reach === 'boom lift').reduce((s, l) => s + l.qty, 0),
        maxHeight: Math.max(0, ...out.map((l) => Number(l.height) || 0)) || null,
      },
      pos: jobPos.map((p: Any) => ({ po_number: p.po_number, status: p.status, expected: p.expected_delivery_date })),
      labor: laborFor(fixtures, crew.length, rate, plannedHours, Number(j.allotted_time_hours) || null),
      flags: flagsFor(j, mine, quoteLines.filter((q: Any) => q.quote_id === j.quote_id), areaOf, jobPos, crew),
    }
  })

  return {
    ...base,
    jobs: sheetJobs,
    pull_list: pullList(lines.map((l) => ({ ...l, job_title: jobs.find((j) => j.id === l.job_id)?.job_title })), P, C),
    generated_at: new Date().toISOString(),
  }
}

/**
 * Crew-hours per fixture from the last year of CLOCKED time, per business
 * unit ('*' = all). The hours a crew clocked on a job ÷ its fixtures.
 */
async function historyRates(get: Get, companyId: number): Promise<Map<string, Rate>> {
  const since = new Date(Date.now() - 365 * 86_400_000).toISOString()
  const clock = await all(get, `time_clock?select=job_id,total_hours,clock_in,clock_out&company_id=eq.${companyId}&job_id=not.is.null&clock_in=gte.${since}&order=id`)
  const hours = new Map<number, number>()
  for (const t of clock) {
    const h = Number(t.total_hours) || (t.clock_out ? (Date.parse(t.clock_out) - Date.parse(t.clock_in)) / 3_600_000 : 0)
    if (h > 0 && h < 16) hours.set(Number(t.job_id), (hours.get(Number(t.job_id)) || 0) + h)
  }
  const ids = [...hours.keys()]
  if (!ids.length) return new Map()
  let jobs: Any[] = [], lines: Any[] = []
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = inList(ids.slice(i, i + 150))
    jobs = jobs.concat(await get(`jobs?select=id,business_unit&company_id=eq.${companyId}&id=in.${chunk}`))
    lines = lines.concat(await all(get, `job_lines?select=job_id,item_id,quantity&job_id=in.${chunk}&order=id`))
  }
  const items = [...new Set(lines.map((l) => Number(l.item_id)).filter(Boolean))]
  let prods: Any[] = []
  for (let i = 0; i < items.length; i += 150) prods = prods.concat(await get(`products_services?select=id,name,material_or_labor&id=in.${inList(items.slice(i, i + 150))}`))
  const P = new Map<number, Any>(prods.map((p) => [Number(p.id), p]))
  const per = (bu: string | null) => jobs
    .filter((j) => bu == null || String(j.business_unit || '') === bu)
    .map((j) => ({ hours: hours.get(j.id) || 0, fixtures: lines.filter((l) => l.job_id === j.id && isFixture(P.get(Number(l.item_id)))).reduce((s, l) => s + (Number(l.quantity) || 0), 0) }))
  const out = new Map<string, Rate>()
  const any = rateFromHistory(per(null)); if (any) out.set('*', any)
  for (const bu of new Set(jobs.map((j) => String(j.business_unit || '')).filter(Boolean))) { const r = rateFromHistory(per(bu)); if (r) out.set(bu, r) }
  return out
}
