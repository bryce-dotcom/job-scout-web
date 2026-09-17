// County assessor parcels for Liahona — free, instant, no quota.
//
// Sources (public ArcGIS REST, queried by point or by map bounds):
//   Utah      UGRC per-county "Parcels_<County>_LIR" layers: address, built
//             year, square footage, acres, market value, class. No owner names.
//   Arizona   Maricopa County Assessor "Parcels" layer: address, owner of
//             record, mailing address, last sale, living area, lot, full cash
//             value.
//   Elsewhere  Regrid, nationwide, through the parcel-lookup edge function
//             (paid per lookup, cached server-side, token never in the browser).
//
// Every parcel is normalized to the same shape so the drop-lead form and the
// overlay render one way regardless of county.

import { supabase } from './supabase'
import { pointInGeometry, geometryCentroid } from './mapOverlays'

// setParcelCompany(companyId) is called by the map so the edge function can
// meter paid lookups per company.
let parcelCompanyId = null
export const setParcelCompany = id => { parcelCompanyId = id }

async function regridCall(action, body) {
  if (!parcelCompanyId) return { error: 'no_company' }
  const { data, error } = await supabase.functions.invoke('parcel-lookup', { body: { action, company_id: parcelCompanyId, ...body } })
  if (error) {
    // supabase-js hides the JSON body on non-2xx; read it for the regrid_* codes
    let code = 'regrid_failed'
    try { code = (await error.context?.json?.())?.error || code } catch { /* keep default */ }
    return { error: code }
  }
  return data || { error: 'regrid_failed' }
}

const TIGER_COUNTY = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query'
const UGRC = 'https://services1.arcgis.com/99lidPhWCzftIe9K/arcgis/rest/services'
const MARICOPA = 'https://gis.mcassessor.maricopa.gov/arcgis/rest/services/Parcels/MapServer/0/query'

const countyCache = new Map()

