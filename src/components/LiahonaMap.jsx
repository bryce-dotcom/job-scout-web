// Liahona — the map view of the Sales Pipeline (Board | Liahona toggle).
//
// What it does:
//   - Pins every geocoded sales lead, colored by pipeline stage. Click a pin to
//     open the same detail panel the board uses; drag a pin to fix its spot.
//   - Drop mode: click the map to create a lead at that address.
//   - Territories: draw a polygon, or lift a county / city / ZIP / utility
//     boundary straight off an overlay. Each territory gets an owner and a
//     utility, and shows how many leads and customers fall inside it.
//   - Route: orders the open leads in view from your location and draws the
//     drive (Google Directions when a Maps key is set, OSRM otherwise).
//   - Overlays: sales territories, customers & jobs, reps on the clock,
//     electric utility territories, counties, cities, ZIP codes, weather radar.
//
// Leaflet is loaded from the CDN on first use, the same way FieldScout does.

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { geocodeAddress, reverseGeocode, geocodeMissingLeads, googleMapsUsable, markGoogleMapsBroken } from '../lib/geocode'
import { loadGoogleMaps } from '../lib/googleMaps'
import AddressAutocomplete from './AddressAutocomplete'
import {
  OVERLAYS, fetchBoundary, utilityAtPoint, fetchRadarTileTemplate,
  fetchRepLocations, pointInGeometry, geometryCentroid
} from '../lib/mapOverlays'
import {
  Search, MapPin, PenTool, Route, Layers, MousePointer2, X, Trash2, Check,
  Undo2, Loader2, LocateFixed, Pencil, ExternalLink, Maximize2, Filter, UserPlus
} from 'lucide-react'

const PALETTE = ['#5a6349', '#2457a8', '#b45309', '#7c3aed', '#0f766e', '#b91c1c', '#0369a1', '#a16207']
const US_CENTER = [39.5, -98.35]

// Last map position per device (and company), so reopening Liahona lands
// where the rep left it instead of zooming out to fit every pin in the
// region. Kept in localStorage; a private window simply falls back to fit.
const viewKey = companyId => `liahona.view.${companyId || "x"}`
const loadView = companyId => {
  try {
    const v = JSON.parse(localStorage.getItem(viewKey(companyId)) || "null")
    return v && Number.isFinite(v.lat) && Number.isFinite(v.lng) && Number.isFinite(v.zoom) ? v : null
  } catch { return null }
}
const saveView = (companyId, map) => {
  try {
    const c = map.getCenter()
    localStorage.setItem(viewKey(companyId), JSON.stringify({ lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), zoom: map.getZoom() }))
  } catch { /* storage unavailable */ }
}

let leafletPromise = null
function ensureLeaflet() {
  if (typeof window !== 'undefined' && window.L) return Promise.resolve(window.L)
  if (leafletPromise) return leafletPromise
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }
    let script = document.getElementById('leaflet-js')
    if (!script) {
      script = document.createElement('script')
      script.id = 'leaflet-js'
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
      document.head.appendChild(script)
    }
    script.addEventListener('load', () => resolve(window.L))
    script.addEventListener('error', () => reject(new Error('Leaflet failed to load')))
    if (window.L) resolve(window.L)
  })
  return leafletPromise
}

const hasCoords = l => l && l.latitude != null && l.longitude != null && !Number.isNaN(Number(l.latitude))
const dist = (a, b) => {
  const dx = (a.lng - b.lng) * Math.cos((a.lat + b.lat) / 2 * Math.PI / 180), dy = a.lat - b.lat
  return Math.hypot(dx, dy)
}
// Google Maps never calls back if the key is referrer-restricted or the script
// is blocked, so anything that waits on it gets a deadline.
const withTimeout = (p, ms, label = 'timed out') => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(label)), ms))])
const initials = name => (name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
const minutesAgo = iso => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))

