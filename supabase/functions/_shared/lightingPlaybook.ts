// A LIGHTING TAKEOFF, BUILT TO THE COMPANY'S OWN ESTIMATING RULES.
//
// Cole's write-up (feedback, 2026-10-10, "Jenny Job Scouter: what she is and
// what she does") is the spec. He walks a site naming fixtures; Jenny builds
// the estimate in JobScout exactly the way he would:
//
//   - products only from the Electrical Service bundle
//   - Business Unit = Energy Scout on every estimate
//   - quantities are heads, not poles
//   - exterior is 20 ft on a lift unless marked no-lift (15 ft, no-lift
//     product); interior is never on a lift
//   - the Arizona swaps, exactly as he listed them
//   - GMs while the rebate allows, keeping the customer at $0: $77 mounts
//     first (cobras before floods), then the lift GM as the bundle item
//     ES LIFT at $49.98/hr — 2 hr per product on a lift, 1 per product off
//   - incentive = the lower of the rebate and the subtotal
//   - never a discount, never sent
//
// This file is PURE — no database — so every one of those rules is tested
// directly (src/lib/lightingPlaybook.test.js). The products are looked up by
// name in the live catalogue at the moment of building, so a price change in
// Products & Services reaches the next estimate with no code change.
//
// A playbook is chosen per company (settings key `estimating_playbook`).
// Only Energy Scout's exists today; Phase 4 of the Arnie plan turns this
// shape into a template other companies fill in.

// deno-lint-ignore-file no-explicit-any
type Any = any

export type Kind =
  | 'cobra' | 'flood' | 'wall_pack' | 'mini_wall_pack' | 'dome'
  | 'high_bay' | 't5_high_bay' | 't8_4ft' | 't8_8ft'

export interface TakeoffItem {
  kind: Kind
  /** Heads, not poles. */
  qty: number
  /** Existing lamp watts, as the rep said them (400, 750, 1000). Tubes: per lamp is fine. */
  existing_watts?: number
  /** Lamps per fixture, for T5/T8. */
  lamps?: number
  location: 'exterior' | 'interior'
  /** Marked no-lift: 15 ft and the no-lift product. */
  no_lift?: boolean
  /** How it hangs: pole | arm | flush (cobras); trunnion | knuckle (floods). */
  mount?: string
  /** The rep's own words for it — "400 watt shoebox on the south lot". */
  words?: string
  /** Where on site. */
  area?: string
  height_ft?: number
}

export interface Product { id: number; name: string; unit_price: number | string | null; type?: string | null }

export interface PlannedLine {
  item_name: string
  item_id: number
  quantity: number
  price: number
  description: string
  in_utility_scope: true
  role: 'fixture' | 'mount_gm' | 'lift_gm'
}

export interface Plan {
  ok: true
  lines: PlannedLine[]
  products_subtotal: number
  gm_total: number
  subtotal: number
  rebate: number
  rebate_source: 'given' | 'estimated'
  incentive: number
  out_of_pocket: number
  gm_note: string
  assumptions: string[]
  business_unit: string
}

export type PlanError = { ok: false; error: string }

const money = (n: number) => Math.round(n * 100) / 100
const squash = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

// ── The Energy Scout playbook ──────────────────────────────────────────────

interface FixtureRule {
  label: string                       // what it becomes, in Cole's words
  from: string                        // what it was, when the rep gave no words
  led: (existing: number, item: TakeoffItem) => number
  product: (item: TakeoffItem, lift: boolean) => string
  /** Gets a $77 mount GM; the value is the mount product for this item. */
  mount?: (item: TakeoffItem) => string | null
  /** Mounts are added in this order — cobras first. */
  mountRank?: number
  /** SRP small-business estimate for one fixture. 0 = only TrakSmart knows. */
  rebate: (existing: number, led: number, item: TakeoffItem) => number
  interiorOnly?: boolean
  exteriorOnly?: boolean
  /** Never on a lift whatever the location says (a security light over a door). */
  neverLift?: boolean
  defaultHeight?: number
  defaultExisting?: number
  assumption?: (item: TakeoffItem) => string | null
}

