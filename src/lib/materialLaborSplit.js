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
