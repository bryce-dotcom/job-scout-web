// Overlay sources for the Liahona map (Sales Pipeline → Liahona view).
//
// Boundary layers come from public ArcGIS REST services queried by the
// current map bounds, so nothing is downloaded up front:
//   - Counties, cities/towns, ZIP codes: US Census TIGERweb
//   - Electric utility territories: HIFLD "Electric Retail Service
//     Territories" (EIA-861), mirrored on ArcGIS Online
//   - Weather radar: RainViewer public tiles
//
// Each boundary feature is normalized to { name, sub, key } so the map can
// label and turn any of them into a sales territory the same way.

import { supabase } from './supabase'

const TIGER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb'

export const OVERLAYS = [
  { id: 'territories', group: 'JobScout',    label: 'Sales territories',           kind: 'internal', defaultOn: true },
  { id: 'customers',   group: 'JobScout',    label: 'Customers & jobs',            kind: 'internal', hint: 'Won and in-delivery leads' },
  { id: 'jobs',        group: 'JobScout',    label: 'Finished jobs',               kind: 'internal', hint: 'Every job with an address, lead or not · tap one to cloverleaf its street' },
  { id: 'reps',        group: 'JobScout',    label: 'Reps on the clock',           kind: 'internal', hint: 'Last location ping, past 12 hours' },
  { id: 'utilities',   group: 'Boundaries',  label: 'Electric utility territories', kind: 'boundary', color: '#b45309', minZoom: 8,
    urls: [
      'https://services6.arcgis.com/BAJNi3EgCdtQ1BCG/arcgis/rest/services/Electric_Retail_Service_Territories/FeatureServer/0',
      'https://services3.arcgis.com/OYP7N6mAJJCyH6hd/arcgis/rest/services/Electric_Retail_Service_Territories_HIFLD/FeatureServer/0'
    ],
    fields: 'NAME,TYPE,STATE,HOLDING_CO,CUSTOMERS,ID',
    // Skip the tiny irrigation/water districts and wholesale-only entries that
    // blanket whole regions; keep anything a homeowner could actually be billed by.
    where: "CUSTOMERS >= 500 AND TYPE <> 'FEDERAL' AND TYPE <> 'NOT AVAILABLE'",
    normalize: p => ({ name: titleCase(p.NAME), sub: [titleCase(p.TYPE), p.CUSTOMERS > 0 ? `${Number(p.CUSTOMERS).toLocaleString()} customers` : null].filter(Boolean).join(' · '), key: `util-${p.ID}`, customers: Number(p.CUSTOMERS) || 0 }),
    // HIFLD polygons overlap heavily: around Phoenix a valley-wide tribal
    // cooperative with 3,000 customers sits in the same stack as SRP and APS
    // with a million each. Whatever is drawn last takes the hover and the
    // click, so the retail giants must draw last — sort by customers, small
    // first. Same rule utilityAtPoint uses to name the utility for a point.
    stack: (a, b) => (a.properties.customers || 0) - (b.properties.customers || 0)
  },
  { id: 'counties',    group: 'Boundaries',  label: 'Counties',                    kind: 'boundary', color: '#7c3aed', minZoom: 6,
    urls: [`${TIGER}/State_County/MapServer/1`], fields: 'NAME,GEOID,STATE',
    normalize: p => ({ name: p.NAME, sub: 'County', key: `county-${p.GEOID}` })
  },
  { id: 'cities',      group: 'Boundaries',  label: 'Cities & towns',              kind: 'boundary', color: '#0369a1', minZoom: 9,
    urls: [`${TIGER}/Places_CouSub_ConCity_SubMCD/MapServer/4`], fields: 'NAME,GEOID',
    normalize: p => ({ name: p.NAME, sub: 'City / town', key: `city-${p.GEOID}` })
  },
  { id: 'zips',        group: 'Boundaries',  label: 'ZIP codes',                   kind: 'boundary', color: '#0f766e', minZoom: 10,
    urls: [`${TIGER}/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/1`], fields: 'ZCTA5,GEOID,POP100,HU100',
    normalize: p => ({ name: `ZIP ${p.ZCTA5}`, sub: p.HU100 ? `${Number(p.HU100).toLocaleString()} homes` : 'ZIP code', key: `zip-${p.GEOID}` })
  },
  { id: 'parcels',     group: 'Boundaries',  label: 'Parcels (county assessor)',    kind: 'parcels', color: '#0e7490', minZoom: 16,
    hint: 'Free in Utah, Arizona and 20 more counties and states · tap a lot to add it as a lead' },
  { id: 'radar',       group: 'Conditions',  label: 'Weather radar',               kind: 'raster' },
]

export const overlayById = Object.fromEntries(OVERLAYS.map(o => [o.id, o]))

function titleCase(s) {
  if (!s) return ''
  return String(s).toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/\(([a-z])/g, (m, c) => '(' + c.toUpperCase())
}

// --- Boundary fetching -----------------------------------------------------