// SRP Small Business (SBC), the same table Lenard's AZ page uses: exterior
// pays per watt reduced; high bays per fixture by the watts they reduce.
// These are ESTIMATES. The real number comes from SRP's TrakSmart tool
// (Phase 2), and until then a rebate the rep reads off TrakSmart wins.
const SRP_EXTERIOR_PER_WATT = 0.75
const srpHighBay = (reduced: number) => (reduced <= 0 ? 0 : reduced <= 250 ? 150 : reduced <= 400 ? 250 : 350)

// Utah — Rocky Mountain Power's Small/Medium Business Express, the table
// Lenard's UT page uses: per NEW watt (exterior capped at 285 W a fixture),
// and the incentive never more than 75% of the project. "Utah uses the same
// concepts with Utah incentives" (Cole). An estimate, like SRP's.
const RMP_EXTERIOR_PER_NEW_WATT = 2.40
const RMP_INTERIOR_PER_NEW_WATT = 1.50
const RMP_EXTERIOR_MAX_W = 285
export const RMP_CAP = 0.75
const rmpPerFixture = (led: number, location: 'exterior' | 'interior') =>
  location === 'exterior' ? Math.min(led, RMP_EXTERIOR_MAX_W) * RMP_EXTERIOR_PER_NEW_WATT : led * RMP_INTERIOR_PER_NEW_WATT

// ── THE TEMPLATE ───────────────────────────────────────────────────────────
//
// Phase 4 of the plan: "Cole's rules become the template other companies fill
// in." A playbook is DATA — this shape — and compilePlaybook turns it into the
// rules planEstimate runs. Energy Scout's is the first one filled in; another
// company is a settings row (key estimating_playbook, value = its template as
// JSON), not a code change. The utility programs (SRP, RMP) stay in code:
// they are facts about the utility, not choices a company makes.

export interface FixtureTemplate {
  label: string
  from: string
  /** The LED watts: a number; or by the existing watts, [[up to, watts], …, [null, watts]]; or per lamp. */
  led: number | { by_existing: [number | null, number][] } | { per_lamp: number; default_lamps: number }
  /** The product, by name in the catalogue section. Tubes name it by lamp count with {n}. */
  product: { lift?: string; no_lift: string } | { one_lamp: string; lamps: string; default_lamps: number }
  mount?: { default: string; arm?: string }
  mount_rank?: number
  /** How the default program pays for it. */
  rebate: 'per_watt_reduced' | 'highbay_tier' | 'none'
  location: 'exterior' | 'interior'
  never_lift?: boolean
  default_height?: number
  default_existing?: number
  note?: string
  note_below_existing?: [number, string]
}

export interface PlaybookTemplate {
  key: string
  name: string
  business_unit: string
  catalog_type: string
  gm: { mount_price: number; lift_product: string; lift_hours_on: number; lift_hours_off: number }
  fixtures: Partial<Record<Kind, FixtureTemplate>>
}

