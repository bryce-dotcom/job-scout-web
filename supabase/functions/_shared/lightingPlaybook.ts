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

const tubeName = (lamps: number, base: string) => (lamps <= 1 ? base : base.replace(/^SMBE /, `SMBE ${lamps}L `))
const liftName = (name: string, lift: boolean) => (lift ? `${name} w/ Lift` : name)

export const ENERGY_SCOUT: { key: string; name: string; business_unit: string; catalog_type: string; rules: Record<Kind, FixtureRule> } = {
  key: 'energy_scout_lighting',
  name: 'Energy Scout lighting',
  business_unit: 'Energy Scout',
  catalog_type: 'Electrical Services (Bundles)',
  rules: {
    // "400W cobra or shoebox goes to a 60W LED cobra" — and 750W, and anything
    // over 750W, all go to 60W. A cobra marked "10" is a 400W.
    cobra: {
      label: 'LED cobra head', from: 'MH cobra head / shoebox',
      led: () => 60,
      product: (_i, lift) => (lift ? 'SMBE 60/80/100W Cobra Head LOW WATT' : 'SMBE 60/80/100W Cobra Head LOW WATT w/o LIFT'),
      mount: (i) => (/arm|flush/i.test(i.mount || '') ? 'MES Cobra Head Mount - Arm Fit' : 'MES Cobra Head Mount - Slip Fit'),
      mountRank: 0,
      rebate: (e, l) => Math.max(0, e - l) * SRP_EXTERIOR_PER_WATT,
      exteriorOnly: true,
      defaultExisting: 400,
    },
    // 400W flood → 45W; 750W and over → 60W.
    flood: {
      label: 'LED flood', from: 'MH flood',
      led: (e) => (e > 400 ? 60 : 45),
      product: (_i, lift) => liftName('SMBE 25/45/60W Flood', lift),
      mount: () => 'MES Cobra Head Mount - Trunnion Fit',
      mountRank: 1,
      rebate: (e, l) => Math.max(0, e - l) * SRP_EXTERIOR_PER_WATT,
      exteriorOnly: true,
      defaultExisting: 400,
    },
    // 400W wall pack → 30-40W. Set to 30: SRP pays per watt reduced, and the
    // TrakSmart step tests 30 against 40 and keeps whichever pays more.
    wall_pack: {
      label: 'LED wall pack (set to 30W)', from: 'MH wall pack',
      led: () => 30,
      product: (_i, lift) => liftName('SMBE 10/20/30/40W Slim Cutoff Wall Pack', lift),
      rebate: (e, l) => Math.max(0, e - l) * SRP_EXTERIOR_PER_WATT,
      exteriorOnly: true,
      defaultExisting: 400,
      assumption: (i) => ((i.existing_watts ?? 400) < 250
        ? `The ${i.existing_watts}W wall pack is set to 30W like a 400W one — Cole's list only covers 400W wall packs.` : null),
    },
    // "Mini 15W wall packs only for small security lights above doors" — 7-8 ft, no lift.
    mini_wall_pack: {
      label: 'LED mini wall pack (set to 15W)', from: 'security light above a door',
      led: () => 15,
      product: () => 'SMBE 15/20/30W Mini Wallpack',
      rebate: (e, l) => Math.max(0, e - l) * SRP_EXTERIOR_PER_WATT,
      exteriorOnly: true, neverLift: true, defaultHeight: 8, defaultExisting: 100,
    },
    // "dome goes to a 25W wall pack". The slim wall pack's settings are
    // 10/20/30/40, so 25 is set at the nearest step up.
    dome: {
      label: 'LED wall pack (25W class, set to 30W)', from: 'MH dome',
      led: () => 30,
      product: (_i, lift) => liftName('SMBE 10/20/30/40W Slim Cutoff Wall Pack', lift),
      rebate: (e, l) => Math.max(0, e - l) * SRP_EXTERIOR_PER_WATT,
      exteriorOnly: true, defaultExisting: 175,
      assumption: () => 'A dome goes to "a 25W wall pack"; the slim wall pack steps are 10/20/30/40, so it is set to 30W.',
    },
    // "high bays up to 400W go to a 60W LED high bay"; 750W high bays too.
    high_bay: {
      label: 'LED high bay (set to 60W)', from: 'MH high bay',
      led: () => 60,
      product: () => 'SMBE 50/60/70/90/110W Highbay - 2ft',
      rebate: (e, l) => srpHighBay(e - l),
      interiorOnly: true, defaultExisting: 400,
    },
    // "6-lamp T5s go to a full high bay" (it pays more than tubes).
    t5_high_bay: {
      label: 'LED high bay (set to 60W)', from: 'T5HO high bay',
      led: () => 60,
      product: () => 'SMBE 50/60/70/90/110W Highbay - 2ft',
      rebate: (e, l) => srpHighBay(e - l),
      interiorOnly: true,
    },
    // "T8s go to 4 ft LED tubes" — Type B, one kit per fixture by lamp count.
    t8_4ft: {
      label: 'LED Type B tubes', from: '4 ft T8',
      led: (_e, i) => 9 * (i.lamps || 2),
      product: (i) => tubeName(i.lamps || 2, 'SMBE 9W 4FT T8 Type B Tube'),
      // SRP pays tubes as a re-lamp; only TrakSmart has that figure.
      rebate: () => 0,
      interiorOnly: true,
    },
    t8_8ft: {
      label: 'LED 8 ft tubes', from: '8 ft T8',
      led: (_e, i) => 43 * (i.lamps || 1),
      product: (i) => tubeName(i.lamps || 1, 'SMBE 43W 8ft Tube 40K').replace('SMBE 43W', 'SMBE 1L 43W'),
      rebate: () => 0,
      interiorOnly: true,
    },
  },
}

