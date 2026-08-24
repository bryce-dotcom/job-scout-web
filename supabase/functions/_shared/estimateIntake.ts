// Estimate intake — ONE way to turn "an agent produced a bid" into a real
// estimate, for Deno and the browser alike.
//
// This rule is currently written three times, and the code says so out loud.
// lenard-save wrote it first. src/components/zach/EstimateModal.jsx says
// "Mirror Lenard: also write to the unified quotes + quote_lines tables".
// src/pages/agents/don/DonTakeoffDetail.jsx says "Mirrors Zach's EstimateModal
// exactly". Three generations of copy, and they have already drifted:
//
//   - Lenard writes business_unit and utility_incentive; the others do not.
//   - Zach and Don set salesperson_id, service_type, estimate_name and
//     summary; Lenard leaves all four null, so Lenard estimates show up
//     unattributed in the pipeline.
//   - Zach and Don advance the lead to "Estimate Sent"; Lenard only links
//     quote_id, so a Lenard lead sits in its old status.
//   - Lenard wrote sort_order 0 on every line, so estimate lines came back in
//     whatever order Postgres felt like.
//   - Worst: Zach and Don console.warn when the quote_lines insert fails, so a
//     quote can exist with ZERO lines and nothing tells anyone.
//
// That last one is the same silent-loss shape as the photos that were saved
// where no viewer read them. A bid with no lines is not a bid.
//
// So this module owns the SHAPE and the INVARIANTS; each caller still does its
// own writes with its own client. Dependency-free on purpose: no Deno globals,
// no npm imports, no framework. Edge functions import it as
// ../_shared/estimateIntake.ts and the app imports the same file through
// src/lib/estimateIntake.js, so there is exactly one implementation.

export function round2(n: unknown): number {
  const v = Number(n)
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0
}

/** One line of a bid, before it becomes a quote_lines row. */
export interface IntakeLine {
  item_name: string
  description?: string | null
  item_id?: number | string | null
  quantity?: number
  price?: number
  /** Omit and it is derived as quantity x price. */
  line_total?: number
  unit_of_measure?: string | null
  kind?: string | null
  /** Defaults true. An explicit false must survive — see extras below. */
  in_utility_scope?: boolean
  /** The field tech's words and photos. First-class, not an afterthought. */
  notes?: string | null
  photos?: unknown[] | null
}

/**
 * Money added on top of the lines: warranties, disposal, travel, M&V.
 * These must arrive as their own lines. Folding them into line prices is
 * what let out-of-scope dollars reach the utility's cap calculation.
 */
export interface IntakeExtra {
  label: string
  amount: number
  in_utility_scope?: boolean
}

export interface EstimateIntake {
  /** Which agent produced this. Recorded so a bad bid can be traced home. */
  source: string
  company_id: number
  lead_id?: number | null
  customer_id?: number | null
  salesperson_id?: number | null
  /**
   * A lighting_audits id, or null. NOT your own source record's id.
   * EstimateDetail reads audit_id as a lighting_audits row without checking
   * audit_type, so a takeoff id here surfaces on the estimate as
   * "Lighting Audit linked (#8)". Link your source record the other way,
   * by writing quote_id onto it.
   */
  audit_id?: number | null
  audit_type?: string | null
  service_type?: string | null
  business_unit?: string | null
  estimate_name?: string | null
  summary?: string | null
  notes?: string | null
  status?: string
  /** The signed/displayed headline. Omit to derive from the lines. */
  quote_amount?: number
  utility_incentive?: number
  lines: IntakeLine[]
  extras?: IntakeExtra[]
}

const num = (v: unknown, d = 0): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

/** Extras, cleaned. Zero-value and malformed entries are dropped. */
export function normalizeExtras(extras?: IntakeExtra[] | null): IntakeExtra[] {
  return (extras || [])
    .filter((e) => e && num(e.amount) !== 0)
    .map((e) => ({
      label: String(e.label || 'Additional item'),
      amount: round2(e.amount),
      in_utility_scope: e.in_utility_scope !== false,
    }))
}

/**
 * The quote_lines rows for this intake, in order.
 *
 * Every invariant here is a bug that actually shipped:
 *   line_total is always present (never left for a viewer to re-derive),
 *   sort_order is always assigned (Lenard wrote 0 on every line),
 *   in_utility_scope defaults true and an explicit false survives,
 *   extras become their own lines rather than inflating a fixture price.
 */