// Which county (and state) is this point in? Cached on a ~5 km grid.
async function countyAt(lat, lng) {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`
  if (countyCache.has(key)) return countyCache.get(key)
  const params = new URLSearchParams({ geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'NAME,STATE', returnGeometry: 'false', f: 'json' })
  let out = null
  try {
    const j = await fetch(`${TIGER_COUNTY}?${params}`, { signal: AbortSignal.timeout(10000) }).then(r => r.json())
    const a = j.features?.[0]?.attributes
    if (a) out = { name: a.NAME, state: a.STATE }
  } catch { /* offline */ }
  countyCache.set(key, out)
  return out
}

// UGRC's statewide layer strips owner names, but the two counties with most
// of the work publish them on their own assessor services. Same parcel IDs
// as UGRC, so owners are merged onto the UGRC record by ID.
const OWNER_SOURCES = {
  'Salt Lake County': {
    url: 'https://apps.saltlakecounty.gov/slcogis/rest/services/Assessor/Parcel_Viewer_external/MapServer/5/query',
    idField: 'parcel_id', fields: 'parcel_id,own_name,care_of,own_addr,own_citystate,own_zip,year_built,total_sq_ft,full_mkt_prcl_total',
    read: p => ({
      id: (p.parcel_id || '').trim(), owner_name: title((p.own_name || '').trim()),
      mail_address: [(p.own_addr || '').trim(), (p.own_citystate || '').trim(), (p.own_zip || '').trim()].filter(Boolean).map(title).join(', ') || null,
      year_built: p.year_built || null, sqft: p.total_sq_ft || null, market_value: p.full_mkt_prcl_total || null
    })
  },
  'Utah County': {
    url: 'https://maps.utahcounty.gov/arcgis/rest/services/Parcels/Parcel_TaxParcels/MapServer/2/query',
    idField: 'PARCELID', fields: 'PARCELID,OWNER_NAME,CARE_NAME,OWN_FULL_ADDRESS,YEARBLT_RES,GLA_RES,MKT_CUR_VALUE',
    read: p => ({
      id: String(p.PARCELID || '').trim(), owner_name: title((p.OWNER_NAME || '').trim()),
      mail_address: title((p.OWN_FULL_ADDRESS || '').replace(/\s+/g, ' ').trim()) || null,
      year_built: p.YEARBLT_RES || null, sqft: p.GLA_RES || null, market_value: p.MKT_CUR_VALUE || null
    })
  }
}

// Owner records for a point or a bbox from the county's own service, keyed by parcel id.
async function ownersFor(county, { lat, lng, bounds }) {
  const src = OWNER_SOURCES[county?.name]
  if (!src || county.state !== '49') return null
  const geom = bounds ? { geometry: `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`, geometryType: 'esriGeometryEnvelope' }
    : { geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint' }
  const params = new URLSearchParams({ ...geom, inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: src.fields, returnGeometry: 'false', resultRecordCount: '800', f: 'json' })
  try {
    const j = await fetch(`${src.url}?${params}`, { signal: AbortSignal.timeout(12000) }).then(r => r.json())
    const out = new Map()
    for (const f of j.features || []) { const o = src.read(f.attributes || {}); if (o.id) out.set(o.id, o) }
    return out
  } catch { return null }
}

// Assessor owner strings as a rep would say them: "Kara Carlston (Jt); David
// Alan Carlston (Jt)" -> "Kara & David Alan Carlston", tenancy tags dropped,
// "Trust Not Identified" and friends -> no owner.
export function tidyOwner(raw) {
  if (!raw) return null
  let s = String(raw).replace(/\((jt|tc|trs?|te|etal|et al|life estate|le)\)/gi, ' ').replace(/\b(et al|etal|et ux|et vir)\b\.?/gi, ' ').replace(/\s+/g, ' ').trim()
  if (!s || /not identified|unknown|unavailable|^n\/?a$|withheld/i.test(s)) return null
  const parts = s.split(/\s*;\s*/).map(x => x.trim()).filter(Boolean)
  if (parts.length > 1) {
    const last = parts.map(x => x.split(' ').pop().toLowerCase())
    if (last.every(l => l === last[0]) && parts.every(x => x.split(' ').length > 1)) {
      s = `${parts.map(x => x.split(' ').slice(0, -1).join(' ')).join(' & ')} ${parts[0].split(' ').pop()}`
    } else s = parts.join(' & ')
  }
  return title(s)
}

function mergeOwner(parcel, o) {
  if (!parcel || !o) return parcel
  return {
    ...parcel,
    source_label: `County assessor (${parcel.county || 'UGRC'})`,
    owner_name: tidyOwner(o.owner_name) || parcel.owner_name, mail_address: o.mail_address || parcel.mail_address,
    year_built: parcel.year_built || o.year_built, sqft: parcel.sqft || o.sqft, market_value: parcel.market_value || o.market_value
  }
}

function providerFor(county) {
  if (!county) return null
  if (county.state === '49') {
    const svc = county.name.replace(/ County$/i, '').replace(/\s+/g, '')
    // Column sets differ per county (Utah County has no PROP_TYPE/EFFBUILT_YR),
    // and ArcGIS rejects a query naming a missing field — so ask for all.
    return { id: 'ugrc', county: county.name, url: `${UGRC}/Parcels_${svc}_LIR/FeatureServer/0/query`, fields: '*' }
  }
  if (county.state === '04' && /^Maricopa/i.test(county.name)) {
    return { id: 'maricopa', county: county.name, url: MARICOPA,
      fields: 'APN,OWNER_NAME,PHYSICAL_ADDRESS,PHYSICAL_CITY,PHYSICAL_ZIP,MAIL_ADDRESS,SALE_DATE,SALE_PRICE,LAND_SIZE,CONST_YEAR,LIVING_SPACE,FCV_CUR,PUC,SUBNAME,LATITUDE,LONGITUDE' }
  }
  return null
}

const num = v => { if (v == null || v === '') return null; const n = Number(String(v).replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : null }
const title = s => s ? String(s).toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()) : ''
const dateStr = ms => ms ? new Date(Number(ms)).toISOString().slice(0, 10) : null

export function normalizeParcel(provider, p, geometry) {
  if (provider.id === 'ugrc') {
    return {
      source: 'ugrc', source_label: 'County assessor (UGRC)', county: provider.county,
      parcel_id: p.PARCEL_ID, address: title(p.PARCEL_ADD), city: p.PARCEL_CITY || '', zip: '',
      owner_name: null, mail_address: null,
      year_built: p.BUILT_YR || null, sqft: p.BLDG_SQFT || null, lot_acres: p.PARCEL_ACRES ?? null,
      market_value: p.TOTAL_MKT_VALUE ?? null, land_value: p.LAND_MKT_VALUE ?? null,
      last_sale_date: null, last_sale_price: null,
      prop_class: p.PROP_CLASS || null, prop_type: p.PROP_TYPE || null, primary_res: p.PRIMARY_RES === 'Y',
      subdivision: p.SUBDIV_NAME || null, source_url: p.ASSESSOR_SRC || 'https://gis.utah.gov/products/sgid/cadastre/parcels/',
      as_of: dateStr(p.CURRENT_ASOF), geometry
    }
  }
  // PHYSICAL_ADDRESS arrives as "100 N GILBERT RD   GILBERT  85234": keep the
  // street part only, city and ZIP have their own fields.
  let street = (p.PHYSICAL_ADDRESS || '').replace(/\s+/g, ' ').trim()
  const cityZip = new RegExp(`\\s+${(p.PHYSICAL_CITY || '').trim()}\\s*${(p.PHYSICAL_ZIP || '').trim()}\\s*$`, 'i')
  if (p.PHYSICAL_CITY) street = street.replace(cityZip, '').trim()
  return {
    source: 'maricopa', source_label: 'Maricopa County Assessor', county: provider.county,
    parcel_id: p.APN, address: title(street), city: title(p.PHYSICAL_CITY || ''), zip: p.PHYSICAL_ZIP || '',
    owner_name: tidyOwner(p.OWNER_NAME), mail_address: title(p.MAIL_ADDRESS),
    year_built: num(p.CONST_YEAR), sqft: num(p.LIVING_SPACE), lot_acres: p.LAND_SIZE ? +(num(p.LAND_SIZE) / 43560).toFixed(2) : null,
    market_value: num(p.FCV_CUR), land_value: null,
    last_sale_date: dateStr(p.SALE_DATE), last_sale_price: num(p.SALE_PRICE),
    prop_class: null, prop_type: null, primary_res: null,
    subdivision: title(p.SUBNAME), source_url: `https://mcassessor.maricopa.gov/mcs/?q=${encodeURIComponent(p.APN || '')}`,
    as_of: null, geometry, lat: p.LATITUDE ?? null, lng: p.LONGITUDE ?? null
  }
}

