// County assessor parcels for Liahona — free, instant, no quota.
//
// Sources (public ArcGIS REST, queried by point or by map bounds):
//   Utah      UGRC per-county "Parcels_<County>_LIR" layers: address, built
//             year, square footage, acres, market value, class. No owner names.
//   Arizona   Maricopa County Assessor "Parcels" layer: address, owner of
//             record, mailing address, last sale, living area, lot, full cash
//             value.
// Anywhere else returns null and the map says so.
//
// Every parcel is normalized to the same shape so the drop-lead form and the
// overlay render one way regardless of county.

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

function providerFor(county) {
  if (!county) return null
  if (county.state === '49') {
    const svc = county.name.replace(/ County$/i, '').replace(/\s+/g, '')
    return { id: 'ugrc', county: county.name, url: `${UGRC}/Parcels_${svc}_LIR/FeatureServer/0/query`,
      fields: 'PARCEL_ID,PARCEL_ADD,PARCEL_CITY,TOTAL_MKT_VALUE,LAND_MKT_VALUE,PARCEL_ACRES,PROP_CLASS,PRIMARY_RES,BLDG_SQFT,BUILT_YR,EFFBUILT_YR,PROP_TYPE,SUBDIV_NAME,ASSESSOR_SRC,CURRENT_ASOF' }
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
    owner_name: title(p.OWNER_NAME), mail_address: title(p.MAIL_ADDRESS),
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
  if (!provider) return { parcel: null, reason: 'no-source', county: county?.name || null }
  const params = new URLSearchParams({ geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: provider.fields, returnGeometry: 'true', geometryPrecision: '6', f: 'geojson' })
  try {
    const j = await fetch(`${provider.url}?${params}`, { signal: AbortSignal.timeout(12000) }).then(r => r.json())
    const f = j.features?.[0]
    if (!f) return { parcel: null, reason: 'none', county: county?.name || null }
    return { parcel: normalizeParcel(provider, f.properties, f.geometry), county: county?.name || null }
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
  if (!provider) return { features: [], reason: 'no-source', county: county?.name || null }
  const params = new URLSearchParams({
    geometry: `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`,
    geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: provider.fields, returnGeometry: 'true', geometryPrecision: '6', resultRecordCount: '600', f: 'geojson'
  })
  const j = await fetch(`${provider.url}?${params}`, { signal: AbortSignal.timeout(20000) }).then(r => r.json())
  const features = (j.features || []).filter(f => f.geometry).map(f => ({ type: 'Feature', geometry: f.geometry, properties: normalizeParcel(provider, f.properties, null) }))
  return { features, provider: provider.id, county: county?.name || null }
}