// compact: phone layout — toolbar becomes icon buttons, the stage legend moves
// into the map (via onToggleStage), and the side panel becomes a bottom sheet.
export default function LiahonaMap({
  leads = [], customers = [], stages = [], hiddenStages, companyId, employees = [], user, theme,
  onSelectLead, onLeadsChanged, compact = false, onToggleStage
}) {
  const t = {
    bg: theme?.bg || '#f7f5ef', bgCard: theme?.bgCard || '#fff', border: theme?.border || '#d6cdb8',
    text: theme?.text || '#2c3530', textSecondary: theme?.textSecondary || '#4d5a52',
    textMuted: theme?.textMuted || '#7d8a7f', accent: theme?.accent || '#5a6349',
    accentBg: theme?.accentBg || 'rgba(90,99,73,0.12)'
  }

  const mapDivRef = useRef(null)
  const mapRef = useRef(null)
  const groupsRef = useRef({})          // pins, territories, draw, route, search, customers, reps
  const overlayLayersRef = useRef({})   // overlayId -> Leaflet layer
  const modeRef = useRef('select')
  const drawPtsRef = useRef([])
  const overlayReqRef = useRef({})
  const overlayExtentRef = useRef({})   // overlayId -> { bounds, zoom } currently loaded

  // 0 until Leaflet is up; bumps every time the map instance is (re)created
  // (StrictMode double-mount, HMR) so every layer effect re-runs on the new map.
  const [ready, setReady] = useState(0)
  const [loadError, setLoadError] = useState(null)
  const [mode, setModeState] = useState('select')
  const [drawPts, setDrawPtsState] = useState([])
  const [moveTick, setMoveTick] = useState(0)
  const [territories, setTerritories] = useState([])
  const [selectedTerritoryId, setSelectedTerritoryId] = useState(null)
  const [territoryForm, setTerritoryForm] = useState(null)
  const [dropForm, setDropForm] = useState(null)
  const [utilityProviders, setUtilityProviders] = useState([])
  const [activeOverlays, setActiveOverlays] = useState(() => new Set(OVERLAYS.filter(o => o.defaultOn).map(o => o.id)))
  const [overlayStatus, setOverlayStatus] = useState({})
  const [showOverlayMenu, setShowOverlayMenu] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [searching, setSearching] = useState(false)
  const [route, setRoute] = useState(null)
  const [routing, setRouting] = useState(false)
  const [geocoding, setGeocoding] = useState(null)
  const [toast, setToast] = useState('')
  const [saving, setSaving] = useState(false)
  // compact only: bottom sheet open/closed. Opens itself whenever there is
  // something to act on (a form or a route), closes on tap of the handle.
  const [sheetOpen, setSheetOpen] = useState(false)
  // Territory filter: 'all' | 'mine' (territories I own) | a territory id.
  // Everything downstream (pins, counts, routes) reads visibleLeads, so the
  // filter applies to all of it. Remembered per device like the map view.
  const [territoryFilter, setTerritoryFilterState] = useState(() => {
    try { return localStorage.getItem('liahona.territoryFilter') || 'all' } catch { return 'all' }
  })
  const setTerritoryFilter = v => {
    setTerritoryFilterState(v)
    try { localStorage.setItem('liahona.territoryFilter', v) } catch { /* private mode */ }
  }
  const [claiming, setClaiming] = useState(false)

  const setMode = m => { modeRef.current = m; setModeState(m) }
  const setDrawPts = pts => { drawPtsRef.current = pts; setDrawPtsState(pts) }
  const notify = useCallback(msg => { setToast(msg); setTimeout(() => setToast(''), 2500) }, [])

  const stageById = useMemo(() => Object.fromEntries(stages.map(s => [s.id, s])), [stages])
  const employeeById = useMemo(() => Object.fromEntries(employees.map(e => [e.id, e])), [employees])
  const geocodedLeads = useMemo(() => leads.filter(hasCoords), [leads])
  const unmappedCount = useMemo(() => leads.filter(l => l.address && !hasCoords(l)).length, [leads])
  // Polygons the current filter selects; null = no territory filtering.
  const filterPolygons = useMemo(() => {
    if (territoryFilter === 'all') return null
    if (territoryFilter === 'mine') return territories.filter(tr => user?.id && String(tr.owner_id) === String(user.id)).map(tr => tr.polygon)
    const tr = territories.find(x => String(x.id) === String(territoryFilter))
    return tr ? [tr.polygon] : null
  }, [territoryFilter, territories, user?.id])
  const inFilter = useCallback(l => !filterPolygons || filterPolygons.some(poly => pointInGeometry(Number(l.latitude), Number(l.longitude), poly)), [filterPolygons])
  const visibleLeads = useMemo(
    () => geocodedLeads.filter(l => (!hiddenStages || !hiddenStages.has(l.status)) && inFilter(l)),
    [geocodedLeads, hiddenStages, inFilter]
  )
  // Leads in the filtered area nobody owns yet — the "go knock these" list.
  const unassignedInFilter = useMemo(
    () => filterPolygons ? geocodedLeads.filter(l => !l.lead_owner_id && inFilter(l)) : [],
    [filterPolygons, geocodedLeads, inFilter]
  )
  const filterLabel = territoryFilter === 'all' ? null
    : territoryFilter === 'mine' ? 'My territories'
    : (territories.find(x => String(x.id) === String(territoryFilter))?.name || null)

  // Leads / customers inside each territory.
  const territoryCounts = useMemo(() => {
    const out = {}
    for (const tr of territories) {
      const inside = geocodedLeads.filter(l => pointInGeometry(Number(l.latitude), Number(l.longitude), tr.polygon))
      const cust = customers.filter(l => hasCoords(l) && pointInGeometry(Number(l.latitude), Number(l.longitude), tr.polygon))
      out[tr.id] = { leads: inside.length, customers: cust.length, unassigned: inside.filter(l => !l.lead_owner_id).length }
    }
    return out
  }, [territories, geocodedLeads, customers])

  useEffect(() => {
    if (compact && (territoryForm || dropForm || route)) setSheetOpen(true)
  }, [compact, territoryForm, dropForm, route])

  // ---------------------------------------------------------------- map init
  useEffect(() => {
    let cancelled = false
    ensureLeaflet().then(L => {
      if (cancelled || !mapDivRef.current || mapRef.current) return
      const map = L.map(mapDivRef.current, { zoomControl: true, doubleClickZoom: false })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(map)
      groupsRef.current = {
        overlays: L.layerGroup().addTo(map),
        territories: L.layerGroup().addTo(map),
        customers: L.layerGroup().addTo(map),
        reps: L.layerGroup().addTo(map),
        pins: L.layerGroup().addTo(map),
        route: L.layerGroup().addTo(map),
        draw: L.layerGroup().addTo(map),
        search: L.layerGroup().addTo(map)
      }
      map.on('moveend zoomend', () => { setMoveTick(x => x + 1); saveView(companyId, map) })
      map.on('click', e => handleMapClick(e.latlng))
      map.on('dblclick', () => { if (modeRef.current === 'draw') finishDraw() })
      mapRef.current = map

      const pts = leads.filter(hasCoords)
      const saved = loadView(companyId)
      if (saved) {
        map.setView([saved.lat, saved.lng], saved.zoom)
      } else if (pts.length) {
        map.fitBounds(pts.map(l => [Number(l.latitude), Number(l.longitude)]), { padding: [30, 30], maxZoom: 15 })
      } else if (navigator.geolocation) {
        map.setView(US_CENTER, 4)
        navigator.geolocation.getCurrentPosition(
          p => map.setView([p.coords.latitude, p.coords.longitude], 12),
          () => {}, { timeout: 4000, maximumAge: 300000 }
        )
      } else {
        map.setView(US_CENTER, 4)
      }
      overlayLayersRef.current = {}
      overlayExtentRef.current = {}
      setRoute(null)
      setReady(r => r + 1)
      // The section it lives in animates open; make sure tiles fill it.
      setTimeout(() => map.invalidateSize(), 250)
      const ro = new ResizeObserver(() => map.invalidateSize())
      ro.observe(mapDivRef.current)
      map._liahonaRO = ro
    }).catch(e => setLoadError(e.message))
    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current._liahonaRO?.disconnect()
        mapRef.current.remove()
        mapRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ------------------------------------------------------------- data loads
  const loadTerritories = useCallback(async () => {
    if (!companyId) return
    const { data, error } = await supabase
      .from('sales_territories').select('*').eq('company_id', companyId).order('name')
    if (error) {
      // Table missing → migration not applied yet. Surface once, keep the map usable.
      if (/sales_territories/.test(error.message)) notify('Run the Liahona migration to enable territories')
      return
    }
    setTerritories(data || [])
  }, [companyId, notify])

  useEffect(() => { loadTerritories() }, [loadTerritories])

  useEffect(() => {
    if (!companyId) return
    supabase.from('utility_providers').select('id, provider_name, state, service_territory')
      .eq('company_id', companyId).order('provider_name')
      .then(({ data }) => setUtilityProviders(data || []))
  }, [companyId])

  // --------------------------------------------------------------- lead pins
  useEffect(() => {
    const L = window.L, g = groupsRef.current.pins
    if (!ready || !L || !g) return
    g.clearLayers()
    for (const lead of visibleLeads) {
      const stage = stageById[lead.status]
      const color = stage?.color || '#71717a'
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:16px;height:16px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.45)"></div>`,
        iconSize: [16, 16], iconAnchor: [8, 16], tooltipAnchor: [0, -14]
      })
      const m = L.marker([Number(lead.latitude), Number(lead.longitude)], { icon, draggable: true })
      m.bindTooltip(`<b>${esc(lead.customer_name || lead.business_name || 'Lead')}</b><br>${esc(stage?.name || lead.status)}${lead.address ? '<br>' + esc(lead.address) : ''}`, { direction: 'top' })
      m.on('click', () => { if (modeRef.current === 'select') onSelectLead?.(lead) })
      m.on('dragend', async e => {
        const p = e.target.getLatLng()
        const { error } = await supabase.from('leads')
          .update({ latitude: p.lat, longitude: p.lng, geocoded_at: new Date().toISOString() }).eq('id', lead.id)
        if (error) notify('Could not move pin: ' + error.message)
        else { notify('Pin moved'); onLeadsChanged?.() }
      })
      m.addTo(g)
    }
  }, [ready, visibleLeads, stageById, onSelectLead, onLeadsChanged, notify])

  // ------------------------------------------------------------- territories
  useEffect(() => {
    const L = window.L, g = groupsRef.current.territories
    if (!ready || !L || !g) return
    g.clearLayers()
    if (!activeOverlays.has('territories')) return
    for (const tr of territories) {
      const sel = tr.id === selectedTerritoryId
      const layer = L.geoJSON(tr.polygon, {
        style: { color: tr.color || t.accent, weight: sel ? 4 : 2, fillOpacity: sel ? 0.18 : 0.08 }
      })
      const c = territoryCounts[tr.id] || { leads: 0, customers: 0 }
      const owner = employeeById[tr.owner_id]?.name
      layer.bindTooltip(`<b>${esc(tr.name)}</b><br>${c.leads} leads · ${c.customers} customers${owner ? '<br>' + esc(owner) : ''}${tr.utility_name ? '<br>' + esc(tr.utility_name) : ''}`, { sticky: true })
      layer.on('click', () => { if (modeRef.current === 'select') setSelectedTerritoryId(tr.id) })
      layer.addTo(g)
    }
  }, [ready, territories, selectedTerritoryId, territoryCounts, employeeById, activeOverlays, t.accent])

  // ------------------------------------------------------------ draw preview
  useEffect(() => {
    const L = window.L, g = groupsRef.current.draw
    if (!ready || !L || !g) return
    g.clearLayers()
    if (!drawPts.length) return
    const ll = drawPts.map(p => [p.lat, p.lng])
    if (ll.length >= 3) L.polygon(ll, { color: t.accent, weight: 2, dashArray: '6 4', fillOpacity: 0.08 }).addTo(g)
    else L.polyline(ll, { color: t.accent, weight: 2, dashArray: '6 4' }).addTo(g)
    ll.forEach((p, i) => L.circleMarker(p, { radius: i === 0 ? 6 : 4, color: '#fff', weight: 2, fillColor: t.accent, fillOpacity: 1 }).addTo(g))
  }, [ready, drawPts, t.accent])

  // ---------------------------------------------------------------- overlays
  useEffect(() => {
    const L = window.L, map = mapRef.current
    if (!ready || !L || !map) return
    const zoom = map.getZoom(), bounds = map.getBounds()

    for (const ov of OVERLAYS) {
      const on = activeOverlays.has(ov.id)
      const existing = overlayLayersRef.current[ov.id]

      if (ov.kind === 'internal') {
        if (ov.id === 'customers') {
          const g = groupsRef.current.customers; g.clearLayers()
          if (on) customers.filter(hasCoords).forEach(l => {
            L.circleMarker([Number(l.latitude), Number(l.longitude)], { radius: 5, color: '#fff', weight: 1.5, fillColor: '#16a34a', fillOpacity: 0.95 })
              .bindTooltip(`<b>${esc(l.customer_name || l.business_name || 'Customer')}</b><br>${esc(stageById[l.status]?.name || l.status)}`)
              .on('click', () => { if (modeRef.current === 'select') onSelectLead?.(l) })
              .addTo(g)
          })
        }
        if (ov.id === 'reps') {
          const g = groupsRef.current.reps; g.clearLayers()
          if (on && companyId) {
            setOverlayStatus(s => ({ ...s, reps: 'loading' }))
            fetchRepLocations(companyId).then(pings => {
              g.clearLayers()
              pings.forEach(p => {
                const emp = employeeById[p.employee_id]
                const icon = L.divIcon({ className: '', html: `<div style="width:26px;height:26px;border-radius:50%;background:${t.accent};color:#fff;font:700 11px system-ui;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${esc(initials(emp?.name))}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] })
                L.marker([p.lat, p.lng], { icon, interactive: true })
                  .bindTooltip(`<b>${esc(emp?.name || 'Rep')}</b><br>${minutesAgo(p.pinged_at)} min ago`).addTo(g)
              })
              setOverlayStatus(s => ({ ...s, reps: pings.length ? 'ok' : 'empty' }))
            }).catch(() => setOverlayStatus(s => ({ ...s, reps: 'error' })))
          }
        }
        continue
      }

      if (ov.kind === 'raster') {
        if (on && !existing) {
          setOverlayStatus(s => ({ ...s, [ov.id]: 'loading' }))
          fetchRadarTileTemplate().then(tpl => {
            if (!tpl || !activeOverlays.has(ov.id) || overlayLayersRef.current[ov.id]) return
            const layer = L.tileLayer(tpl.url, { opacity: 0.65, maxZoom: 19 }).addTo(map)
            overlayLayersRef.current[ov.id] = layer
            setOverlayStatus(s => ({ ...s, [ov.id]: 'ok' }))
          }).catch(() => setOverlayStatus(s => ({ ...s, [ov.id]: 'error' })))
        } else if (!on && existing) {
          map.removeLayer(existing); delete overlayLayersRef.current[ov.id]
        }
        continue
      }

      // boundary layers
      if (!on) {
        if (existing) { groupsRef.current.overlays.removeLayer(existing); delete overlayLayersRef.current[ov.id]; delete overlayExtentRef.current[ov.id] }
        continue
      }
      if (zoom < ov.minZoom) {
        if (existing) { groupsRef.current.overlays.removeLayer(existing); delete overlayLayersRef.current[ov.id]; delete overlayExtentRef.current[ov.id] }
        setOverlayStatus(s => ({ ...s, [ov.id]: 'zoom' }))
        continue
      }
      // Fetch a padded extent and keep it while the view stays inside it, so
      // small pans (and popup auto-pans) don't rebuild the layer under the user.
      const extent = overlayExtentRef.current[ov.id]
      if (existing && extent && extent.zoom === zoom && extent.bounds.contains(bounds)) continue
      const fetchBounds = bounds.pad(0.6)
      const reqId = (overlayReqRef.current[ov.id] || 0) + 1
      overlayReqRef.current[ov.id] = reqId
      setOverlayStatus(s => ({ ...s, [ov.id]: 'loading' }))
      fetchBoundary(ov, fetchBounds, zoom).then(fc => {
        if (overlayReqRef.current[ov.id] !== reqId || !mapRef.current) return
        const prev = overlayLayersRef.current[ov.id]
        if (prev) groupsRef.current.overlays.removeLayer(prev)
        const layer = L.geoJSON(fc, {
          style: { color: ov.color, weight: 1.5, fillOpacity: 0.05, dashArray: ov.id === 'utilities' ? null : '4 3' },
          onEachFeature: (feature, lyr) => {
            const p = feature.properties
            lyr.bindTooltip(`<b>${esc(p.name)}</b><br>${esc(p.sub || ov.label)}`, { sticky: true })
            lyr.on('click', e => {
              if (modeRef.current !== 'select') return
              const el = document.createElement('div')
              el.style.font = '13px system-ui'
              el.innerHTML = `<div style="font-weight:700">${esc(p.name)}</div><div style="color:#666;margin-bottom:8px">${esc(p.sub || ov.label)}</div>`
              const btn = document.createElement('button')
              btn.textContent = 'Make this a territory'
              btn.style.cssText = `background:${t.accent};color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;font:600 12px system-ui`
              btn.onclick = () => { mapRef.current?.closePopup(); openTerritoryFromFeature(feature, ov) }
              el.appendChild(btn)
              // Popup lives on the map (not the layer) so a refetch can't remove it.
              L.popup({ autoPan: false }).setLatLng(e.latlng).setContent(el).openOn(mapRef.current)
            })
          }
        })
        groupsRef.current.overlays.addLayer(layer)
        overlayLayersRef.current[ov.id] = layer
        overlayExtentRef.current[ov.id] = { bounds: fetchBounds, zoom }
        setOverlayStatus(s => ({ ...s, [ov.id]: fc.features.length ? 'ok' : 'empty' }))
      }).catch(() => setOverlayStatus(s => ({ ...s, [ov.id]: 'error' })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, activeOverlays, moveTick, customers, companyId, employeeById, stageById])

  // -------------------------------------------------------------- handlers
  const handleMapClick = async latlng => {
    const m = modeRef.current
    if (m === 'draw') {
      setDrawPts([...drawPtsRef.current, { lat: latlng.lat, lng: latlng.lng }])
    } else if (m === 'drop') {
      const form = { lat: latlng.lat, lng: latlng.lng, address: '', customer_name: '', phone: '', resolving: true }
      setDropForm(form)
      const addr = await reverseGeocode(latlng.lat, latlng.lng)
      setDropForm(f => f && f.lat === form.lat ? { ...f, address: addr || '', resolving: false } : f)
    }
  }

  const finishDraw = () => {
    let pts = drawPtsRef.current
    // a finishing double-click adds two near-identical points; drop them
    while (pts.length > 1 && dist(pts[pts.length - 1], pts[pts.length - 2]) < 1e-6) pts = pts.slice(0, -1)
    if (pts.length < 3) { notify('Click at least 3 points'); return }
    const ring = pts.map(p => [Number(p.lng.toFixed(6)), Number(p.lat.toFixed(6))])
    ring.push(ring[0])
    openTerritoryForm({ type: 'Polygon', coordinates: [ring] }, `Territory ${territories.length + 1}`, 'drawn')
    setDrawPts([]); setMode('select')
  }

  const cancelDraw = () => { setDrawPts([]); setMode('select') }

  const openTerritoryForm = async (geometry, name, source, extra = {}) => {
    setSelectedTerritoryId(null); setDropForm(null)
    const form = {
      id: null, name, color: PALETTE[territories.length % PALETTE.length], geometry, source,
      owner_id: user?.id || '', utility_provider_id: '', utility_name: '', notes: '', detecting: !extra.utility_name, ...extra
    }
    setTerritoryForm(form)
    if (!extra.utility_name) {
      const c = geometryCentroid(geometry)
      const util = c ? await utilityAtPoint(c.lat, c.lng).catch(() => null) : null
      setTerritoryForm(f => {
        if (!f || f.geometry !== geometry) return f
        const match = util ? matchProvider(util.name) : null
        return { ...f, detecting: false, utility_name: util?.name || '', utility_provider_id: match?.id || '' }
      })
    }
  }

  const openTerritoryFromFeature = (feature, ov) => {
    const p = feature.properties
    const source = { counties: 'county', cities: 'city', zips: 'zip', utilities: 'utility' }[ov.id] || 'drawn'
    const extra = ov.id === 'utilities' ? { utility_name: p.name, utility_provider_id: matchProvider(p.name)?.id || '' } : {}
    openTerritoryForm(feature.geometry, p.name, source, extra)
  }

  const matchProvider = name => {
    if (!name) return null
    const n = name.toLowerCase().replace(/[^a-z0-9 ]/g, '')
    return utilityProviders.find(u => {
      const pn = (u.provider_name || '').toLowerCase().replace(/[^a-z0-9 ]/g, '')
      return pn && (n.includes(pn) || pn.includes(n))
    }) || null
  }

  const editTerritory = tr => {
    setTerritoryForm({
      id: tr.id, name: tr.name, color: tr.color, geometry: tr.polygon, source: tr.source,
      owner_id: tr.owner_id || '', utility_provider_id: tr.utility_provider_id || '', utility_name: tr.utility_name || '',
      notes: tr.notes || '', detecting: false
    })
  }

  const saveTerritory = async () => {
    const f = territoryForm
    if (!f?.name?.trim()) { notify('Give the territory a name'); return }
    setSaving(true)
    const row = {
      company_id: companyId, name: f.name.trim(), color: f.color, polygon: f.geometry, source: f.source,
      owner_id: f.owner_id ? Number(f.owner_id) : null,
      utility_provider_id: f.utility_provider_id ? Number(f.utility_provider_id) : null,
      utility_name: f.utility_provider_id
        ? (utilityProviders.find(u => String(u.id) === String(f.utility_provider_id))?.provider_name || f.utility_name || null)
        : (f.utility_name || null),
      notes: f.notes || null, updated_at: new Date().toISOString()
    }
    const q = f.id
      ? supabase.from('sales_territories').update(row).eq('id', f.id)
      : supabase.from('sales_territories').insert({ ...row, created_by: user?.id || null })
    const { error } = await q
    setSaving(false)
    if (error) { notify('Could not save: ' + error.message); return }
    setTerritoryForm(null)
    notify(f.id ? 'Territory updated' : 'Territory saved')
    loadTerritories()
  }

  const deleteTerritory = async tr => {
    if (!window.confirm(`Delete territory "${tr.name}"?`)) return
    const { error } = await supabase.from('sales_territories').delete().eq('id', tr.id)
    if (error) { notify('Could not delete: ' + error.message); return }
    if (selectedTerritoryId === tr.id) setSelectedTerritoryId(null)
    loadTerritories()
  }

  const zoomToTerritory = tr => {
    const L = window.L, map = mapRef.current
    if (!L || !map) return
    setSelectedTerritoryId(tr.id)
    map.fitBounds(L.geoJSON(tr.polygon).getBounds(), { padding: [20, 20] })
  }

  const fitToPins = () => {
    const map = mapRef.current
    if (!map || !visibleLeads.length) return
    map.fitBounds(visibleLeads.map(l => [Number(l.latitude), Number(l.longitude)]), { padding: [30, 30], maxZoom: 16 })
  }

  const runSearch = async () => {
    const q = searchText.trim()
    const L = window.L, map = mapRef.current
    if (!q || !L || !map) return
    setSearching(true)
    const hit = await geocodeAddress(q)
    setSearching(false)
    if (!hit) { notify('No match for that address'); return }
    map.setView([hit.lat, hit.lng], Math.max(map.getZoom(), 16))
    const g = groupsRef.current.search; g.clearLayers()
    const el = document.createElement('div')
    el.style.font = '13px system-ui'
    el.innerHTML = `<div style="font-weight:600;margin-bottom:8px">${esc(hit.formatted || q)}</div>`
    const btn = document.createElement('button')
    btn.textContent = 'Add lead here'
    btn.style.cssText = `background:${t.accent};color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;font:600 12px system-ui`
    btn.onclick = () => { map.closePopup(); setTerritoryForm(null); setDropForm({ lat: hit.lat, lng: hit.lng, address: hit.formatted || q, customer_name: '', phone: '', resolving: false }) }
    el.appendChild(btn)
    L.marker([hit.lat, hit.lng]).addTo(g).bindPopup(el).openPopup()
  }

  const saveDropLead = async () => {
    const f = dropForm
    if (!f) return
    if (!f.customer_name.trim() && !f.address.trim()) { notify('Add a name or address'); return }
    setSaving(true)
    const row = {
      company_id: companyId,
      customer_name: f.customer_name.trim() || f.address.trim(),
      phone: f.phone.trim() || null,
      address: f.address.trim() || null,
      latitude: f.lat, longitude: f.lng, geocoded_at: new Date().toISOString(),
      status: 'New', lead_source: 'Door Knock',
      lead_owner_id: user?.id || null, salesperson_id: user?.id || null
    }
    const { data, error } = await supabase.from('leads').insert(row).select().single()
    setSaving(false)
    if (error) { notify('Could not create lead: ' + error.message); return }
    setDropForm(null); setMode('select')
    groupsRef.current.search?.clearLayers()
    notify('Lead added')
    onLeadsChanged?.()
    if (data) onSelectLead?.(data)
  }

  const geocodeMissing = async () => {
    setGeocoding({ done: 0, total: unmappedCount })
    await geocodeMissingLeads(leads, (done, total) => setGeocoding({ done, total }))
    setGeocoding(null)
    onLeadsChanged?.()
    notify('Geocoding finished')
  }

  // ------------------------------------------------------------------ route
  // Take ownership of every unowned lead inside the filtered area.
  const claimUnassigned = async () => {
    const ids = unassignedInFilter.map(l => l.id)
    if (!ids.length || !user?.id) return
    if (!window.confirm(`Assign ${ids.length} unassigned lead${ids.length > 1 ? 's' : ''} in ${filterLabel} to you?`)) return
    setClaiming(true)
    const { error } = await supabase.from('leads').update({ lead_owner_id: user.id, updated_at: new Date().toISOString() }).in('id', ids).is('lead_owner_id', null)
    setClaiming(false)
    if (error) { notify('Could not assign: ' + error.message); return }
    notify(`${ids.length} lead${ids.length > 1 ? 's' : ''} assigned to you`)
    onLeadsChanged?.()
  }

  const planRoute = async () => {
    const L = window.L, map = mapRef.current
    if (!L || !map) return
    const b = map.getBounds()
    const open = visibleLeads.filter(l => {
      const s = stageById[l.status]
      return !s?.isWon && !s?.isLost && b.contains([Number(l.latitude), Number(l.longitude)])
    })
    if (open.length === 0) { notify('No open leads in view to route'); return }
    setRouting(true)
    // Chrome doesn't start the geolocation timeout until the permission prompt
    // is answered, so keep a hard deadline of our own and fall back to map center.
    const start = await new Promise(res => {
      if (!navigator.geolocation) return res(null)
      const done = setTimeout(() => res(null), 5000)
      navigator.geolocation.getCurrentPosition(
        p => { clearTimeout(done); res({ lat: p.coords.latitude, lng: p.coords.longitude, isYou: true }) },
        () => { clearTimeout(done); res(null) }, { timeout: 4000, maximumAge: 60000 }
      )
    }) || { lat: map.getCenter().lat, lng: map.getCenter().lng, isYou: false }

    // Nearest-neighbour order from the start point, capped for the directions APIs.
    let cur = start, left = open.map(l => ({ lat: Number(l.latitude), lng: Number(l.longitude), lead: l })), order = []
    while (left.length && order.length < 25) {
      let best = null, bd = Infinity
      for (const s of left) { const d = dist(cur, s); if (d < bd) { bd = d; best = s } }
      order.push(best); left = left.filter(x => x !== best); cur = best
    }

    let path = null, miles = null, minutes = null, provider = 'straight'
    if (googleMapsUsable()) {
      try {
        const google = await withTimeout(loadGoogleMaps(), 8000, 'Google Maps did not load').catch(e => { markGoogleMapsBroken(); throw e })
        const svc = new google.maps.DirectionsService()
        const res = await withTimeout(svc.route({
          origin: { lat: start.lat, lng: start.lng },
          destination: { lat: order[order.length - 1].lat, lng: order[order.length - 1].lng },
          waypoints: order.slice(0, -1).map(s => ({ location: { lat: s.lat, lng: s.lng }, stopover: true })),
          optimizeWaypoints: true,
          travelMode: google.maps.TravelMode.DRIVING
        }), 15000, 'Directions timed out')
        const r = res.routes[0]
        const mid = order.slice(0, -1)
        order = [...r.waypoint_order.map(i => mid[i]), order[order.length - 1]]
        path = r.overview_path.map(p => [p.lat(), p.lng()])
        miles = r.legs.reduce((s, l) => s + l.distance.value, 0) / 1609.34
        minutes = r.legs.reduce((s, l) => s + l.duration.value, 0) / 60
        provider = 'Google'
      } catch { /* fall back to OSRM */ }
    }
    if (!path) {
      try {
        const coords = [start, ...order].map(p => `${p.lng},${p.lat}`).join(';')
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`)
        const j = await res.json()
        const r = j.routes[0]
        path = r.geometry.coordinates.map(([lng, lat]) => [lat, lng])
        miles = r.distance / 1609.34; minutes = r.duration / 60; provider = 'OSRM'
      } catch {
        path = [start, ...order].map(p => [p.lat, p.lng])
      }
    }

    const g = groupsRef.current.route; g.clearLayers()
    L.polyline(path, { color: '#111', weight: 4, opacity: 0.75, dashArray: provider === 'straight' ? '6 6' : null }).addTo(g)
    if (start.isYou) L.circleMarker([start.lat, start.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }).bindTooltip('You').addTo(g)
    order.forEach((s, i) => L.marker([s.lat, s.lng], {
      icon: L.divIcon({ className: '', html: `<div style="background:#111;color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font:700 11px system-ui;border:2px solid #fff">${i + 1}</div>`, iconSize: [20, 20], iconAnchor: [10, 28] }),
      interactive: false
    }).addTo(g))
    setRoute({ start, stops: order, miles, minutes, provider })
    setRouting(false)
  }

  const clearRoute = () => { groupsRef.current.route?.clearLayers(); setRoute(null) }

  const googleMapsUrl = r => {
    const pts = r.stops.slice(0, 10)
    const dest = pts[pts.length - 1]
    const way = pts.slice(0, -1).map(p => `${p.lat},${p.lng}`).join('|')
    return `https://www.google.com/maps/dir/?api=1&origin=${r.start.lat},${r.start.lng}&destination=${dest.lat},${dest.lng}${way ? '&waypoints=' + encodeURIComponent(way) : ''}&travelmode=driving`
  }

  const toggleOverlay = id => setActiveOverlays(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })

  // --------------------------------------------------------------------- UI
  const btn = (active, extra = {}) => ({
    display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer',
    border: `1px solid ${active ? t.accent : t.border}`, backgroundColor: active ? t.accent : t.bgCard,
    color: active ? '#fff' : t.textSecondary, fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap', ...extra
  })
  const input = { width: '100%', padding: '7px 9px', border: `1px solid ${t.border}`, borderRadius: '6px', fontSize: '13px', backgroundColor: t.bgCard, color: t.text, boxSizing: 'border-box' }
  const label = { display: 'block', fontSize: '11px', fontWeight: 600, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '.05em', margin: '10px 0 4px' }
  const statusText = { loading: 'loading…', zoom: 'zoom in to load', error: 'unavailable', empty: 'none here' }

  const groupedOverlays = useMemo(() => {
    const g = {}
    for (const o of OVERLAYS) (g[o.group] = g[o.group] || []).push(o)
    return g
  }, [])

  if (loadError) {
    return <div style={{ padding: 24, color: t.textMuted, fontSize: 13 }}>Map could not load: {loadError}</div>
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: compact ? 'column' : 'row', minHeight: compact ? 0 : '480px', position: 'relative', overflow: 'hidden' }}>
      {/* ------------------------------------------------------- map column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px', borderBottom: `1px solid ${t.border}`, backgroundColor: t.bgCard, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
            <Search size={14} style={{ position: 'absolute', left: 8, top: 9, color: t.textMuted }} />
            <input
              value={searchText} onChange={e => setSearchText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') runSearch() }}
              placeholder="Search an address or area…"
              style={{ ...input, paddingLeft: 26 }}
            />
            {searching && <Loader2 size={14} style={{ position: 'absolute', right: 8, top: 9, color: t.textMuted, animation: 'spin 1s linear infinite' }} />}
          </div>
          <div style={{ display: 'inline-flex', border: `1px solid ${t.border}`, borderRadius: 6, overflow: 'hidden' }}>
            <button title="Select" onClick={() => { cancelDraw(); setMode('select') }} style={btn(mode === 'select', { border: 0, borderRadius: 0, padding: compact ? '9px 10px' : undefined })}><MousePointer2 size={compact ? 16 : 13} />{!compact && ' Select'}</button>
            <button title="Tap the map to add a lead" onClick={() => { cancelDraw(); setMode('drop') }} style={btn(mode === 'drop', { border: 0, borderRadius: 0, padding: compact ? '9px 10px' : undefined })}><MapPin size={compact ? 16 : 13} />{!compact && ' Drop lead'}</button>
            <button title="Tap points to outline a territory" onClick={() => setMode('draw')} style={btn(mode === 'draw', { border: 0, borderRadius: 0, padding: compact ? '9px 10px' : undefined })}><PenTool size={compact ? 16 : 13} />{!compact && ' Draw territory'}</button>
          </div>
          {territories.length > 0 && (
            <select value={territoryFilter} onChange={e => setTerritoryFilter(e.target.value)} title="Limit the map to a territory"
              style={{ ...input, width: 'auto', maxWidth: compact ? 150 : 200, padding: compact ? '8px 8px' : '6px 8px', fontSize: 12, fontWeight: 600, color: territoryFilter === 'all' ? t.textSecondary : t.accent, borderColor: territoryFilter === 'all' ? t.border : t.accent }}>
              <option value="all">All territories</option>
              {territories.some(tr => user?.id && String(tr.owner_id) === String(user.id)) && <option value="mine">My territories</option>}
              {territories.map(tr => <option key={tr.id} value={tr.id}>{tr.name}</option>)}
            </select>
          )}
          <button onClick={planRoute} disabled={routing} style={btn(false, compact ? { padding: '9px 10px' } : {})} title="Order the open leads in view into a driving route">
            {routing ? <Loader2 size={compact ? 16 : 13} style={{ animation: 'spin 1s linear infinite' }} /> : <Route size={compact ? 16 : 13} />}{!compact && ' Plan route'}
          </button>
          <div style={{ position: compact ? 'static' : 'relative' }}>
            <button onClick={() => setShowOverlayMenu(v => !v)} style={btn(showOverlayMenu, compact ? { padding: '9px 10px' } : {})}><Layers size={compact ? 16 : 13} />{!compact && ' Overlays'}{activeOverlays.size > 1 ? ` (${activeOverlays.size})` : ''}</button>
            {showOverlayMenu && (
              <div style={compact
                ? { position: 'absolute', left: 8, right: 8, top: 52, zIndex: 1200, backgroundColor: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.15)', padding: '6px 0', maxHeight: '60vh', overflowY: 'auto' }
                : { position: 'absolute', right: 0, top: '110%', zIndex: 1200, width: 280, backgroundColor: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.15)', padding: '6px 0' }}>
                {Object.entries(groupedOverlays).map(([group, items]) => (
                  <div key={group}>
                    <div style={{ ...label, padding: '0 12px', margin: '6px 0 2px' }}>{group}</div>
                    {items.map(o => {
                      const on = activeOverlays.has(o.id), st = overlayStatus[o.id]
                      return (
                        <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', cursor: 'pointer', fontSize: 13, color: t.text }}>
                          <input type="checkbox" checked={on} onChange={() => toggleOverlay(o.id)} />
                          {o.color && <span style={{ width: 10, height: 10, borderRadius: 2, background: o.color, flexShrink: 0 }} />}
                          <span style={{ flex: 1 }}>{o.label}{o.hint && <span style={{ display: 'block', fontSize: 11, color: t.textMuted }}>{o.hint}</span>}</span>
                          {on && st && st !== 'ok' && <span style={{ fontSize: 10, color: t.textMuted }}>{statusText[st]}</span>}
                        </label>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button onClick={fitToPins} style={btn(false, compact ? { padding: '9px 10px' } : {})} title="Fit map to the visible pins"><Maximize2 size={compact ? 16 : 13} /></button>
          {unmappedCount > 0 && (
            <button onClick={geocodeMissing} disabled={!!geocoding} style={btn(false, { color: '#b45309', borderColor: '#f3d7b3', padding: compact ? '9px 10px' : undefined })} title="Look up coordinates for leads that only have an address">
              {geocoding ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> {geocoding.done}/{geocoding.total}</> : <><LocateFixed size={compact ? 16 : 13} />{compact ? ` ${unmappedCount}` : ` Map ${unmappedCount} unpinned`}</>}
            </button>
          )}
        </div>

        {/* compact: the stage legend lives here (desktop uses the pipeline's stage strip) */}
        {compact && onToggleStage && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '6px 8px', borderBottom: `1px solid ${t.border}`, backgroundColor: t.bgCard, WebkitOverflowScrolling: 'touch', flexShrink: 0 }}>
            {stages.map(s => {
              const off = hiddenStages?.has(s.id)
              const n = geocodedLeads.filter(l => l.status === s.id).length
              return (
                <button key={s.id} onClick={() => onToggleStage(s.id)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, height: 30, padding: '0 10px', borderRadius: 15,
                  border: `1px solid ${off ? t.border : s.color}`, backgroundColor: off ? 'transparent' : s.color + '1a',
                  color: off ? t.textMuted : s.color, fontSize: 12, fontWeight: 600, opacity: off ? 0.6 : 1, cursor: 'pointer'
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: s.color }} />{s.name}{n > 0 && <span style={{ fontWeight: 400 }}>{n}</span>}
                </button>
              )
            })}
          </div>
        )}

        {/* map */}
        <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
          <div ref={mapDivRef} style={{ position: 'absolute', inset: 0, cursor: mode === 'select' ? '' : 'crosshair' }} />
          {mode !== 'select' && (
            <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, display: 'flex', alignItems: 'center', gap: 6, backgroundColor: '#111', color: '#fff', padding: '6px 10px', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,.3)' }}>
              {mode === 'drop' ? `${compact ? 'Tap' : 'Click'} the map where the lead is` : `${compact ? 'Tap' : 'Click'} to add points · ${drawPts.length} so far`}
              {mode === 'draw' && <>
                <button onClick={() => setDrawPts(drawPts.slice(0, -1))} disabled={!drawPts.length} style={{ ...btn(false, { padding: '3px 7px' }) }}><Undo2 size={12} /></button>
                <button onClick={finishDraw} disabled={drawPts.length < 3} style={btn(true, { padding: '3px 8px' })}><Check size={12} /> Finish</button>
              </>}
              <button onClick={() => { cancelDraw(); setDropForm(null) }} style={btn(false, { padding: '3px 7px' })}><X size={12} /></button>
            </div>
          )}
          {!ready && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.textMuted, fontSize: 13 }}>Loading map…</div>}
          {toast && <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, backgroundColor: '#111', color: '#fff', padding: '6px 12px', borderRadius: 8, fontSize: 12 }}>{toast}</div>}
        </div>
      </div>

      {/* ----------------------------------------------------- side panel / bottom sheet */}
      <div style={compact
        ? { position: 'relative', width: '100%', flexShrink: 0, height: sheetOpen ? '55%' : 'auto', borderTop: `1px solid ${t.border}`, backgroundColor: t.bgCard, overflowY: sheetOpen ? 'auto' : 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 -4px 12px rgba(0,0,0,.08)' }
        : { width: 300, flexShrink: 0, borderLeft: `1px solid ${t.border}`, backgroundColor: t.bgCard, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {compact && (
          <div onClick={() => setSheetOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
            <span style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: t.border, margin: '0 auto', position: 'absolute', left: 0, right: 0, top: 4 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: t.text, flex: 1, marginTop: 4 }}>
              {territoryForm ? (territoryForm.id ? 'Edit territory' : 'New territory') : dropForm ? 'New lead' : route ? `Route · ${route.stops.length} stops` : filterLabel ? `${filterLabel} · ${unassignedInFilter.length} unassigned` : `Territories · ${territories.length}`}
            </span>
            <span style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>{visibleLeads.length}/{leads.length} pinned · {sheetOpen ? 'hide' : 'show'}</span>
          </div>
        )}
        {(!compact || sheetOpen) && (<>
        {territoryForm ? (
          <div style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 14, color: t.text }}>{territoryForm.id ? 'Edit territory' : 'New territory'}</strong>
              <button onClick={() => setTerritoryForm(null)} style={btn(false, { padding: 4 })}><X size={13} /></button>
            </div>
            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
              {{ drawn: 'Drawn by hand', county: 'From county boundary', city: 'From city boundary', zip: 'From ZIP code', utility: 'From utility territory' }[territoryForm.source]}
            </div>
            <label style={label}>Name</label>
            <input style={input} value={territoryForm.name} onChange={e => setTerritoryForm({ ...territoryForm, name: e.target.value })} />
            <label style={label}>Color</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {PALETTE.map(c => <button key={c} onClick={() => setTerritoryForm({ ...territoryForm, color: c })} style={{ width: 22, height: 22, borderRadius: '50%', background: c, border: territoryForm.color === c ? '3px solid #111' : '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,.2)', cursor: 'pointer' }} />)}
            </div>
            <label style={label}>Owner</label>
            <select style={input} value={territoryForm.owner_id} onChange={e => setTerritoryForm({ ...territoryForm, owner_id: e.target.value })}>
              <option value="">Unassigned</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}{e.id === user?.id ? ' (Me)' : ''}</option>)}
            </select>
            <label style={label}>Utility {territoryForm.detecting && <span style={{ fontWeight: 400, textTransform: 'none' }}>· detecting…</span>}</label>
            {utilityProviders.length > 0 && (
              <select style={{ ...input, marginBottom: 6 }} value={territoryForm.utility_provider_id} onChange={e => setTerritoryForm({ ...territoryForm, utility_provider_id: e.target.value })}>
                <option value="">Not one of our providers</option>
                {utilityProviders.map(u => <option key={u.id} value={u.id}>{u.provider_name}{u.state ? ` (${u.state})` : ''}</option>)}
              </select>
            )}
            <input style={input} placeholder="Utility name (from the map)" value={territoryForm.utility_name} onChange={e => setTerritoryForm({ ...territoryForm, utility_name: e.target.value })} />
            <label style={label}>Notes</label>
            <textarea style={{ ...input, minHeight: 60 }} value={territoryForm.notes} onChange={e => setTerritoryForm({ ...territoryForm, notes: e.target.value })} />
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              <button onClick={saveTerritory} disabled={saving} style={btn(true, { flex: 1, justifyContent: 'center' })}>{saving ? 'Saving…' : 'Save territory'}</button>
              <button onClick={() => setTerritoryForm(null)} style={btn(false)}>Cancel</button>
            </div>
          </div>
        ) : dropForm ? (
          <div style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 14, color: t.text }}>New lead</strong>
              <button onClick={() => setDropForm(null)} style={btn(false, { padding: 4 })}><X size={13} /></button>
            </div>
            <label style={label}>Address {dropForm.resolving && <span style={{ fontWeight: 400, textTransform: 'none' }}>· looking up…</span>}</label>
            <AddressAutocomplete value={dropForm.address} style={input} placeholder="Street address"
              onChange={text => setDropForm(f => f && ({ ...f, address: text }))}
              onSelect={geo => { if (!geo) return; setDropForm(f => f && ({ ...f, address: geo.address, lat: geo.lat, lng: geo.lng })); mapRef.current?.panTo([geo.lat, geo.lng]) }} />
            <label style={label}>Customer name</label>
            <input style={input} value={dropForm.customer_name} onChange={e => setDropForm({ ...dropForm, customer_name: e.target.value })} autoFocus />
            <label style={label}>Phone</label>
            <input style={input} value={dropForm.phone} onChange={e => setDropForm({ ...dropForm, phone: e.target.value })} />
            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 8 }}>Starts in New, owned by you, source Door Knock. Edit anything else from the lead detail.</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              <button onClick={saveDropLead} disabled={saving} style={btn(true, { flex: 1, justifyContent: 'center' })}>{saving ? 'Saving…' : 'Add lead'}</button>
              <button onClick={() => setDropForm(null)} style={btn(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            {route && (
              <div style={{ padding: 12, borderBottom: `1px solid ${t.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: 13, color: t.text }}>Route · {route.stops.length} stops</strong>
                  <button onClick={clearRoute} style={btn(false, { padding: 4 })} title="Clear route"><X size={13} /></button>
                </div>
                <div style={{ fontSize: 12, color: t.textMuted, margin: '2px 0 8px' }}>
                  {route.miles != null ? `${route.miles.toFixed(1)} mi · ${Math.round(route.minutes)} min driving (${route.provider})` : 'Straight-line order (directions unavailable)'}
                  {!route.start.isYou && ' · from map center'}
                </div>
                <a href={googleMapsUrl(route)} target="_blank" rel="noreferrer" style={{ ...btn(true, { textDecoration: 'none', justifyContent: 'center', width: '100%', boxSizing: 'border-box' }) }}><ExternalLink size={12} /> Open in Google Maps{route.stops.length > 10 ? ' (first 10)' : ''}</a>
                <ol style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 12, color: t.text }}>
                  {route.stops.map((s, i) => (
                    <li key={i} style={{ marginBottom: 3, cursor: 'pointer' }} onClick={() => onSelectLead?.(s.lead)}>
                      {s.lead.customer_name || s.lead.business_name || 'Lead'}
                      <span style={{ color: t.textMuted }}> · {stageById[s.lead.status]?.name || s.lead.status}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {filterLabel && (
              <div style={{ margin: 12, marginBottom: 0, padding: '10px 12px', borderRadius: 8, backgroundColor: t.accentBg, border: `1px solid ${t.accent}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ fontSize: 13, color: t.text, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Filter size={13} /> {filterLabel}</strong>
                  <button onClick={() => setTerritoryFilter('all')} style={btn(false, { padding: '3px 7px' })} title="Show all leads"><X size={12} /></button>
                </div>
                <div style={{ fontSize: 12, color: t.textSecondary, marginTop: 4 }}>
                  {visibleLeads.length} lead{visibleLeads.length === 1 ? '' : 's'} on the map · {unassignedInFilter.length} unassigned
                  {filterPolygons && filterPolygons.length === 0 && ' · you own no territories yet'}
                </div>
                {unassignedInFilter.length > 0 && user?.id && (
                  <button onClick={claimUnassigned} disabled={claiming} style={btn(true, { marginTop: 8, width: '100%', justifyContent: 'center', boxSizing: 'border-box' })}>
                    <UserPlus size={13} /> {claiming ? 'Assigning…' : `Assign ${unassignedInFilter.length} unassigned to me`}
                  </button>
                )}
              </div>
            )}

            <div style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <strong style={{ fontSize: 13, color: t.text }}>Territories</strong>
                <span style={{ fontSize: 11, color: t.textMuted }}>{territories.length}</span>
              </div>
              {territories.length === 0 && (
                <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
                  None yet. Use <b>Draw territory</b> to outline one, or turn on a boundary overlay and click a county, city, ZIP, or utility area to make it a territory.
                </div>
              )}
              {territories.map(tr => {
                const c = territoryCounts[tr.id] || { leads: 0, customers: 0 }
                const sel = tr.id === selectedTerritoryId
                return (
                  <div key={tr.id} onClick={() => zoomToTerritory(tr)} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 6px', borderRadius: 6, cursor: 'pointer', backgroundColor: sel ? t.accentBg : 'transparent', borderBottom: `1px solid ${t.border}` }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: tr.color, marginTop: 3, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr.name}</div>
                      <div style={{ fontSize: 11, color: t.textMuted }}>
                        {c.leads} leads · {c.customers} customers{c.unassigned > 0 && <> · <span style={{ color: '#b45309' }}>{c.unassigned} unassigned</span></>}
                        {employeeById[tr.owner_id] && <> · {employeeById[tr.owner_id].name}</>}
                      </div>
                      {tr.utility_name && <div style={{ fontSize: 11, color: t.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>⚡ {tr.utility_name}</div>}
                    </div>
                    <button onClick={e => { e.stopPropagation(); setTerritoryFilter(String(territoryFilter) === String(tr.id) ? 'all' : String(tr.id)) }} style={btn(String(territoryFilter) === String(tr.id), { padding: 4 })} title={String(territoryFilter) === String(tr.id) ? 'Show all leads' : 'Show only this territory'}><Filter size={12} /></button>
                    <button onClick={e => { e.stopPropagation(); editTerritory(tr) }} style={btn(false, { padding: 4 })} title="Edit"><Pencil size={12} /></button>
                    <button onClick={e => { e.stopPropagation(); deleteTerritory(tr) }} style={btn(false, { padding: 4, color: '#b91c1c' })} title="Delete"><Trash2 size={12} /></button>
                  </div>
                )
              })}
            </div>

            <div style={{ padding: '4px 12px 12px', fontSize: 11, color: t.textMuted, marginTop: 'auto' }}>
              {visibleLeads.length} of {leads.length} leads pinned{filterLabel ? ` · in ${filterLabel}` : ''}{hiddenStages?.size ? ` · ${hiddenStages.size} stage${hiddenStages.size > 1 ? 's' : ''} hidden` : ''}. {compact ? 'Tap' : 'Click'} a stage above to show or hide it.
            </div>
          </>
        )}
        </>)}
      </div>
    </div>
  )
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}
