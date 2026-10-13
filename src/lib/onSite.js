// Was the tech at the job?
//
// HR had a complaint about a tech clocking hours to jobs he was not at
// (Bryce, 13 Oct 2026). Opening his location trail did not settle it: the map
// draws the clock-in, the pings and the clock-out, and nothing else — a
// handful of dots floating on a street map with no job on it and no distance
// written anywhere. You cannot tell "he was on site" from "he was 20 miles
// away" by eye when the map auto-zooms to fit whatever dots there are.
//
// This answers the question that was actually asked. The jobs already carry
// coordinates (6,417 of HHH's 7,171), so every point of a shift can be
// measured against the site.
//
// It will not accuse anybody on bad data. Two guards:
//   * no coordinates, or no points, is "unknown" — never "away";
//   * a job whose own pin is unreliable is called out as such. "AZ Fix it
//     auto" has the address "1625 w sunrise blvd" with no city, which
//     geocoded to Salt Lake City; its pings read 495 miles away while the
//     tech was in Arizona the whole time. A tool that reports that as
//     absence is worse than no tool.

// Number(null) is 0, and 0 is a real latitude in the Atlantic — so a row
// with no coordinate would read as a point off the coast of Africa and every
// distance from it as "away". Reject anything that is not actually a number.
const num = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Miles between two {lat,lng}. Haversine — good to a few feet at this range. */
export function milesBetween(a, b) {
  if (!a || !b) return null
  const lat1 = num(a.lat), lng1 = num(a.lng), lat2 = num(b.lat), lng2 = num(b.lng)
  if ([lat1, lng1, lat2, lng2].some(v => v === null)) return null
  const R = 3958.7613
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLng = (lng2 - lng1) * rad
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

/**
 * Does this job's address look too thin to have geocoded properly?
 *
 * A street line with no city, state or postcode geocodes to whatever the
 * provider guesses — in practice the tenant's own home town, hundreds of
 * miles from the work (see [[project_liahona_map]]: city-less addresses
 * anchor to the tenant home).
 */
const STATE_CODES = new Set(['al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'fl', 'ga', 'hi', 'id', 'il', 'in', 'ia', 'ks', 'ky', 'la', 'me', 'md', 'ma', 'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv', 'nh', 'nj', 'nm', 'ny', 'nc', 'nd', 'oh', 'ok', 'or', 'pa', 'ri', 'sc', 'sd', 'tn', 'tx', 'ut', 'vt', 'va', 'wa', 'wv', 'wi', 'wy', 'dc'])

export function jobPinLooksThin(job) {
  const addr = String(job?.job_address || job?.address || '').trim()
  if (!addr) return true
  if (addr.includes(',')) return false              // "street, city, ST" shape
  if (/\b\d{5}(-\d{4})?\b/.test(addr)) return false // has a postcode
  // A state code, however it was typed. Matching any two letters would read
  // "rd" as a state and call every street address complete; matching only
  // capitals missed "748 e broadway rd phx az", a perfectly good Phoenix
  // address — and that was the one shift HR was actually asking about, so it
  // came back "cannot tell" instead of 22 miles away.
  if (addr.toLowerCase().split(/[^a-z]+/).some(w => STATE_CODES.has(w))) return false
  return true
}

const r2 = (n) => (n == null ? null : Math.round(n * 100) / 100)

/**
 * The verdict for one shift.
 *
 * @param job     the job row (latitude, longitude, job_address, job_title)
 * @param points  [{lat, lng, type}] — clock-in, every ping, clock-out
 * @param radiusMiles  how close counts as "at the job". A quarter mile covers
 *                     a big site, a parking lot and ordinary phone drift
 *                     (these fixes are taken with enableHighAccuracy off).
 * @returns {{ status, nearestMiles, farthestMiles, onSiteCount, pointCount,
 *             headline, detail }}
 *          status: 'on_site' | 'away' | 'unknown' | 'job_pin_unreliable'
 */
export function shiftOnSite({ job, points = [], radiusMiles = 0.25 } = {}) {
  const usable = (points || []).filter(p => num(p?.lat) !== null && num(p?.lng) !== null)
  const jobPoint = job && num(job.latitude) !== null && num(job.longitude) !== null
    ? { lat: num(job.latitude), lng: num(job.longitude) }
    : null

  if (!job) {
    return { status: 'unknown', nearestMiles: null, farthestMiles: null, onSiteCount: 0, pointCount: usable.length,
      headline: 'No job on this shift', detail: 'Nothing to measure against — the hours are not booked to a job.' }
  }
  if (!jobPoint) {
    return { status: 'unknown', nearestMiles: null, farthestMiles: null, onSiteCount: 0, pointCount: usable.length,
      headline: 'This job has no location', detail: 'Add an address to the job and the next shift can be checked against it.' }
  }
  if (usable.length === 0) {
    return { status: 'unknown', nearestMiles: null, farthestMiles: null, onSiteCount: 0, pointCount: 0,
      headline: 'No location on this shift', detail: 'The phone never reported a position — location may be off for this employee.' }
  }

  const distances = usable.map(p => milesBetween(p, jobPoint)).filter(d => d != null)
  const nearest = Math.min(...distances)
  const farthest = Math.max(...distances)
  const onSiteCount = distances.filter(d => d <= radiusMiles).length
  const miles = (d) => (d < 0.1 ? `${Math.round(d * 5280)} ft` : `${r2(d)} mi`)

  if (onSiteCount > 0) {
    return {
      status: 'on_site', nearestMiles: r2(nearest), farthestMiles: r2(farthest), onSiteCount, pointCount: usable.length,
      headline: `At the job — ${onSiteCount} of ${usable.length} fix${usable.length === 1 ? '' : 'es'} within ${miles(radiusMiles)}`,
      detail: `Closest ${miles(nearest)} from the site.`,
    }
  }

  // Nothing near the site. Before calling that absence, ask whether the JOB's
  // own pin can be trusted.
  if (jobPinLooksThin(job)) {
    return {
      status: 'job_pin_unreliable', nearestMiles: r2(nearest), farthestMiles: r2(farthest), onSiteCount: 0, pointCount: usable.length,
      headline: 'Cannot tell — the job location looks wrong',
      detail: `The address "${String(job.job_address || job.address || '').trim() || '(blank)'}" has no city or state, so its pin is a guess. Every fix on this shift is ${miles(nearest)}+ from it. Fix the job address before reading anything into this.`,
    }
  }

  return {
    status: 'away', nearestMiles: r2(nearest), farthestMiles: r2(farthest), onSiteCount: 0, pointCount: usable.length,
    headline: `Never closer than ${miles(nearest)} to the job`,
    detail: `${usable.length} location${usable.length === 1 ? '' : 's'} on this shift, the nearest ${miles(nearest)} away.`,
  }
}

/** Colour for the verdict, matching the app's semantic palette. */
export function onSiteColor(status, theme = {}) {
  if (status === 'on_site') return '#22c55e'
  if (status === 'away') return '#ef4444'
  if (status === 'job_pin_unreliable') return '#eab308'
  return theme.textMuted || '#7d8a7f'
}
