// The Material/Labor split — ONE definition, for Deno and the browser alike.
//
// This lived in two places: src/lib/materialLaborSplit.js and a hand-copied
// computeMaterialLaborSplit inside get-portal-document, under a comment
// reading "keep the two in sync". That comment was the bug. Alayda has
// reported the summary invoice showing unsplit descriptions repeatedly, and
// every pass fixed one surface and left the others — the same way the invoice
// line builder reached five copies and the job-ownership rule four.
//
// It also fixes the wording. The rule is not just the numbers: the customer
// summary must read "Material" and "Labor". The utility copy said Material,
// the customer PDF said Parts, and the portal said neither.
//
// Dependency-free on purpose: no Deno globals, no npm imports, no framework.
// The edge function imports it as ../_shared/matLabCore.ts and the app imports
// the same file through src/lib/materialLaborSplit.js, so there is exactly one
// implementation and no way for them to drift again.

const FALLBACK_MATERIAL_PCT = 0.7

/** The two words the customer sees. Not a setting — Alayda asked for these. */
export const SUMMARY_ROW_LABELS = { materials: 'Material', labor: 'Labor' }

export interface MatLabSplit {
  materials: number
  labor: number
  total: number
  fallbackLineCount: number
  totalLineCount: number
  source?: 'manual' | 'computed'
}

type Line = { item_id?: number | null; line_total?: number | null; total?: number | null; labor_cost?: number | null; item?: { type?: string | null } | null }
type Component = { parent_product_id: number; component_product_id: number; quantity?: number | null }
type Product = { id: number; cost?: number | null; material_or_labor?: string | null }

export function round2(n: unknown): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

/**
 * Single entry point for "what Materials/Labor numbers does this invoice
 * show?" A manual override entered on the invoice wins EVERYWHERE, not just
 * on the one surface someone remembered to update.
 */
export function resolveMatLabSplit(
  invoice: { parts_total_override?: number | null; labor_total_override?: number | null } | null | undefined,
  lines?: Line[] | null,
  components?: Component[] | null,
  products?: Product[] | null,
): MatLabSplit {
  const partsOv = invoice?.parts_total_override
  const laborOv = invoice?.labor_total_override
  if (partsOv != null && laborOv != null) {
    const materials = round2(partsOv)
    const labor = round2(laborOv)
    return {
      materials,
      labor,
      total: round2(materials + labor),
      fallbackLineCount: 0,
      totalLineCount: (lines || []).length,
      source: 'manual',
    }
  }
  return { ...computeMaterialLaborSplit(lines, components, products), source: 'computed' }
}

export function computeMaterialLaborSplit(
  lines?: Line[] | null,
  components?: Component[] | null,
  products?: Product[] | null,
): MatLabSplit {
  const productMap = new Map<number, Product>((products || []).map(p => [p.id, p]))
  const componentsByParent = new Map<number, Component[]>()
  for (const c of components || []) {
    const arr = componentsByParent.get(c.parent_product_id) || []
    arr.push(c)
    componentsByParent.set(c.parent_product_id, arr)
  }

  let materials = 0
  let includedTotal = 0
  let fallbackLineCount = 0
  const totalLineCount = (lines || []).length

  for (const line of lines || []) {
    const lineTotal = Number(line.line_total) || 0
    if (lineTotal === 0) continue
    includedTotal += lineTotal

    const lineMatLab = classifyLine(line.item_id, productMap, componentsByParent)
    if (lineMatLab.unclassified || lineMatLab.totalCost === 0) {
      materials += lineTotal * FALLBACK_MATERIAL_PCT
      fallbackLineCount++
    } else {
      materials += lineTotal * (lineMatLab.materialCost / lineMatLab.totalCost)
    }
  }

  // Residual rounding: round materials, derive labor by subtraction so
  // materials + labor ALWAYS equals the (rounded) line total. Rounding both
  // halves independently drifted a cent when both landed on .xx5 (Alayda's
  // INV-MQ8CSSU5: 2,711.205 + 1,161.945 → 3,873.16 on a $3,873.15 invoice).
  const roundedTotal = round2(includedTotal)
  const roundedMaterials = round2(materials)
  const roundedLabor = Math.max(0, round2(roundedTotal - roundedMaterials))

  return {
    materials: roundedMaterials,
    labor: roundedLabor,
    total: round2(roundedMaterials + roundedLabor),
    fallbackLineCount,
    totalLineCount,
  }
}