export const ENERGY_SCOUT_TEMPLATE: PlaybookTemplate = {
  key: 'energy_scout_lighting',
  name: 'Energy Scout lighting',
  business_unit: 'Energy Scout',
  catalog_type: 'Electrical Services (Bundles)',
  gm: { mount_price: 77, lift_product: 'ES LIFT', lift_hours_on: 2, lift_hours_off: 1 },
  fixtures: {
    // "400W cobra or shoebox goes to a 60W LED cobra" — and 750W, and anything
    // over 750W, all go to 60W. A cobra marked "10" is a 400W.
    cobra: {
      label: 'LED cobra head', from: 'MH cobra head / shoebox', led: 60,
      product: { lift: 'SMBE 60/80/100W Cobra Head LOW WATT', no_lift: 'SMBE 60/80/100W Cobra Head LOW WATT w/o LIFT' },
      mount: { default: 'MES Cobra Head Mount - Slip Fit', arm: 'MES Cobra Head Mount - Arm Fit' }, mount_rank: 0,
      rebate: 'per_watt_reduced', location: 'exterior', default_existing: 400,
    },
    // 400W flood → 45W; 750W and over → 60W.
    flood: {
      label: 'LED flood', from: 'MH flood', led: { by_existing: [[400, 45], [null, 60]] },
      product: { lift: 'SMBE 25/45/60W Flood w/ Lift', no_lift: 'SMBE 25/45/60W Flood' },
      mount: { default: 'MES Cobra Head Mount - Trunnion Fit' }, mount_rank: 1,
      rebate: 'per_watt_reduced', location: 'exterior', default_existing: 400,
    },
    // 400W wall pack → 30-40W. Set to 30: SRP pays per watt reduced, and the
    // TrakSmart step tests 30 against 40 and keeps whichever pays more.
    wall_pack: {
      label: 'LED wall pack (set to 30W)', from: 'MH wall pack', led: 30,
      product: { lift: 'SMBE 10/20/30/40W Slim Cutoff Wall Pack w/ Lift', no_lift: 'SMBE 10/20/30/40W Slim Cutoff Wall Pack' },
      rebate: 'per_watt_reduced', location: 'exterior', default_existing: 400,
      note_below_existing: [250, 'The {w}W wall pack is set to 30W like a 400W one — Cole\'s list only covers 400W wall packs.'],
    },
    // "Mini 15W wall packs only for small security lights above doors" — 7-8 ft, no lift.
    mini_wall_pack: {
      label: 'LED mini wall pack (set to 15W)', from: 'security light above a door', led: 15,
      product: { no_lift: 'SMBE 15/20/30W Mini Wallpack' },
      rebate: 'per_watt_reduced', location: 'exterior', never_lift: true, default_height: 8, default_existing: 100,
    },
    // "dome goes to a 25W wall pack". The slim wall pack's settings are
    // 10/20/30/40, so 25 is set at the nearest step up.
    dome: {
      label: 'LED wall pack (25W class, set to 30W)', from: 'MH dome', led: 30,
      product: { lift: 'SMBE 10/20/30/40W Slim Cutoff Wall Pack w/ Lift', no_lift: 'SMBE 10/20/30/40W Slim Cutoff Wall Pack' },
      rebate: 'per_watt_reduced', location: 'exterior', default_existing: 175,
      note: 'A dome goes to "a 25W wall pack"; the slim wall pack steps are 10/20/30/40, so it is set to 30W.',
    },
    // "high bays up to 400W go to a 60W LED high bay"; 750W high bays too.
    high_bay: {
      label: 'LED high bay (set to 60W)', from: 'MH high bay', led: 60,
      product: { no_lift: 'SMBE 50/60/70/90/110W Highbay - 2ft' },
      rebate: 'highbay_tier', location: 'interior', default_existing: 400,
    },
    // "6-lamp T5s go to a full high bay" (it pays more than tubes).
    t5_high_bay: {
      label: 'LED high bay (set to 60W)', from: 'T5HO high bay', led: 60,
      product: { no_lift: 'SMBE 50/60/70/90/110W Highbay - 2ft' },
      rebate: 'highbay_tier', location: 'interior',
    },
    // "T8s go to 4 ft LED tubes" — Type B, one kit per fixture by lamp count.
    // SRP pays tubes as a re-lamp; only TrakSmart has that figure.
    t8_4ft: {
      label: 'LED Type B tubes', from: '4 ft T8', led: { per_lamp: 9, default_lamps: 2 },
      product: { one_lamp: 'SMBE 9W 4FT T8 Type B Tube', lamps: 'SMBE {n}L 9W 4FT T8 Type B Tube', default_lamps: 2 },
      rebate: 'none', location: 'interior',
    },
    t8_8ft: {
      label: 'LED 8 ft tubes', from: '8 ft T8', led: { per_lamp: 43, default_lamps: 1 },
      product: { one_lamp: 'SMBE 1L 43W 8ft Tube 40K', lamps: 'SMBE {n}L 43W 8ft Tube 40K', default_lamps: 1 },
      rebate: 'none', location: 'interior',
    },
  },
}

