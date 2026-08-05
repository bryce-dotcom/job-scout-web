// Product assets (photo, category, spec documents) on an estimate line.
//
// quote_lines joins the product as `item`, so a product's photo arrives at
// line.item.image_url. Every proposal surface reads it off the LINE
// (SolutionSection renders `item.image_url` where `item` is the line itself).
// Nothing bridged the two, so the renderer has been live and empty the whole
// time: 157 products have photos and no customer has ever seen one.
//
// One flattening rule, used by every surface. Writing this twice is how the
// invoice-line builder ended up in five places and the ownership rule in four.
//
// WHAT IS SAFE TO SEND A CUSTOMER
// The portal payload is readable in browser devtools, so it must never carry
// manufacturer, model_number or dlc_listing_number — a DLC listing number is a
// public lookup that names the maker, and model_number embeds it outright
// (MES-PHB-SSRP-110WB1ML1A1). CUSTOMER_SAFE_ASSET_KEYS is the allow-list;
// anything not on it stays server-side.

/** Fields that may cross to a customer-facing surface. */
export const CUSTOMER_SAFE_ASSET_KEYS = ['image_url', 'product_category']

/** Fields that identify the manufacturer and must never reach a customer. */
export const BRAND_IDENTIFYING_KEYS = ['manufacturer', 'model_number', 'dlc_listing_number']

/**
 * Read a product asset off a line, whichever shape the line arrived in.
 * Portal lines carry `item`; some app paths pre-flatten; older rows have
 * neither. Returns null rather than undefined so `x || fallback` is stable.
 */
export function lineAsset(line, key) {
  if (!line || !key) return null
  return line[key] ?? line.item?.[key] ?? null
}

/**
 * Flatten product assets onto a line so proposal surfaces find them without
 * knowing about the join. Never overwrites a value the line already carries —
 * a line-level override is deliberate and outranks the product default.
 */
export function withLineAssets(line, { includeBrand = false } = {}) {
  if (!line) return line
  const keys = includeBrand
    ? [...CUSTOMER_SAFE_ASSET_KEYS, ...BRAND_IDENTIFYING_KEYS]
    : CUSTOMER_SAFE_ASSET_KEYS
  const out = { ...line }
  for (const key of keys) {
    const value = lineAsset(line, key)
    if (out[key] == null && value != null) out[key] = value
  }
  return out
}

/** Same, for a whole set of lines. */
export function withAssets(lines, opts) {
  return (Array.isArray(lines) ? lines : []).map(l => withLineAssets(l, opts))
}

/**
 * True when this line has a photo worth rendering. Guards against the empty
 * strings that a cleared upload field leaves behind, which would otherwise
 * render a broken image on a customer's proposal.
 */
export function hasProductImage(line) {
  const url = lineAsset(line, 'image_url')
  return typeof url === 'string' && url.trim().length > 0
}
