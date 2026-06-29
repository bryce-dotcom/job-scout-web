// Derive a job's business unit (division) from the TYPE OF WORK:
//   lighting / electrical            -> Energy Scout
//   window / exterior cleaning, etc. -> HHH Building Services
//
// HHH never populated products_services.business_unit, so we classify by the
// product `type` field (well-populated: "Electrical", "Window Cleaning", …)
// and fall back to text keywords (job title / product name) for jobs created
// without an estimate to look at.

export const BU_ENERGY = 'Energy Scout'
export const BU_BUILDING = 'HHH Building Services'

// A product `type` (or a service_type) -> BU. Cleaning is checked first so a
// "window cleaning" type never trips a stray "electric"-ish match.
export function classifyType(type) {
  if (!type) return null
  const t = String(type).toLowerCase()
  if (/clean|window|exterior|janitor|pressure|power.?wash|maint/.test(t)) return BU_BUILDING
  if (/electric|energy|light|led|highbay|retrofit|fixture|lamp|lenard|ballast/.test(t)) return BU_ENERGY
  return null
}

// Free text (job title / product name) -> BU.
export function classifyText(text) {
  if (!text) return null
  const t = String(text).toLowerCase()
  if (/window|cleaning|janitor|pressure wash|power wash|exterior|awning|gutter/.test(t)) return BU_BUILDING
  if (/\blight|led\b|highbay|fixture|retrofit|lamp|electric|\bmes\b|smbe|wrap|strip|kelvin|watt|ballast|energy scout|energy|utility|rebate/.test(t)) return BU_ENERGY
  return null
}

// Majority vote across a set of products (each {type, name, suggest_in_lenard}).
// A tie returns null — better to leave it blank than guess wrong.
export function deriveFromProducts(products = []) {
  let energy = 0, building = 0
  for (const p of products || []) {
    if (p?.suggest_in_lenard) { energy++; continue }
    const bu = classifyType(p?.type) || classifyText(p?.name)
    if (bu === BU_ENERGY) energy++
    else if (bu === BU_BUILDING) building++
  }
  if (energy > building) return BU_ENERGY
  if (building > energy) return BU_BUILDING
  return null
}

// Top-level: products first (most reliable), then free text (job title).
export function deriveBusinessUnit({ products = [], text = '' } = {}) {
  return deriveFromProducts(products) || classifyText(text)
}