/** Classify a single line by walking its components. */
function classifyLine(
  itemId: number | null | undefined,
  productMap: Map<number, Product>,
  componentsByParent: Map<number, Component[]>,
): { materialCost: number; laborCost: number; totalCost: number; unclassified: boolean } {
  const result = { materialCost: 0, laborCost: 0, totalCost: 0, unclassified: false }
  if (!itemId) { result.unclassified = true; return result }

  const product = productMap.get(itemId)
  const children = componentsByParent.get(itemId) || []

  if (children.length === 0) {
    // Leaf product — classify directly
    if (!product) { result.unclassified = true; return result }
    const cost = Number(product.cost) || 0
    if (product.material_or_labor === 'material') result.materialCost = cost
    else if (product.material_or_labor === 'labor') result.laborCost = cost
    else result.unclassified = true
    result.totalCost = cost
    return result
  }

  // Bundle — sum classified component costs
  for (const c of children) {
    const subId = c.component_product_id
    const sub = productMap.get(subId)
    if (!sub) { result.unclassified = true; continue }
    const subCost = (Number(sub.cost) || 0) * (Number(c.quantity) || 1)

    if (sub.material_or_labor === 'material') {
      result.materialCost += subCost
    } else if (sub.material_or_labor === 'labor') {
      result.laborCost += subCost
    } else {
      // Recurse one level — sub-bundle of a bundle
      const subBreakdown = classifyLine(subId, productMap, componentsByParent)
      if (subBreakdown.unclassified) result.unclassified = true
      result.materialCost += subBreakdown.materialCost * (Number(c.quantity) || 1)
      result.laborCost += subBreakdown.laborCost * (Number(c.quantity) || 1)
      continue
    }
    result.totalCost += subCost
  }
  result.totalCost = result.materialCost + result.laborCost
  return result
}

/**
 * Per-line Parts/Labor split for the summary-format invoice PDF.
 * Hierarchy: recorded labor_cost → service/labor item type → bundle component
 * walk → fallback all parts.
 */
export function splitLinePartsLabor(
  line: Line,
  productMap?: Map<number, Product> | null,
  componentsByParent?: Map<number, Component[]> | null,
): { parts: number; labor: number } {
  const total = Number(line.line_total ?? line.total) || 0
  if (total === 0) return { parts: 0, labor: 0 }

  const recordedLabor = Number(line.labor_cost) || 0
  if (recordedLabor > 0) {
    return { parts: round2(Math.max(0, total - recordedLabor)), labor: round2(recordedLabor) }
  }

  const type = (line.item?.type || '').toLowerCase()
  if (type === 'service' || type === 'labor') {
    return { parts: 0, labor: total }
  }

  if (line.item_id && componentsByParent && componentsByParent.size > 0) {
    const breakdown = classifyLine(line.item_id, productMap || new Map(), componentsByParent)
    if (!breakdown.unclassified && breakdown.totalCost > 0) {
      const parts = round2(total * (breakdown.materialCost / breakdown.totalCost))
      return { parts, labor: Math.max(0, round2(total - parts)) }
    }
  }

  return { parts: total, labor: 0 }
}

/**
 * The two rows a summary-format invoice shows the customer, in place of the
 * raw scope text. This is the part that was missing entirely from the portal:
 * the totals object was correct, but the customer only ever saw the line
 * descriptions, so the invoice read as un-split.
 *
 * Returns [] when there is nothing to show, so a caller can fall back to the
 * normal line list rather than rendering two zero rows.
 */
export function buildSummaryRows(
  invoice: { parts_total_override?: number | null; labor_total_override?: number | null } | null | undefined,
  lines?: Line[] | null,
  components?: Component[] | null,
  products?: Product[] | null,
): Array<{ description: string; quantity: number; unit_price: number; line_total: number; sort_order: number }> {
  const split = resolveMatLabSplit(invoice, lines, components, products)
  if (!split || (split.materials === 0 && split.labor === 0)) return []
  return [
    { description: SUMMARY_ROW_LABELS.materials, quantity: 1, unit_price: split.materials, line_total: split.materials, sort_order: 0 },
    { description: SUMMARY_ROW_LABELS.labor, quantity: 1, unit_price: split.labor, line_total: split.labor, sort_order: 1 },
  ]
}