/** A template that is missing what the engine needs, in words. Empty = usable. */
export function templateProblems(t: Any): string[] {
  const out: string[] = []
  if (!t || typeof t !== 'object') return ['not a template']
  for (const k of ['key', 'name', 'business_unit', 'catalog_type']) if (!String(t[k] || '').trim()) out.push(`${k} is missing`)
  const gm = t.gm || {}
  for (const k of ['mount_price', 'lift_hours_on', 'lift_hours_off']) if (!(Number(gm[k]) >= 0)) out.push(`gm.${k} must be a number`)
  if (!String(gm.lift_product || '').trim()) out.push('gm.lift_product is missing')
  const fx = t.fixtures || {}
  if (!Object.keys(fx).length) out.push('no fixtures')
  for (const [kind, f] of Object.entries(fx) as [string, Any][]) {
    if (!(kind in KIND_LIST)) out.push(`fixtures.${kind}: not a fixture kind`)
    if (!f?.label || !f?.from) out.push(`fixtures.${kind}: label and from are needed`)
    if (!f?.product || !(f.product.no_lift || f.product.one_lamp)) out.push(`fixtures.${kind}: product is needed`)
    if (!['per_watt_reduced', 'highbay_tier', 'none'].includes(f?.rebate)) out.push(`fixtures.${kind}: rebate must be per_watt_reduced, highbay_tier or none`)
    if (!['exterior', 'interior'].includes(f?.location)) out.push(`fixtures.${kind}: location must be exterior or interior`)
    const led = f?.led
    if (!(typeof led === 'number' || Array.isArray(led?.by_existing) || Number(led?.per_lamp) > 0)) out.push(`fixtures.${kind}: led must be watts, by_existing, or per_lamp`)
  }
  return out
}

const KIND_LIST: Record<Kind, true> = { cobra: true, flood: true, wall_pack: true, mini_wall_pack: true, dome: true, high_bay: true, t5_high_bay: true, t8_4ft: true, t8_8ft: true }

export interface CompiledPlaybook {
  key: string; name: string; business_unit: string; catalog_type: string
  gm: PlaybookTemplate['gm']
  rules: Partial<Record<Kind, FixtureRule>>
}

/** A template, made runnable. */
export function compilePlaybook(t: PlaybookTemplate): CompiledPlaybook {
  const rules: Partial<Record<Kind, FixtureRule>> = {}
  for (const [kind, f] of Object.entries(t.fixtures) as [Kind, FixtureTemplate][]) {
    const ledOf = (existing: number, item: TakeoffItem): number => {
      const l: Any = f.led
      if (typeof l === 'number') return l
      if (Array.isArray(l.by_existing)) {
        for (const [upTo, w] of l.by_existing) if (upTo == null || existing <= upTo) return w
        return l.by_existing[l.by_existing.length - 1][1]
      }
      return l.per_lamp * (item.lamps || l.default_lamps || 1)
    }
    const p: Any = f.product
    rules[kind] = {
      label: f.label,
      from: f.from,
      led: ledOf,
      product: (item, lift) => p.one_lamp
        ? ((item.lamps || p.default_lamps || 1) <= 1 ? p.one_lamp : String(p.lamps).replace('{n}', String(item.lamps || p.default_lamps)))
        : (lift && p.lift ? p.lift : p.no_lift),
      ...(f.mount ? { mount: (item: TakeoffItem) => (f.mount!.arm && /arm|flush/i.test(item.mount || '') ? f.mount!.arm! : f.mount!.default), mountRank: f.mount_rank ?? 9 } : {}),
      rebate: f.rebate === 'per_watt_reduced'
        ? (e, l) => Math.max(0, e - l) * SRP_EXTERIOR_PER_WATT
        : f.rebate === 'highbay_tier' ? (e, l) => srpHighBay(e - l) : () => 0,
      interiorOnly: f.location === 'interior',
      exteriorOnly: f.location === 'exterior',
      neverLift: f.never_lift === true,
      defaultHeight: f.default_height,
      defaultExisting: f.default_existing,
      assumption: (item) => {
        if (f.note) return f.note
        const nb = f.note_below_existing
        if (nb && (item.existing_watts ?? f.default_existing ?? 0) < nb[0]) return nb[1].replace('{w}', String(item.existing_watts))
        return null
      },
    }
  }
  return { key: t.key, name: t.name, business_unit: t.business_unit, catalog_type: t.catalog_type, gm: t.gm, rules }
}

export const ENERGY_SCOUT: CompiledPlaybook = compilePlaybook(ENERGY_SCOUT_TEMPLATE)

// ── Reading what the rep said ──────────────────────────────────────────────

