// The crew sheet — what a crew lead takes into the day (Bryce, 2026-10-26).
//
// London had Grok build one from three JobScout exports (the jobs list, the
// price sheet and his day plan), because Jenny could not answer "what do I
// pull, how many guys based on past jobs, what ladders, do I need a lift?"
// (2026-10-15). Everything Grok used is in JobScout already — the job's
// schedule and crew, its lines, the lighting audit's area, ceiling height and
// old → new watts, the bundles' parts and order codes, the POs — and one
// thing Grok said it lacked: the hours crews actually CLOCKED on past jobs.
//
// Pure: rows in, a sheet out. The data is read by crewSheetData.ts; the app
// draws it (src/pages/CrewSheet.jsx) and prints it (src/lib/crewSheetPdf.js);
// Arnie reads it out (query_crew_sheet).

export type Any = any

// ── Ladder or lift ──────────────────────────────────────────────────────────
// A working height a crew reaches from an 8–10 ft step or extension ladder vs
// one that needs a lift. Defaults, stated on the sheet: up to 12 ft a ladder,
// up to 26 ft a scissor lift (the common 19–26 ft platforms), above that a boom.
export const LADDER_MAX_FT = 12
export const SCISSOR_MAX_FT = 26

export type Reach = 'ladder' | 'scissor lift' | 'boom lift'

export function reachFor(heightFt: number | null, liftOnBid = false): Reach | null {
  const h = Number(heightFt)
  if (!Number.isFinite(h) || h <= 0) return liftOnBid ? 'scissor lift' : null
  if (h <= LADDER_MAX_FT && !liftOnBid) return 'ladder'
  if (h <= SCISSOR_MAX_FT) return 'scissor lift'
  return 'boom lift'
}