const boundaryCache = new Map()

// bounds: Leaflet LatLngBounds. zoom: current map zoom (drives simplification).
export async function fetchBoundary(overlay, bounds, zoom) {
  const west = bounds.getWest(), south = bounds.getSouth(), east = bounds.getEast(), north = bounds.getNorth()
  // Round the bbox so panning a few pixels reuses the cached result.
  const r = v => Math.round(v * 50) / 50
  const cacheKey = `${overlay.id}|${r(west)},${r(south)},${r(east)},${r(north)}|${zoom}`
  if (boundaryCache.has(cacheKey)) return boundaryCache.get(cacheKey)

  // ~2 screen pixels of simplification, in degrees.
  const degPerPx = 360 / (256 * Math.pow(2, zoom))
  const params = new URLSearchParams({
    where: overlay.where || '1=1',
    geometry: `${west},${south},${east},${north}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: overlay.fields,
    returnGeometry: 'true',
    maxAllowableOffset: String(degPerPx * 2),
    geometryPrecision: '5',
    resultRecordCount: '400',
    f: 'geojson'
  })

  let lastErr = null
  for (const url of overlay.urls) {
    try {
      const res = await fetch(`${url}/query?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error.message || 'query error')
      const features = (json.features || []).filter(f => f.geometry).map(f => ({
        ...f,
        properties: { ...f.properties, ...overlay.normalize(f.properties), overlayId: overlay.id }
      }))
      // Draw order = array order in Leaflet; an overlay that knows which of
      // its overlapping shapes should be on top says so with `stack`.
      if (overlay.stack) features.sort(overlay.stack)
      const fc = { type: 'FeatureCollection', features }
      boundaryCache.set(cacheKey, fc)
      return fc
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr || new Error('No boundary source responded')
}

// Which utility serves this point? Used to prefill a territory's utility.
export async function utilityAtPoint(lat, lng) {
  const overlay = overlayById.utilities
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: overlay.fields,
    returnGeometry: 'false',
    f: 'json'
  })
  for (const url of overlay.urls) {
    try {
      const res = await fetch(`${url}/query?${params}`)
      const json = await res.json()
      const feats = json.features || []
      if (feats.length === 0) return null
      // HIFLD polygons overlap a lot (irrigation districts, tribal and federal
      // wholesale areas sit on top of the real retail provider). The retail
      // utility a homeowner actually pays is almost always the one with the
      // most customers, once federal/unknown-type entries are set aside.
      const demoted = t => t === 'FEDERAL' || t === 'NOT AVAILABLE' || !t
      const customers = f => Number(f.attributes.CUSTOMERS) > 0 ? Number(f.attributes.CUSTOMERS) : 0
      feats.sort((a, b) => (demoted(a.attributes.TYPE) - demoted(b.attributes.TYPE)) || (customers(b) - customers(a)))
      return overlay.normalize(feats[0].attributes)
    } catch { /* try next mirror */ }
  }
  return null
}

// --- Weather radar ---------------------------------------------------------

export async function fetchRadarTileTemplate() {
  const res = await fetch('https://api.rainviewer.com/public/weather-maps.json')
  const json = await res.json()
  const frame = json?.radar?.past?.slice(-1)[0]
  if (!frame) return null
  return { url: `${json.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`, time: new Date(frame.time * 1000) }
}

// --- Reps on the clock -----------------------------------------------------

// Latest location ping per employee in the last `hours`.
export async function fetchRepLocations(companyId, hours = 12) {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString()
  const { data, error } = await supabase
    .from('location_pings')
    .select('employee_id, lat, lng, pinged_at')
    .eq('company_id', companyId)
    .gte('pinged_at', since)
    .order('pinged_at', { ascending: false })
    .limit(600)
  if (error) throw error
  const latest = new Map()
  for (const p of data || []) {
    if (!latest.has(p.employee_id) && p.lat != null && p.lng != null) latest.set(p.employee_id, p)
  }
  return [...latest.values()]
}

// --- Geometry helpers ------------------------------------------------------

// point: [lng, lat]; ring: [[lng, lat], ...]
function pointInRing(point, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    const intersect = ((yi > point[1]) !== (yj > point[1])) &&
      (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

// geometry: GeoJSON Polygon or MultiPolygon
export function pointInGeometry(lat, lng, geometry) {
  if (!geometry) return false
  const pt = [lng, lat]
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates : []
  for (const rings of polys) {
    if (!rings.length) continue
    if (pointInRing(pt, rings[0]) && !rings.slice(1).some(hole => pointInRing(pt, hole))) return true
  }
  return false
}

export function geometryCentroid(geometry) {
  const ring = geometry.type === 'Polygon' ? geometry.coordinates[0]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates[0][0] : null
  if (!ring?.length) return null
  let lat = 0, lng = 0
  for (const [x, y] of ring) { lng += x; lat += y }
  return { lat: lat / ring.length, lng: lng / ring.length }
}