// One line a rep can read at a glance: "Built 2018 · 4,651 sq ft · 0.52 ac · $2.86M"
export function parcelSummary(pc) {
  if (!pc) return ''
  const money = v => v == null ? null : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1000)}k`
  return [
    pc.year_built && `Built ${pc.year_built}`, pc.sqft && `${Number(pc.sqft).toLocaleString()} sq ft`,
    pc.lot_acres && `${pc.lot_acres} ac`, pc.market_value && money(pc.market_value),
    pc.prop_class && pc.prop_class
  ].filter(Boolean).join(' · ')
}

// The parcel under a point, or null when no source covers it.
// Returns { parcel } or { parcel: null, reason: 'no-source' | 'none' }.
export async function parcelAt(lat, lng) {
  const county = await countyAt(lat, lng)
  const provider = providerFor(county)
  if (!provider) {
    // No free source here: nationwide via Regrid (metered, cached server-side).
    const r = await regridCall('point', { lat, lng })
    if (r.error) return { parcel: null, reason: r.error === 'regrid_auth' ? 'expired' : r.error === 'regrid_not_configured' ? 'no-source' : 'error', county: county?.name || null }
    return { parcel: r.parcel || null, reason: r.parcel ? null : 'none', county: county?.name || null, cached: r.cached }
  }
  const params = new URLSearchParams({ geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: provider.fields, returnGeometry: 'true', geometryPrecision: '6', f: 'geojson' })
  try {
    const j = await fetch(`${provider.url}?${params}`, { signal: AbortSignal.timeout(12000) }).then(r => r.json())
    const f = j.features?.[0]
    if (!f) return { parcel: null, reason: 'none', county: county?.name || null }
    let parcel = normalizeParcel(provider, f.properties, f.geometry)
    if (provider.id === 'ugrc' && OWNER_SOURCES[county?.name]) {
      const owners = await ownersFor(county, { lat, lng })
      parcel = mergeOwner(parcel, owners?.get(String(parcel.parcel_id || '').trim()) || (owners && owners.size === 1 ? [...owners.values()][0] : null))
    }
    return { parcel, county: county?.name || null }
  } catch {
    return { parcel: null, reason: 'error', county: county?.name || null }
  }
}

// Every parcel in the current view (for the assessor overlay). Uses the
// county at the view's center; at parcel zoom a view rarely straddles two.
export async function parcelsInBounds(bounds) {
  const c = bounds.getCenter()
  const county = await countyAt(c.lat, c.lng)
  const provider = providerFor(county)
  if (!provider) {
    const r = await regridCall('area', { bbox: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()], limit: 400 })
    if (r.error) return { features: [], reason: r.error === 'regrid_auth' ? 'expired' : r.error === 'regrid_not_configured' ? 'no-source' : 'error', county: county?.name || null }
    return { features: r.features || [], provider: 'regrid', county: county?.name || null }
  }
  const params = new URLSearchParams({
    geometry: `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`,
    geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: provider.fields, returnGeometry: 'true', geometryPrecision: '6', resultRecordCount: '600', f: 'geojson'
  })
  const [j, owners] = await Promise.all([
    fetch(`${provider.url}?${params}`, { signal: AbortSignal.timeout(20000) }).then(r => r.json()),
    provider.id === 'ugrc' && OWNER_SOURCES[county?.name] ? ownersFor(county, { bounds }) : Promise.resolve(null)
  ])
  const features = (j.features || []).filter(f => f.geometry).map(f => {
    const pc = normalizeParcel(provider, f.properties, null)
    return { type: 'Feature', geometry: f.geometry, properties: owners ? mergeOwner(pc, owners.get(String(pc.parcel_id || '').trim())) : pc }
  })
  return { features, provider: provider.id, county: county?.name || null }
}

// Cloverleaf: every parcel within radiusM of a point, nearest first, with the
// parcel the point sits in (the finished job, the lead) split out as `origin`.
// Distances are metres from the point to each parcel's centroid.
export async function neighborsAround(lat, lng, radiusM = 150) {
  const dLat = radiusM / 111320, dLng = radiusM / (111320 * Math.cos(lat * Math.PI / 180))
  const bounds = {
    getCenter: () => ({ lat, lng }),
    getWest: () => lng - dLng, getEast: () => lng + dLng, getSouth: () => lat - dLat, getNorth: () => lat + dLat
  }
  const r = await parcelsInBounds(bounds)
  if (!r.features.length) return { origin: null, neighbors: [], reason: r.reason || 'none', county: r.county }
  const metres = (a, b) => {
    const dx = (a.lng - b.lng) * Math.cos((a.lat + b.lat) / 2 * Math.PI / 180), dy = a.lat - b.lat
    return Math.hypot(dx, dy) * 111320
  }
  let origin = null
  const neighbors = []
  for (const f of r.features) {
    const c = f.properties.lat != null && f.properties.lng != null ? { lat: Number(f.properties.lat), lng: Number(f.properties.lng) } : geometryCentroid(f.geometry)
    if (!c) continue
    const item = { parcel: { ...f.properties, geometry: f.geometry }, lat: c.lat, lng: c.lng, distance_m: metres({ lat, lng }, c) }
    if (!origin && pointInGeometry(lat, lng, f.geometry)) { origin = item; continue }
    if (item.distance_m <= radiusM) neighbors.push(item)
  }
  neighbors.sort((a, b) => a.distance_m - b.distance_m)
  return { origin, neighbors, provider: r.provider, county: r.county }
}
