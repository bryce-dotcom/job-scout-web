/**
 * How many units of the REPLACEMENT product a retrofit line actually buys.
 *
 * An area named "4-Lamp T5 4ft High Bay" describes what is coming DOWN. It
 * says nothing about what goes UP. If the replacement is a single LED
 * highbay, thirty of those fixtures need thirty highbays — not a hundred
 * and twenty. Lenard was reading the lamp count off the EXISTING fixture
 * and multiplying the REPLACEMENT product's price by it, which priced one
 * test project at $67,198.60 against a true catalogue cost of $20,549.90.
 *
 * The multiplier is not wrong in itself — the catalogue genuinely sells
 * both. "MID 4L T8 4ft Per Lamp" at $15.50 is a single tube, and a 4-lamp
 * fixture really does need four of them. "SMBE 90/110/130/150/165W Highbay
 * - 2ft LIFT" at $434.98 is one whole fixture, installed. What was wrong is
 * the trigger: the pricing basis is a property of the product you chose,
 * never of the fixture you are removing.
 *
 * So the multiplier requires positive evidence from the product and
 * defaults to per-fixture without it. A missing or unknown flag can only
 * ever under-count units, never inflate a customer's price or the
 * incentive cap that is derived from it.
 */

// Priced per lamp: the catalogue says so in the product name, either
// explicitly ("... Per Lamp") or as the trailing noun ("MID 1L 8ft Lamp").
const PER_LAMP_NAME = /(\bper\s*lamps?\b|\blamps?\s*$)/i

// Names that carry "lamp" as hardware rather than a pricing basis. The
// positive pattern above is the real signal; this only stops an ambiguous
// name from silently multiplying a price.
const LAMP_AS_HARDWARE = /\blamp\s*(post|holder|socket|guard|shield)\b/i

/**
 * Is this product priced per lamp rather than per fixture?
 * Accepts a product row or a bare name.
 */
export function productPricedPerLamp(product) {
  const name = typeof product === 'string' ? product : (product?.name || '')
  if (!name) return false
  if (LAMP_AS_HARDWARE.test(name)) return false
  return PER_LAMP_NAME.test(name)
}

/**
 * Units of the replacement product to price and order for this line.
 * Multiplies by lamps only with positive evidence that the product is
 * sold per lamp (line.pricedPerLamp, stamped when the product is chosen).
 */
export function orderQty(line) {
  const qty = line?.qty || 0
  const lamps = line?.lampsPerFixture || 0
  if (line?.retrofitType === 'lamp' && lamps > 1 && line?.pricedPerLamp) return qty * lamps
  return qty
}

/**
 * Physical lamps on the line — what actually gets relamped. Maintenance
 * math counts lamps, not products, so this stays independent of how the
 * replacement happens to be priced.
 */
export function lampCount(line) {
  const qty = line?.qty || 0
  const lamps = line?.lampsPerFixture || 0
  if (line?.retrofitType === 'lamp' && lamps > 1) return qty * lamps
  return qty
}
