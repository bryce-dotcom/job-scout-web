// A picture of a property from above, free and without a key.
//
// Bryce asked whether there is a way to do this "for all the users for free".
// There is, and it is better than the paid one for measuring:
//
//   address -> lat/lng   Esri's World geocoder. Free, keyless, worldwide,
//                        and it sends CORS headers so the browser can call
//                        it directly. The Census geocoder is the obvious
//                        first choice and is what Liahona's cron uses, but
//                        it sends NO Access-Control-Allow-Origin, so a
//                        browser fetch to it is blocked — checked, not
//                        assumed. It is also US-only. Esri agreed with it
//                        to within about three metres on a test address.
//   lat/lng -> imagery   Esri World Imagery tiles. Free, keyless, worldwide,
//                        ~0.11 m/px at zoom 20 in the northern US.
//
// Google Static Maps costs per request and needs a key per tenant. The Esri
// tiles cost nothing and work the moment a company signs up, which for a
// seasonal add-on nobody has configured yet is the difference between a
// feature they try and a feature they never see. Google stays available as an
// upgrade for a tenant who has a key and prefers its imagery.
//
// The reason this matters beyond cost: a Web Mercator tile has an EXACT
// ground resolution at a given zoom and latitude, so a roofline traced on it
// converts to feet with no calibration step. See chrisLights.feetPerPixel.

export const TILE_PX = 256

/** Esri World Imagery. Keyless; their terms ask for attribution, which the page shows. */
export const ATTRIBUTION = 'Imagery © Esri, Maxar, Earthstar Geographics'

export function tileUrl(z, y, x) {
  return `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
}

/**
 * Esri World geocoder. Keyless and CORS-enabled, so the page calls it
 * straight from the browser with no endpoint of our own in between.
 *
 * Their free tier covers geocoding you do not STORE. We keep the address
 * text on the estimate and throw the coordinates away after the imagery is
 * drawn, which is exactly that.
 */
export function geocodeUrl(address) {
  const a = String(address ?? '').trim()
  return `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates`
    + `?f=json&outFields=Match_addr&maxLocations=1&singleLine=${encodeURIComponent(a)}`
}

/**
 * Which tiles in a block actually hold imagery.
 *
 * Esri serves a 2,521-byte "Map data not yet available" placeholder rather
 * than a 404 when it has nothing at that zoom, so a tile that fetches 200
 * and parses as a JPEG can still be a grey square with writing on it. This
 * endpoint answers honestly: 1 means imagery, 0 means the placeholder.
 *
 * Found the hard way — zoom 20 looked fine byte-wise over Highland, Utah
 * and rendered nine grey squares.
 */
export function tilemapUrl(z, y, x, rows = 1, cols = 1) {
  return `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tilemap/${z}/${y}/${x}/${rows}/${cols}`
}

/** True when a tilemap reply says every tile in the block has imagery. */
export function tilemapHasImagery(payload) {
  const d = payload?.data
  return Array.isArray(d) && d.length > 0 && d.every((v) => v === 1)
}

/**
 * Zooms to try, deepest first. 20 is as deep as this needs — a foot is
 * about 2.7 pixels there, which is finer than anyone traces by thumb.
 */
export const ZOOM_LADDER = [20, 19, 18]

/**
 * How many tiles to stitch at a zoom so the picture covers roughly a house
 * and its setback. Deeper zoom, more tiles; at zoom 19 one tile is already
 * 191 ft across up here and a 3x3 would be most of the street.
 */
export function gridFor(lat, zoom, targetFt = 260) {
  const la = Number(lat), z = Number(zoom)
  if (!Number.isFinite(la) || !Number.isFinite(z)) return 1
  const metresPerPx = (156543.03392 * Math.cos((la * Math.PI) / 180)) / 2 ** z
  const ftPerTile = (metresPerPx / 0.3048) * TILE_PX
  if (ftPerTile <= 0) return 1
  const want = Math.ceil(Number(targetFt) / ftPerTile)
  // Odd, so the address has a centre tile; capped so one bad address cannot
  // fire off dozens of requests.
  const odd = Math.max(1, want % 2 === 0 ? want + 1 : want)
  return Math.min(odd, 5)
}

/** lat/lng as fractional tile coordinates at a zoom. */
export function tileXY(lat, lng, zoom) {
  const la = Number(lat), ln = Number(lng), z = Number(zoom)
  if (!Number.isFinite(la) || !Number.isFinite(ln) || !Number.isFinite(z)) return null
  if (Math.abs(la) > 85) return null
  const n = 2 ** z
  const rad = (la * Math.PI) / 180
  return {
    x: ((ln + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
  }
}

/**
 * The tiles to stitch, and where each goes on the canvas.
 *
 * An odd grid centres the address: 3x3 of 256px is 768px, which at zoom 20 in
 * the northern US covers about 280 ft — a house and its setback, with room to
 * see which side the street is on.
 */
export function tilePlan(lat, lng, zoom, grid = 3) {
  const t = tileXY(lat, lng, zoom)
  // Force an ODD grid so a centre tile exists, rounding down: an even grid
  // has no middle, and rounding up would quietly double the tile fetches.
  const g = Math.max(1, Math.floor((Math.floor(grid) - 1) / 2) * 2 + 1)
  if (!t) return null
  const half = (g - 1) / 2
  const cx = Math.floor(t.x), cy = Math.floor(t.y)
  const tiles = []
  for (let row = -half; row <= half; row++) {
    for (let col = -half; col <= half; col++) {
      tiles.push({
        z: zoom, x: cx + col, y: cy + row,
        url: tileUrl(zoom, cy + row, cx + col),
        dx: (col + half) * TILE_PX,
        dy: (row + half) * TILE_PX,
      })
    }
  }
  return {
    tiles,
    size: g * TILE_PX,
    // Where the address itself lands on the stitched canvas. The pin belongs
    // on the house, not in the middle of the picture — the tile the house sits
    // in is rarely centred on it.
    center: {
      x: (t.x - cx + half) * TILE_PX,
      y: (t.y - cy + half) * TILE_PX,
    },
  }
}

/** The best candidate from a geocoder reply, or null. */
export function firstGeocodeMatch(payload) {
  const c = payload?.candidates?.[0]
  if (!c?.location) return null
  const lat = Number(c.location.y), lng = Number(c.location.x)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return {
    lat,
    lng,
    matched: String(c.attributes?.Match_addr || c.address || ''),
    score: Number(c.score) || 0,
  }
}

/** Why an address could not be put on the map, as a sentence — or null. */
export function geocodeProblem(address, payload) {
  if (!String(address ?? '').trim()) return 'Type the property address.'
  if (!payload) return 'Could not reach the address lookup. Check the connection and try again.'
  if (!firstGeocodeMatch(payload)) {
    return 'No match for that address. Try it without the unit number, or drop a pin by hand.'
  }
  return null
}
