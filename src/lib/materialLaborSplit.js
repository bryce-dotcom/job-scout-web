// Compute the materials-vs-labor breakdown of an invoice from its line
// items + bundle component classifications.
//
// For each line:
//   - Walk the line item's components in product_components
//   - Sum the costs of components labeled 'material' vs 'labor'
//   - Apply the cost-side ratio to the line's selling price (this covers
//     the markup proportionally so material + labor = line total)
//   - If ANY component is unclassified, that line falls back to 70/30
//
// Inputs are plain objects so this helper works server-side (edge function)
// and client-side (React pages) without modification.
//
//   lines:      [{ item_id, line_total, quantity }, ...]   // invoice_lines rows
//   components: [{ parent_product_id, component_product_id, quantity }, ...]
//   products:   [{ id, cost, material_or_labor }, ...]      // products_services rows
//
// Returns:
//   { materials, labor, total, fallbackLineCount, totalLineCount }

const FALLBACK_MATERIAL_PCT = 0.7
const FALLBACK_LABOR_PCT = 0.3

// Single entry point for "what Materials/Labor numbers does this invoice
// show?" — every renderer (invoice page box, PDF totals, customer portal
// via the edge function) must go through this so a manual override entered
// on the invoice wins EVERYWHERE, not just on one surface. Alayda typed
// Parts/Labor on INV-MQ8C2T1X and the breakdown box kept showing the
// computed 70/30 numbers — this is the fix.
//
// Returns the computeMaterialLaborSplit shape plus `source`:
//   'manual'   — parts_total_override + labor_total_override (both set)
//   'computed' — per-line component classification (with 70/30 fallback)
export function resolveMatLabSplit(invoice, lines, components, products) {
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

export function computeMaterialLaborSplit(lines, components, products) {
  const productMap = new Map((products || []).map(p => [p.id, p]))
  const componentsByParent = new Map()
  for (const c of components || []) {
    const arr = componentsByParent.get(c.parent_product_id) || []
    arr.push(c)
    componentsByParent.set(c.parent_product_id, arr)
  }

  let materials = 0
  let labor = 0
  let fallbackLineCount = 0
  const totalLineCount = (lines || []).length

  for (const line of lines || []) {
    const lineTotal = Number(line.line_total) || 0
    if (lineTotal === 0) continue

    const lineMatLab = classifyLine(line.item_id, productMap, componentsByParent)
    if (lineMatLab.unclassified || lineMatLab.totalCost === 0) {
      materials += lineTotal * FALLBACK_MATERIAL_PCT
      labor += lineTotal * FALLBACK_LABOR_PCT
      fallbackLineCount++
    } else {
      const matPct = lineMatLab.materialCost / lineMatLab.totalCost
      materials += lineTotal * matPct
      labor += lineTotal * (1 - matPct)
    }
  }

  return {
    materials: round2(materials),
    labor: round2(labor),
    total: round2(materials + labor),
    fallbackLineCount,
    totalLineCount,
  }
}

// Classify a single line by walking its components.
// Returns { materialCost, laborCost, totalCost, unclassified }.
function classifyLine(itemId, productMap, componentsByParent) {
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
  // If we summed material+labor, totalCost = mat+lab. If we recursed, also add
  // those costs. Always recompute as the sum.
  result.totalCost = result.materialCost + result.laborCost
  return result
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

// Per-line Parts/Labor split for the summary-format invoice PDF.
// Hierarchy (highest priority first):
//   1) line.labor_cost > 0 → real recorded split: parts = total - labor_cost
//   2) item.type === Service|Labor → whole line is labor
//   3) bundle/product component walk → split line_total by classified
//      material vs labor cost ratio (this catches bundles where labor is
//      priced into the bundle's component list rather than on the line)
//   4) fallback: all parts
//
// `productMap` + `componentsByParent` come from the same source as
// computeMaterialLaborSplit; pass empty Map()s when component data isn't
// loaded and the function will skip the bundle branch.
//
//   line: { item_id, line_total, labor_cost, item: { type } }
export function splitLinePartsLabor(line, productMap, componentsByParent) {
  const total = Number(line.line_total ?? line.total) || 0
  if (total === 0) return { parts: 0, labor: 0 }

  const recordedLabor = Number(line.labor_cost) || 0
  if (recordedLabor > 0) {
    return { parts: Math.max(0, total - recordedLabor), labor: recordedLabor }
  }

  const type = (line.item?.type || '').toLowerCase()
  if (type === 'service' || type === 'labor') {
    return { parts: 0, labor: total }
  }

  // Bundle walk — catches the common case where a line is a bundle
  // and the labor lives inside the bundle's components.
  if (line.item_id && componentsByParent && componentsByParent.size > 0) {
    const breakdown = classifyLine(line.item_id, productMap || new Map(), componentsByParent)
    if (!breakdown.unclassified && breakdown.totalCost > 0) {
      const matPct = breakdown.materialCost / breakdown.totalCost
      return {
        parts: round2(total * matPct),
        labor: round2(total * (1 - matPct)),
      }
    }
  }

  return { parts: total, labor: 0 }
}