const MOUNT_GM_PRICE = 77
const LIFT_PRODUCT = 'ES LIFT'
const LIFT_HOURS_ON = 2
const LIFT_HOURS_OFF = 1

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
  if (k in ENERGY_SCOUT.rules) return k as Kind
  const words = `${raw?.kind ?? ''} ${raw?.words ?? ''} ${raw?.fixture ?? ''}`.toLowerCase()
  for (const [re, kind] of KIND_WORDS) if (re.test(words)) return kind
  return null
}

/** Validate the takeoff JSON the model sends. A string is an error to show. */
export function parseTakeoff(raw: unknown): TakeoffItem[] | string {
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
    const rule = ENERGY_SCOUT.rules[kind]
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
export function planEstimate(items: TakeoffItem[], catalog: Product[], opts: { rebateGiven?: number | null; state?: string | null; fixtureSubtotal?: number | null } = {}): Plan | PlanError {
  const pb = ENERGY_SCOUT
  // Only the bundle section. A product of the same name elsewhere is not it.
  const book = catalog.filter((p) => !p.type || p.type === pb.catalog_type)
  const find = (name: string) => {
    const hits = book.filter((p) => squash(p.name) === squash(name))
    return hits.length === 1 ? hits[0] : hits.length > 1 ? hits.sort((a, b) => a.id - b.id)[0] : null
  }

  const lines: PlannedLine[] = []
  const assumptions: string[] = []
  let estimate = 0
  let unknownRebate = false
  const mounts: { product: string; qty: number; rank: number; height: number }[] = []
  let liftHours = 0

  for (const item of items) {
    const rule = pb.rules[item.kind]
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
      mountProduct ? MOUNT_TEXT[mountProduct] || '' : '',
      item.area ? `Area: ${item.area}.` : '',
    ].filter(Boolean).join(' ')

    lines.push({ item_name: p.name, item_id: p.id, quantity: item.qty, price, description: desc, in_utility_scope: true, role: 'fixture' })

    const per = rule.rebate(existing, led, item)
    if (per <= 0 && (item.kind === 't8_4ft' || item.kind === 't8_8ft')) unknownRebate = true
    estimate += per * item.qty
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
  // Utah has its own incentives (RMP) — the same concepts, not these numbers.
  const rebate = rebateGiven ?? (ut ? 0 : money(estimate))
  const rebateSource: 'given' | 'estimated' = rebateGiven != null ? 'given' : 'estimated'

  // ── GMs, keeping the customer at $0 ────────────────────────────────────
  // Room = what the rebate covers beyond the products. Mounts first (cobras
  // before floods), whole units; then the lift GM, all of its hours or none.
  let room = money(rebate - productsSubtotal)
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
  const incentive = money(Math.min(rebate, subtotal))

  const gmNote = rebate <= 0
    ? (ut ? 'No GMs: Utah incentives come from RMP, and I have not got that figure — give me the rebate and I will add the GMs it allows.'
      : 'No GMs: I have no rebate figure for these fixtures yet (tubes are priced by TrakSmart). Give me the SRP number and I will add the GMs it allows.')
    : gmLines.length === 0
      ? (rebate > productsSubtotal
        ? `No GMs: the ${rebateSource === 'given' ? 'SRP rebate' : 'estimated rebate'} (${usd(rebate)}) leaves only ${usd(rebate - productsSubtotal)} past the fixtures — not enough for a $${MOUNT_GM_PRICE} mount or the lift hours.`
        : `No GMs: the ${rebateSource === 'given' ? 'SRP rebate' : 'estimated rebate'} (${usd(rebate)}) does not cover more than the fixtures (${usd(productsSubtotal)}).`)
      : `GMs added to keep the customer at $0: ${mountCount ? `${mountCount} mount${mountCount === 1 ? '' : 's'} at $77` : 'no mounts'}${liftAdded ? `, then ${liftHours} lift hours` : mounts.length ? ', no room left for the lift GM' : ''}.`
  if (rebateSource === 'estimated' && rebate > 0) {
    assumptions.push(`The rebate is my ESTIMATE from SRP's small-business rates (${usd(rebate)}${unknownRebate ? ', tubes not counted' : ''}). TrakSmart gives the real one — read it to me and I will redo the GMs.`)
  }

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
export function playbookFor(settingValue: unknown): typeof ENERGY_SCOUT | null {
  let v: unknown = settingValue
  if (typeof v === 'string') { try { v = JSON.parse(v) } catch { /* a bare key */ } }
  const key = typeof v === 'string' ? v : (v as Any)?.key
  return key === ENERGY_SCOUT.key ? ENERGY_SCOUT : null
}