export function intakeLineRows(
  intake: EstimateIntake,
  quoteId: number | string,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = []
  let sort = 0

  for (const l of intake.lines || []) {
    const quantity = num(l.quantity, 1)
    const price = round2(l.price)
    const total = l.line_total == null ? round2(quantity * price) : round2(l.line_total)
    rows.push({
      company_id: intake.company_id,
      quote_id: quoteId,
      item_name: String(l.item_name || 'Item'),
      description: l.description ?? null,
      item_id: l.item_id == null ? null : Number(l.item_id),
      quantity,
      price,
      line_total: total,
      unit_of_measure: l.unit_of_measure ?? null,
      kind: l.kind ?? null,
      in_utility_scope: l.in_utility_scope !== false,
      notes: l.notes ?? null,
      photos: l.photos && l.photos.length ? l.photos : null,
      sort_order: sort++,
    })
  }

  for (const e of normalizeExtras(intake.extras)) {
    rows.push({
      company_id: intake.company_id,
      quote_id: quoteId,
      item_name: e.label,
      description: null,
      item_id: null,
      quantity: 1,
      price: e.amount,
      line_total: e.amount,
      unit_of_measure: null,
      kind: null,
      in_utility_scope: e.in_utility_scope !== false,
      notes: null,
      photos: null,
      sort_order: sort++,
    })
  }

  return rows
}

/** What the lines actually add up to. */
export function intakeLineSum(intake: EstimateIntake): number {
  return intakeLineRows(intake, 0).reduce((s, r) => round2(s + num(r.line_total)), 0)
}

/**
 * The headline. A producer may pass quote_amount when a signed document
 * already shows a number; otherwise it is the sum of the lines.
 */
export function intakeTotal(intake: EstimateIntake): number {
  return intake.quote_amount == null ? intakeLineSum(intake) : round2(intake.quote_amount)
}

/** The quotes row. Fields absent from a given producer stay null, not undefined. */
export function intakeQuoteRow(intake: EstimateIntake): Record<string, unknown> {
  return {
    company_id: intake.company_id,
    lead_id: intake.lead_id ?? null,
    customer_id: intake.customer_id ?? null,
    salesperson_id: intake.salesperson_id ?? null,
    audit_id: intake.audit_id ?? null,
    audit_type: intake.audit_type ?? null,
    service_type: intake.service_type ?? null,
    business_unit: intake.business_unit ?? null,
    estimate_name: intake.estimate_name ?? null,
    summary: intake.summary ?? null,
    notes: intake.notes ?? null,
    quote_amount: intakeTotal(intake),
    utility_incentive: intake.utility_incentive == null ? null : round2(intake.utility_incentive),
    status: intake.status || 'Draft',
  }
}

/**
 * Reasons this intake must not be written. Callers should refuse rather than
 * write half of it — the failure mode being replaced is a quote row with no
 * lines that nobody noticed for weeks.
 */
export function validateIntake(intake: EstimateIntake): string[] {
  const problems: string[] = []
  if (!intake) return ['intake is missing']
  if (!intake.source) {
    problems.push('source is required so a bad bid can be traced to the agent that made it')
  }
  if (!num(intake.company_id)) {
    problems.push('company_id is required (every row is tenant-scoped)')
  }
  if (!Array.isArray(intake.lines) || intake.lines.length === 0) {
    problems.push('an estimate needs at least one line — a quote with no lines is not a bid')
  }
  const lines = Array.isArray(intake.lines) ? intake.lines : []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (!l || !String(l.item_name || '').trim()) problems.push(`line ${i + 1} has no item_name`)
  }
  if (!intake.lead_id && !intake.customer_id) {
    problems.push('lead_id or customer_id is required, or the estimate belongs to nobody')
  }
  return problems
}

/**
 * How far the headline is from the lines. Producers that carry real per-line
 * economics reconcile at 0.00; anything else is surfaced rather than absorbed
 * by scaling every line, which is how estimate lines stopped matching the
 * catalogue in the first place.
 */
export function intakeResidual(intake: EstimateIntake): number {
  return round2(intakeTotal(intake) - intakeLineSum(intake))
}