const KIND_WORDS: [RegExp, Kind][] = [
  [/mini|security|over (the |a )?door|above (the |a )?door/, 'mini_wall_pack'],
  [/dome/, 'dome'],
  [/wall ?pack|wallpack/, 'wall_pack'],
  [/flood/, 'flood'],
  [/cobra|shoe ?box|pole|parking lot|area light/, 'cobra'],
  [/t5/, 't5_high_bay'],
  [/8 ?(ft|foot|')|eight ?foot/, 't8_8ft'],
  [/t8|t12|tube|troffer|4 ?(ft|foot|')|four ?foot/, 't8_4ft'],
  [/high ?bay|highbay/, 'high_bay'],
]

/** The kind, from an explicit value or the rep's words. */
export function kindOf(raw: Any): Kind | null {
  const k = String(raw?.kind ?? '').toLowerCase().replace(/[\s-]+/g, '_')
  if (k in KIND_LIST) return k as Kind
  const words = `${raw?.kind ?? ''} ${raw?.words ?? ''} ${raw?.fixture ?? ''}`.toLowerCase()
  for (const [re, kind] of KIND_WORDS) if (re.test(words)) return kind
  return null
}

/** Validate the takeoff JSON the model sends. A string is an error to show. */
export function parseTakeoff(raw: unknown, pb: CompiledPlaybook = ENERGY_SCOUT): TakeoffItem[] | string {
  let v: unknown = raw
  // The card stores raw fields JSON-encoded, so a list the model sent as a
  // string arrives encoded twice. Unwrap until it is not a string.
  for (let k = 0; k < 3 && typeof v === 'string'; k++) { try { v = JSON.parse(v) } catch { return 'takeoff must be a list of fixtures' } }
  if (!Array.isArray(v) || !v.length) return 'the takeoff has no fixtures in it'
  if (v.length > 60) return 'that is more than 60 fixture rows — build this one on the Estimates page'
  const out: TakeoffItem[] = []
  for (const [i, x] of v.entries()) {
    const o = (x || {}) as Any
    const kind = kindOf(o)
    if (!kind) return `row ${i + 1} ("${o.words || o.kind || o.fixture || '?'}") is not a fixture I have a rule for — say what it is (cobra, flood, wall pack, mini wall pack, dome, high bay, T5 high bay, 4 ft T8, 8 ft T8)`
    const qty = Number(o.qty ?? o.quantity ?? o.heads)
    if (!Number.isFinite(qty) || qty <= 0 || qty > 5000 || Math.round(qty) !== qty) return `row ${i + 1}: how many heads? ("${o.qty ?? ''}" is not a count)`
    let existing = o.existing_watts == null || o.existing_watts === '' ? undefined : Number(o.existing_watts)
    // "A cobra head marked '10' is treated as 400W existing."
    if (/\b10\b/.test(String(o.marked ?? '')) && kind === 'cobra') existing = 400
    if (existing !== undefined && (!Number.isFinite(existing) || existing <= 0 || existing > 5000)) return `row ${i + 1}: existing watts "${o.existing_watts}" is not usable`
    const rule = pb.rules[kind]
    if (!rule) return `row ${i + 1}: ${pb.name} has no rule for ${kind.replace(/_/g, ' ')} fixtures — build that line on the Estimates page`
    const loc = String(o.location ?? '').toLowerCase()
    const location: 'exterior' | 'interior' = rule.interiorOnly ? 'interior' : rule.exteriorOnly ? 'exterior' : (loc === 'interior' ? 'interior' : 'exterior')
    const lamps = o.lamps == null ? undefined : Number(o.lamps)
    if (lamps !== undefined && (!Number.isFinite(lamps) || lamps < 1 || lamps > 8)) return `row ${i + 1}: lamps "${o.lamps}" is not usable`
    out.push({
      kind, qty, existing_watts: existing, lamps, location,
      no_lift: o.no_lift === true || o.no_lift === 'true' || /no.?lift/i.test(String(o.words ?? '')),
      mount: o.mount ? String(o.mount).toLowerCase() : undefined,
      words: o.words ? String(o.words).slice(0, 160) : undefined,
      area: o.area ? String(o.area).slice(0, 80) : undefined,
      height_ft: o.height_ft == null ? undefined : Number(o.height_ft) || undefined,
    })
  }
  return out
}

// ── Building it ─────────────────────────────────────────────────────────────

function existingWatts(item: TakeoffItem, rule: FixtureRule): number | null {
  if (item.kind === 't8_4ft') return (item.existing_watts && item.existing_watts > 40 ? item.existing_watts : 32 * (item.lamps || 2))
  if (item.kind === 't8_8ft') return (item.existing_watts && item.existing_watts > 75 ? item.existing_watts : 59 * (item.lamps || 1))
  if (item.kind === 't5_high_bay') return item.existing_watts && item.existing_watts > 60 ? item.existing_watts : 54 * (item.lamps || 6)
  return item.existing_watts ?? rule.defaultExisting ?? null
}

const MOUNT_TEXT: Record<string, string> = {
  'MES Cobra Head Mount - Slip Fit': 'Slip fit mount.',
  'MES Cobra Head Mount - Arm Fit': 'Arm fit mount.',
  'MES Cobra Head Mount - Trunnion Fit': 'Trunnion mount.',
}

/**
 * The estimate, line by line.
 *
 * @param rebateGiven  the SRP rebate a rep read off TrakSmart, if they gave one
 *                     — it wins over the estimate, because it is the real one
 */
export function planEstimate(items: TakeoffItem[], catalog: Product[], opts: { rebateGiven?: number | null; state?: string | null; fixtureSubtotal?: number | null; playbook?: CompiledPlaybook | null } = {}): Plan | PlanError {
  const pb = opts.playbook || ENERGY_SCOUT
  const MOUNT_GM_PRICE = pb.gm.mount_price
  const LIFT_PRODUCT = pb.gm.lift_product
  const LIFT_HOURS_ON = pb.gm.lift_hours_on
  const LIFT_HOURS_OFF = pb.gm.lift_hours_off
  // Only the bundle section. A product of the same name elsewhere is not it.
  const book = catalog.filter((p) => !p.type || p.type === pb.catalog_type)
  const find = (name: string) => {
    const hits = book.filter((p) => squash(p.name) === squash(name))
    return hits.length === 1 ? hits[0] : hits.length > 1 ? hits.sort((a, b) => a.id - b.id)[0] : null
  }

  const lines: PlannedLine[] = []
  const assumptions: string[] = []
  let estimate = 0
  let estimateUt = 0
  let unknownRebate = false
  const mounts: { product: string; qty: number; rank: number; height: number }[] = []
  let liftHours = 0

  for (const item of items) {
    const rule = pb.rules[item.kind]
    if (!rule) return { ok: false, error: `${pb.name} has no rule for ${item.kind.replace(/_/g, ' ')} fixtures — build that line on the Estimates page.` }
    const existing = existingWatts(item, rule)
    if (existing == null) return { ok: false, error: `How many watts are the existing ${rule.from} fixtures? I need that to pick the replacement.` }
    const led = rule.led(existing, item)
    // Exterior: 20 ft on a lift unless marked no-lift. Interior: never.
    const onLift = item.location === 'exterior' && !item.no_lift && !rule.neverLift
    const height = item.height_ft || rule.defaultHeight || (item.location === 'exterior' ? (onLift ? 20 : 15) : null)
    const name = rule.product(item, onLift)
    const p = find(name)
    if (!p) return { ok: false, error: `"${name}" is not in the ${pb.catalog_type} section of Products & Services, so I cannot build this to the rules. Add it there (or tell me what replaced it).` }
    const price = money(Number(p.unit_price) || 0)
    if (!price) return { ok: false, error: `"${p.name}" has no price in Products & Services. Set its price and I will build it.` }

    const mountProduct = rule.mount ? rule.mount(item) : null
    // What it was, in the rep's words when they gave some — and ALWAYS with
    // the existing wattage, because the closing check wants it on every line.
    const tube = item.kind === 't8_4ft' || item.kind === 't8_8ft'
    let what = tube
      ? `${item.lamps || (item.kind === 't8_4ft' ? 2 : 1)}-lamp ${rule.from} fixture (${existing}W)`
      : (item.words ? item.words.replace(/^\d+\s*(x|×)\s*/i, '').trim() : rule.from)
    // "400 watt shoeboxes" already says it — live on 10-14 this read
    // "Replace 400W 400 watt shoeboxes" because only "400W" was recognised.
    if (!tube && !/\d+\s*(w|watts?)\b/i.test(what)) what = `${existing}W ${what}`
    const desc = [
      `Replace ${what} with ${led}W ${rule.label.replace(/ \(.*\)$/, '')}.`,
      height ? `${height} ft off the ground, ${onLift ? 'lift' : 'no lift'}.` : 'Interior, no lift.',
      mountProduct ? MOUNT_TEXT[mountProduct] || `Mount: ${mountProduct}.` : '',
      item.area ? `Area: ${item.area}.` : '',
    ].filter(Boolean).join(' ')

    lines.push({ item_name: p.name, item_id: p.id, quantity: item.qty, price, description: desc, in_utility_scope: true, role: 'fixture' })

    const per = rule.rebate(existing, led, item)
    if (per <= 0 && (item.kind === 't8_4ft' || item.kind === 't8_8ft')) unknownRebate = true
    estimate += per * item.qty
    estimateUt += rmpPerFixture(led, item.location) * item.qty
    if (mountProduct) mounts.push({ product: mountProduct, qty: item.qty, rank: rule.mountRank ?? 9, height: height || 0 })
    liftHours += item.qty * (onLift ? LIFT_HOURS_ON : LIFT_HOURS_OFF)
    const a = rule.assumption?.(item)
    if (a) assumptions.push(a)
  }

  // Redoing the GMs on an estimate that already exists: the fixtures as they
  // stand on it now are what the rebate has to cover — someone may have
  // changed a price or a count since it was built, and JobScout is right.
  const productsSubtotal = opts.fixtureSubtotal != null && Number.isFinite(Number(opts.fixtureSubtotal))
    ? money(Number(opts.fixtureSubtotal))
    : money(lines.reduce((s, l) => s + l.quantity * l.price, 0))
  const rebateGiven = opts.rebateGiven != null && Number.isFinite(Number(opts.rebateGiven)) && Number(opts.rebateGiven) > 0 ? money(Number(opts.rebateGiven)) : null
  const ut = /^(ut|utah)$/i.test(String(opts.state || '').trim())
  // Utah has its own incentives: RMP's, per new watt, capped at 75%.
  const rebate = rebateGiven ?? money(ut ? estimateUt : estimate)
  const rebateSource: 'given' | 'estimated' = rebateGiven != null ? 'given' : 'estimated'

  // ── GMs, keeping the customer at $0 ────────────────────────────────────
  // Room = what the rebate covers beyond the products. Mounts first (cobras
  // before floods), whole units; then the lift GM, all of its hours or none.
  //
  // NOT in Utah: RMP pays at most 75% of the project, so the customer always
  // pays a quarter and a GM only raises what they pay. Cole's "$0 out of
  // pocket" cannot hold there — a question for him, not a guess.
  let room = ut ? 0 : money(rebate - productsSubtotal)
  const gmLines: PlannedLine[] = []
  let mountCount = 0
  const byProduct = new Map<string, { qty: number; height: number; rank: number }>()
  for (const m of [...mounts].sort((a, b) => a.rank - b.rank)) {
    let take = 0
    for (let k = 0; k < m.qty; k++) { if (room >= MOUNT_GM_PRICE) { room = money(room - MOUNT_GM_PRICE); take++ } }
    if (!take) continue
    mountCount += take
    const prev = byProduct.get(m.product)
    byProduct.set(m.product, { qty: (prev?.qty || 0) + take, height: m.height, rank: m.rank })
  }
  for (const [product, m] of byProduct) {
    const p = find(product)
    if (!p) return { ok: false, error: `"${product}" (the mount GM) is not in Products & Services.` }
    const kind = product.includes('Trunnion') ? 'Trunnion GM for floods' : product.includes('Arm') ? 'Arm-fit GM for cobra heads' : 'Slip-fit GM for cobra heads'
    gmLines.push({ item_name: p.name, item_id: p.id, quantity: m.qty, price: MOUNT_GM_PRICE, description: `${kind}${m.height ? `, ${m.height} ft` : ''}.`, in_utility_scope: true, role: 'mount_gm' })
  }
  let liftAdded = false
  const lift = find(LIFT_PRODUCT)
  if (lift && liftHours > 0) {
    const liftPrice = money(Number(lift.unit_price) || 49.98)
    const cost = money(liftHours * liftPrice)
    if (room >= cost) {
      room = money(room - cost)
      liftAdded = true
      gmLines.push({ item_name: lift.name.trim(), item_id: lift.id, quantity: liftHours, price: liftPrice, description: `Lift GM — ${LIFT_HOURS_ON} hr per fixture on the lift, ${LIFT_HOURS_OFF} hr per fixture off it.`, in_utility_scope: true, role: 'lift_gm' })
    }
  }

  const gmTotal = money(gmLines.reduce((s, l) => s + l.quantity * l.price, 0))
  const subtotal = money(productsSubtotal + gmTotal)
  const incentive = money(Math.min(rebate, ut ? subtotal * RMP_CAP : subtotal))

  const gmNote = ut
    ? `No GMs: in Utah RMP pays at most ${Math.round(RMP_CAP * 100)}% of the project, so the customer pays at least a quarter and a GM would only add to it.`
    : rebate <= 0
    ? 'No GMs: I have no rebate figure for these fixtures yet (tubes are priced by TrakSmart). Give me the SRP number and I will add the GMs it allows.'
    : gmLines.length === 0
      ? (rebate > productsSubtotal
        ? `No GMs: the ${rebateSource === 'given' ? 'SRP rebate' : 'estimated rebate'} (${usd(rebate)}) leaves only ${usd(rebate - productsSubtotal)} past the fixtures — not enough for a $${MOUNT_GM_PRICE} mount or the lift hours.`
        : `No GMs: the ${rebateSource === 'given' ? 'SRP rebate' : 'estimated rebate'} (${usd(rebate)}) does not cover more than the fixtures (${usd(productsSubtotal)}).`)
      : `GMs added to keep the customer at $0: ${mountCount ? `${mountCount} mount${mountCount === 1 ? '' : 's'} at $77` : 'no mounts'}${liftAdded ? `, then ${liftHours} lift hours` : mounts.length ? ', no room left for the lift GM' : ''}.`
  if (rebateSource === 'estimated' && rebate > 0) {
    assumptions.push(ut
      ? `The incentive is my ESTIMATE from RMP's Small/Medium Business Express rates (${usd(rebate)} uncapped, capped at ${Math.round(RMP_CAP * 100)}% of the project). RMP's own tool gives the real one.`
      : `The rebate is my ESTIMATE from SRP's small-business rates (${usd(rebate)}${unknownRebate ? ', tubes not counted' : ''}). TrakSmart gives the real one — read it to me and I will redo the GMs.`)
  }
  if (ut) assumptions.push('Cole: in Utah should GMs be added at all, given RMP never covers more than 75%? Until you say, I add none.')

  return {
    ok: true,
    lines: [...lines, ...gmLines],
    products_subtotal: productsSubtotal,
    gm_total: gmTotal,
    subtotal,
    rebate,
    rebate_source: rebateSource,
    incentive,
    out_of_pocket: money(subtotal - incentive),
    gm_note: gmNote,
    assumptions,
    business_unit: pb.business_unit,
  }
}

function usd(n: number) {
  return '$' + money(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** The playbook a company uses, from its settings value; null when none. */
/**
 * The playbook a company uses, from its settings value; null when none.
 * Either the key of a built-in one ("energy_scout_lighting"), or a whole
 * template of the company's own — which must pass templateProblems, or it is
 * not used at all (a half-filled template building estimates would be worse
 * than no playbook).
 */
export function playbookFor(settingValue: unknown): CompiledPlaybook | null {
  let v: unknown = settingValue
  if (typeof v === 'string') { try { v = JSON.parse(v) } catch { /* a bare key */ } }
  if (typeof v === 'string') return v === ENERGY_SCOUT.key ? ENERGY_SCOUT : null
  if (v && typeof v === 'object' && (v as Any).fixtures) {
    return templateProblems(v).length ? null : compilePlaybook(v as PlaybookTemplate)
  }
  return (v as Any)?.key === ENERGY_SCOUT.key ? ENERGY_SCOUT : null
}