/** "Office Upstairs · 9 ft · 96W T8 → 34W LED" → the height, from a line's notes. */
export function heightFromNotes(notes: unknown): number | null {
  const m = String(notes || '').match(/(\d{1,3}(?:\.\d)?)\s*(?:ft|feet|')\b/i)
  return m ? Number(m[1]) : null
}

// ── Which audit area a job line installs into ───────────────────────────────
// A line made from the audit carries "Area · 9 ft · 96W T8 → 34W LED" in its
// notes; most do not, so the audit area is matched by product and quantity,
// then by quantity alone (the product may have been swapped after the audit —
// which is itself a flag).
export function matchAreas(lines: Any[], areas: Any[]): Map<number, Any> {
  const out = new Map<number, Any>()
  const free = [...areas]
  const take = (pred: (a: Any) => boolean) => { const i = free.findIndex(pred); return i < 0 ? null : free.splice(i, 1)[0] }
  for (const l of lines) {
    const named = String(l.notes || '').split('·')[0].trim().toLowerCase()
    const a = (named && take((x) => String(x.area_name || '').trim().toLowerCase() === named && Number(x.product_qty ?? x.fixture_count) === Number(l.quantity)))
      || take((x) => Number(x.led_replacement_id) === Number(l.item_id) && Number(x.product_qty ?? x.fixture_count) === Number(l.quantity))
    if (a) out.set(l.id, a)
  }
  for (const l of lines) {
    if (out.has(l.id)) continue
    const a = take((x) => Number(x.product_qty ?? x.fixture_count) === Number(l.quantity))
    if (a) out.set(l.id, { ...a, swapped: Number(a.led_replacement_id) !== Number(l.item_id) })
  }
  return out
}

/** One line's install note, from its own notes or its audit area. */
export function installNote(line: Any, area: Any | null): string {
  if (String(line.notes || '').trim()) return String(line.notes).trim()
  if (!area) return ''
  const parts = [area.area_name, area.ceiling_height ? `${area.ceiling_height} ft` : '',
    area.existing_wattage || area.led_wattage ? `${area.existing_wattage ? `${area.existing_wattage}W ${area.lighting_type || ''}`.trim() : '?'} → ${area.led_wattage ? `${area.led_wattage}W LED` : '?'}` : '']
  return parts.filter(Boolean).join(' · ')
}

// ── Fixtures, for the labor estimate ────────────────────────────────────────
const FIXTURE = /fixture|high ?bay|panel|wrap|strip|troffer|flood|wall ?pack|cobra|canopy|tube|\bt8\b|\bt5\b|down ?light|area light|retrofit kit|vapor|shoe ?box|lamp/i
// By its NAME, not material_or_labor: a "Highbay LIFT w/ Controls" bundle is
// filed as labor because it carries the lift hours, and it is still 21 highbays
// to hang (Step Saver, 2026-10-26). An hourly or labor-only item is not.
const NOT_A_FIXTURE = /\b(labor|labour|per hour|hourly|install(ation)? only|service call|trip charge)\b|\bES LIFT\b/i
export function isFixture(p: Any): boolean {
  const name = String(p?.name || '')
  return !!p && FIXTURE.test(name) && !NOT_A_FIXTURE.test(name)
}

// ── Labor from what crews actually clocked ──────────────────────────────────
export type Rate = { median: number; low: number; high: number; jobs: number }

/**
 * Crew-hours per fixture across past jobs: each job's clocked hours ÷ its
 * fixtures, for jobs big enough to say anything (5+ fixtures, 4+ hours). The
 * median and the middle half (25th–75th percentile) — a range, because the
 * honest answer is one.
 */
export function rateFromHistory(perJob: { hours: number; fixtures: number }[]): Rate | null {
  const r = perJob.filter((j) => j.fixtures >= 5 && j.hours >= 4).map((j) => j.hours / j.fixtures).sort((a, b) => a - b)
  if (r.length < 5) return null
  const at = (q: number) => r[Math.min(r.length - 1, Math.max(0, Math.round(q * (r.length - 1))))]
  return { median: round2(at(0.5)), low: round2(at(0.25)), high: round2(at(0.75)), jobs: r.length }
}

export type Labor = {
  fixtures: number; crewSize: number
  crewHours: { median: number; low: number; high: number }
  onSiteHours: { median: number; low: number; high: number }
  days: number
  planned: { hours: number; crewHours: number; perFixture: number } | null
  allotted: number | null
  basis: string
}

/** How long the job should take, from history, beside what is planned. */
export function laborFor(fixtures: number, crewSize: number, rate: Rate | null, plannedHours: number | null, allotted: number | null): Labor | null {
  if (!rate || !(fixtures > 0)) return null
  const crew = Math.max(1, crewSize || 1)
  const ch = { median: round1(fixtures * rate.median), low: round1(fixtures * rate.low), high: round1(fixtures * rate.high) }
  const on = { median: round1(ch.median / crew), low: round1(ch.low / crew), high: round1(ch.high / crew) }
  const planned = plannedHours && plannedHours > 0
    ? { hours: round1(plannedHours), crewHours: round1(plannedHours * crew), perFixture: round2((plannedHours * crew) / fixtures) }
    : null
  return {
    fixtures, crewSize: crew, crewHours: ch, onSiteHours: on, days: Math.max(1, Math.ceil(on.median / 8 - 0.15)),
    planned, allotted: allotted && allotted > 0 ? round1(allotted) : null,
    basis: `${rate.jobs} past jobs, clocked: ${rate.median} crew-hrs a fixture (most ran ${rate.low}–${rate.high})`,
  }
}

// ── The pull list: what goes on the trailer ─────────────────────────────────
/**
 * Every line's PARTS: a bundle is its components (the fixture and its sensor
 * are two things to pull), a plain product is itself. Labor parts (the lift
 * hours) are not pulled. Summed across the sheet's jobs.
 */
export function pullList(lines: Any[], products: Map<number, Any>, components: Map<number, { id: number; qty: number }[]>): Any[] {
  const sum = new Map<number, { product: Any; qty: number; jobs: Set<string>; allocated: number }>()
  for (const l of lines) {
    const parts = components.get(Number(l.item_id))?.length ? components.get(Number(l.item_id))! : [{ id: Number(l.item_id), qty: 1 }]
    for (const c of parts) {
      const p = products.get(c.id)
      if (!p || p.material_or_labor === 'labor') continue
      const row = sum.get(c.id) || { product: p, qty: 0, jobs: new Set<string>(), allocated: 0 }
      row.qty += (Number(l.quantity) || 0) * (c.qty || 1)
      if (l.job_title) row.jobs.add(l.job_title)
      row.allocated += (Number(l.allocated_qty) || 0) * (c.qty || 1)
      sum.set(c.id, row)
    }
  }
  return [...sum.values()]
    .map((r) => ({ product_id: r.product.id, name: String(r.product.name || '').trim(), order_code: r.product.vendor_sku ? String(r.product.vendor_sku).trim() : null, qty: r.qty, allocated: r.allocated, jobs: [...r.jobs] }))
    .sort((a, b) => b.qty - a.qty)
}

// ── What a crew lead should know before rolling ─────────────────────────────
export function flagsFor(job: Any, lines: Any[], quoteLines: Any[], areaOf: Map<number, Any>, pos: Any[], crew: string[]): string[] {
  const out: string[] = []
  if (!crew.length) out.push('No crew is assigned on the job.')
  // The estimate sold one product; the job carries another.
  if (quoteLines.length) {
    const sold = new Map<number, number>()
    for (const q of quoteLines) sold.set(Number(q.item_id), (sold.get(Number(q.item_id)) || 0) + (Number(q.quantity) || 0))
    for (const l of lines) {
      if (!l.is_fixture || sold.has(Number(l.item_id))) continue
      const area = areaOf.get(l.id)
      out.push(`${shortName(l.product_name)} × ${l.quantity}${area?.area_name ? ` (${area.area_name})` : ''} is not a product the estimate sold — confirm which one goes up before installing.`)
    }
  }
  const noHeight = lines.filter((l) => l.is_fixture && !areaOf.get(l.id)?.ceiling_height && heightFromNotes(l.notes) == null)
  if (noHeight.length) out.push(`${noHeight.length} line${noHeight.length === 1 ? ' has' : 's have'} no ceiling height — ladder or lift unknown.`)
  const open = pos.filter((p) => !['received', 'closed', 'cancelled'].includes(String(p.status || '').toLowerCase()))
  if (open.length) out.push(`Parts not received yet: ${open.map((p) => `${p.po_number} (${p.status || 'open'})`).join(', ')}.`)
  return out
}

export const shortName = (s: unknown) => String(s || '').replace(/\s+/g, ' ').trim()
const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100
