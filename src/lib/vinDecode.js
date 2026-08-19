// VIN -> make, model, year, and the asset class the lifecycle maths needs.
//
// The lifecycle bar is only as good as the acquisition data behind it, and
// nobody is going to hand-type make, model, year and category for forty
// machines. For anything road-legal the VIN already encodes all of it, and
// the US government decodes it for free.
//
// NHTSA vPIC: no key, no quota, and Access-Control-Allow-Origin: *, so the
// browser calls it directly. It also decodes VINs whose check digit is wrong,
// returning ErrorCode 1 alongside perfectly good data — which matters,
// because plenty of real VINs get transcribed with a typo and refusing them
// outright would send the user back to typing everything by hand.
//
// Off-road iron has no VIN. That path is the data plate, read by vision.

const VPIC = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues'

// I, O and Q are excluded from the VIN alphabet precisely because they are
// confusable with 1 and 0 — which is what makes them worth checking for
// rather than passing straight to the API.
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i

export function normalizeVin(raw) {
  return String(raw || '').trim().toUpperCase().replace(/[\s-]/g, '')
}

export function isPlausibleVin(raw) {
  return VIN_RE.test(normalizeVin(raw))
}

/** Why a VIN was rejected, in words a user can act on. */
export function vinProblem(raw) {
  const v = normalizeVin(raw)
  if (!v) return 'Enter a VIN.'
  if (v.length !== 17) return `A VIN is 17 characters — this one is ${v.length}.`
  if (/[IOQ]/.test(v)) return 'VINs never contain I, O or Q. Check for a 1 or a 0.'
  if (!VIN_RE.test(v)) return 'That contains characters a VIN cannot have.'
  return null
}

/**
 * Map what vPIC reports onto our closed asset_class vocabulary.
 *
 * vPIC describes vehicles far more finely than the lifecycle curves need, and
 * the fields disagree with each other: a service truck is BodyClass "Pickup"
 * with a utility body, and a dump truck is "Truck" like everything else. So
 * body class decides first, and gross weight breaks the ties — weight is what
 * actually separates a pickup from a box truck, both in how it is used and in
 * how it depreciates.
 */
export function assetClassFromDecode(d = {}) {
  const body = String(d.BodyClass || '').toLowerCase()
  const type = String(d.VehicleType || '').toLowerCase()
  const gvwr = String(d.GVWR || '')

  // "Class 2F: 7,001 - 8,000 lb" -> 2
  const classNum = Number((gvwr.match(/Class\s*(\d+)/i) || [])[1]) || null

  if (body.includes('trailer') || type.includes('trailer')) return 'trailer'
  if (body.includes('van')) return 'van'

  if (body.includes('pickup')) {
    // A one-ton-plus pickup carrying a service body is a different asset with
    // a different life to a half-ton, even though vPIC calls both "Pickup".
    return classNum && classNum >= 3 ? 'service_truck' : 'pickup'
  }

  if (body.includes('dump')) return 'dump_truck'
  if (body.includes('truck') || type.includes('truck')) {
    if (classNum && classNum >= 7) return 'dump_truck'
    if (classNum && classNum >= 4) return 'box_truck'
    return 'pickup'
  }

  if (type.includes('bus') || type.includes('multipurpose') || body.includes('sport utility')) return 'van'
  return 'other'
}

/**
 * Decode a VIN. Never throws: a failed lookup returns a reason, because the
 * caller's fallback is always "let them type it in".
 */
export async function decodeVin(rawVin, { fetchImpl = fetch, signal } = {}) {
  const vin = normalizeVin(rawVin)
  const problem = vinProblem(vin)
  if (problem) return { ok: false, error: problem }

  let json
  try {
    const res = await fetchImpl(`${VPIC}/${encodeURIComponent(vin)}?format=json`, { signal })
    if (!res.ok) return { ok: false, error: `Lookup failed (${res.status}). Enter the details by hand.` }
    json = await res.json()
  } catch (err) {
    if (err?.name === 'AbortError') return { ok: false, error: 'cancelled', aborted: true }
    return { ok: false, error: 'Could not reach the VIN service. Enter the details by hand.' }
  }

  const r = json?.Results?.[0]
  if (!r) return { ok: false, error: 'No result for that VIN.' }

  // vPIC answers 200 with empty fields for a VIN it cannot place. Make is the
  // tell: without it nothing downstream is usable.
  if (!r.Make) {
    return { ok: false, error: r.ErrorText && !/check digit/i.test(r.ErrorText)
      ? `Not recognised: ${String(r.ErrorText).replace(/^\d+\s*-\s*/, '')}`
      : 'That VIN could not be decoded. Enter the details by hand.' }
  }

  // A bad check digit is reported alongside good data. Surfaced as a warning
  // rather than a rejection: it usually means one mistyped character, and the
  // decode is still right about make, model and year.
  const checkDigit = /check digit/i.test(String(r.ErrorText || ''))

  const year = Number(r.ModelYear) || null
  return {
    ok: true,
    vin,
    make: r.Make || null,
    model: r.Model || null,
    modelYear: year && year > 1900 && year < 2100 ? year : null,
    assetClass: assetClassFromDecode(r),
    meterBasis: 'miles',        // anything with a VIN is valued on miles
    bodyClass: r.BodyClass || null,
    vehicleType: r.VehicleType || null,
    gvwr: r.GVWR || null,
    driveType: r.DriveType || null,
    fuelType: r.FuelTypePrimary || null,
    manufacturer: r.Manufacturer || null,
    warning: checkDigit
      ? 'Check digit does not match — the VIN may have a typo, but the details below decoded fine.'
      : null,
    raw: r,
  }
}

export default decodeVin
