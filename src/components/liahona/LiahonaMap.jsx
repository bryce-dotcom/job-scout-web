// Liahona — the map view of the Sales Pipeline (Board | Liahona toggle).
//
// What it does:
//   - Pins every geocoded sales lead, colored by pipeline stage. Click a pin to
//     open the same detail panel the board uses; drag a pin to fix its spot.
//   - Drop mode: click the map to create a lead at that address.
//   - Territories: draw a polygon, or lift a county / city / ZIP / utility
//     boundary straight off an overlay. Each territory gets an owner and a
//     utility, and shows how many leads and customers fall inside it. A filter
//     limits the map to one territory or the rep's own, with a one-tap claim
//     of the unowned leads inside.
//   - Route: orders the open leads in view from your location and draws the
//     drive (Google Directions when a Maps key is set, OSRM otherwise).
//   - Overlays: sales territories, customers & jobs, reps on the clock,
//     electric utility territories, counties, cities, ZIP codes, weather radar.
//
// This file owns state, the Leaflet layers, and the writes. The toolbar,
// forms and panels are presentational siblings in this folder; routing.js and
// util.js hold the non-React pieces.

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { geocodeAddress, reverseGeocode, reverseGeocodeArea, geocodeMissingLeads } from '../../lib/geocode'
import {
  OVERLAYS, fetchBoundary, utilityAtPoint, fetchRadarTileTemplate,
  fetchRepLocations, pointInGeometry, geometryCentroid
} from '../../lib/mapOverlays'
import { X, Check, Undo2 } from 'lucide-react'
import ProspectResearchDrawer from '../ProspectResearchDrawer'
import { callProspectResearch, takeProspectsHandoff } from '../../lib/prospectResearch'
import { parcelAt, parcelsInBounds, parcelSummary, neighborsAround, setParcelCompany } from '../../lib/parcels'
import { isCompanyName, parcelAddress, parcelNotes, leadRowFromParcel } from './leadRows'
import NeighborsPanel from './NeighborsPanel'
import LeadCard from './LeadCard'
import {
  PALETTE, US_CENTER, themeTokens, makeStyles, ensureLeaflet, hasCoords, dist, initials, minutesAgo, esc, loadView, saveView
} from './util'
import { getStartPoint, buildRoute, drawRoute } from './routing'
import LiahonaToolbar from './LiahonaToolbar'
import StageChips from './StageChips'
import TerritoryForm from './TerritoryForm'
import DropLeadForm from './DropLeadForm'
import RoutePanel from './RoutePanel'
import TerritoryPanel from './TerritoryPanel'

// compact: phone layout — toolbar becomes icon buttons, the stage legend moves
// into the map (via onToggleStage), and the side panel becomes a bottom sheet.
export default function LiahonaMap({
  leads = [], customers = [], stages = [], hiddenStages, companyId, employees = [], user, theme,
  onSelectLead, onLeadsChanged, compact = false, onToggleStage,
  onChangeStage, followUpsByLead, employeeId, onLogged,
  canManage = false   // managers assign leads and territories to any rep; reps only to themselves
}) {
  const t = themeTokens(theme)
  const { btn } = makeStyles(t)

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
  // Find Prospects AI: the drawer, and the address research on a dropped pin.
  const [showFindProspects, setShowFindProspects] = useState(false)
  // The area on screen when Find Prospects opens: { lat, lng, radius_km, label }.
  // The search is scoped to it, so "auto repair shops" means the ones here.
  const [mapArea, setMapArea] = useState(null)
  const [researching, setResearching] = useState(false)
  const [researchError, setResearchError] = useState('')
  // Cloverleaf: { lat, lng, label, radiusFt, loading, items, origin, reason, provider, county }
  const [neighbors, setNeighbors] = useState(null)
  const [neighborSel, setNeighborSel] = useState(() => new Set())
  const [addingNeighbors, setAddingNeighbors] = useState(false)
  const neighborsReqRef = useRef(0)
  const loadNeighborsRef = useRef(null)
  // The pin the rep tapped: the card in the panel reads the live lead by id
  // so a stage change or a logged knock shows the moment the list refreshes.
  const [activeLeadId, setActiveLeadId] = useState(null)
  const [changingStage, setChangingStage] = useState(null)
  const openLeadRef = useRef(null)

  const setMode = m => { modeRef.current = m; setModeState(m) }
  const setDrawPts = pts => { drawPtsRef.current = pts; setDrawPtsState(pts) }
  const notify = useCallback(msg => { setToast(msg); setTimeout(() => setToast(''), 2500) }, [])

  // ----------------------------------------------------------- derived data
  const stageById = useMemo(() => Object.fromEntries(stages.map(s => [s.id, s])), [stages])
  const employeeById = useMemo(() => Object.fromEntries(employees.map(e => [e.id, e])), [employees])
  // Owners the map just changed, shown at once while the pipeline refetches.
  // Cleared the moment a fresh lead list arrives, so the truth always wins.
  const [ownerPatch, setOwnerPatch] = useState({})
  useEffect(() => { setOwnerPatch({}) }, [leads])
  const geocodedLeads = useMemo(
    () => leads.filter(hasCoords).map(l => ownerPatch[l.id] !== undefined ? { ...l, lead_owner_id: ownerPatch[l.id] } : l),
    [leads, ownerPatch]
  )
  const patchOwners = (ids, ownerId) => setOwnerPatch(p => { const n = { ...p }; for (const id of ids) n[id] = ownerId; return n })
  const unmappedCount = useMemo(() => leads.filter(l => l.address && !hasCoords(l)).length, [leads])
  // Polygons the current filter selects; null = no territory filtering.
  const filterPolygons = useMemo(() => {
    // A remembered filter must never blank the map: with no territories at all
    // (or a territory that has since been deleted) there is nothing to filter by.
    if (territoryFilter === 'all' || territories.length === 0) return null
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

  // Leads / customers inside each territory, plus the ids a manager can hand
  // to the territory's owner (unowned, or owned by someone else).
  const territoryCounts = useMemo(() => {
    const out = {}
    for (const tr of territories) {
      const inside = geocodedLeads.filter(l => pointInGeometry(Number(l.latitude), Number(l.longitude), tr.polygon))
      const cust = customers.filter(l => hasCoords(l) && pointInGeometry(Number(l.latitude), Number(l.longitude), tr.polygon))
      const unowned = inside.filter(l => !l.lead_owner_id)
      const notOwners = tr.owner_id ? inside.filter(l => l.lead_owner_id && String(l.lead_owner_id) !== String(tr.owner_id)) : []
      out[tr.id] = { leads: inside.length, customers: cust.length, unassigned: unowned.length, unassignedIds: unowned.map(l => l.id), othersIds: notOwners.map(l => l.id) }
    }
    return out
  }, [territories, geocodedLeads, customers])

  // Workload per rep: territories owned, pinned leads owned, and how many of
  // those nobody has touched in two weeks. Managers use it to balance areas.
  const repStats = useMemo(() => {
    const stale = Date.now() - 14 * 86400e3
    const byRep = new Map()
    const bump = (id, k) => { if (!id) return; const r = byRep.get(String(id)) || { territories: 0, leads: 0, stale: 0 }; r[k]++; byRep.set(String(id), r) }
    for (const tr of territories) bump(tr.owner_id, 'territories')
    for (const l of geocodedLeads) {
      const s = stageById[l.status]
      if (s?.isWon || s?.isLost) continue
      bump(l.lead_owner_id, 'leads')
      if (new Date(l.updated_at || l.created_at || 0).getTime() < stale) bump(l.lead_owner_id, 'stale')
    }
    return [...byRep.entries()].map(([id, r]) => ({ id, name: employeeById[id]?.name || 'Former employee', ...r })).sort((a, b) => b.leads - a.leads)
  }, [territories, geocodedLeads, stageById, employeeById])

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
        search: L.layerGroup().addTo(map),
        prospects: L.layerGroup().addTo(map),
        neighbors: L.layerGroup().addTo(map)
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
  // Nationwide parcel lookups are metered per company.
  useEffect(() => { setParcelCompany(companyId) }, [companyId])

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
    // Leads on the same spot (units in one building, a strip mall, a city
    // centroid) would stack and only the top one could ever be tapped. Fan
    // them out in a ring by shifting the icon anchor in PIXELS, so the spread
    // holds at every zoom and the marker itself stays on the true point.
    const spotKey = l => `${Number(l.latitude).toFixed(5)},${Number(l.longitude).toFixed(5)}`
    const spots = new Map()
    for (const l of visibleLeads) spots.set(spotKey(l), (spots.get(spotKey(l)) || 0) + 1)
    const placed = new Map()
    for (const lead of visibleLeads) {
      const stage = stageById[lead.status]
      const color = stage?.color || '#71717a'
      const key = spotKey(lead), n = spots.get(key)
      let dx = 0, dy = 0
      if (n > 1) {
        const i = placed.get(key) || 0; placed.set(key, i + 1)
        const r = Math.min(40, 14 + Math.max(0, n - 8) * 1.5), a = (2 * Math.PI * i) / n - Math.PI / 2
        dx = Math.round(r * Math.cos(a)); dy = Math.round(r * Math.sin(a))
      }
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:16px;height:16px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.45)"></div>`,
        iconSize: [16, 16], iconAnchor: [8 - dx, 16 - dy], tooltipAnchor: [0, -14]
      })
      const m = L.marker([Number(lead.latitude), Number(lead.longitude)], { icon, draggable: true })
      m.bindTooltip(`<b>${esc(lead.customer_name || lead.business_name || 'Lead')}</b><br>${esc(stage?.name || lead.status)}${lead.address ? '<br>' + esc(lead.address) : ''}`, { direction: 'top' })
      m.on('click', () => {
        if (modeRef.current === 'neighbors') loadNeighborsRef.current?.(m.getLatLng(), lead.customer_name || lead.business_name || lead.address)
        else if (modeRef.current === 'select') openLeadRef.current?.(lead)
      })
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

      // boundary layers (incl. parcels, which pick their county source per view)
      if (!on) {
        if (existing) { groupsRef.current.overlays.removeLayer(existing); delete overlayLayersRef.current[ov.id]; delete overlayExtentRef.current[ov.id] }
        continue
      }
      if (ov.kind === 'parcels') {
        if (zoom < ov.minZoom) {
          if (existing) { groupsRef.current.overlays.removeLayer(existing); delete overlayLayersRef.current[ov.id]; delete overlayExtentRef.current[ov.id] }
          setOverlayStatus(s => ({ ...s, [ov.id]: 'zoom' }))
          continue
        }
        const pExtent = overlayExtentRef.current[ov.id]
        if (existing && pExtent && pExtent.zoom === zoom && pExtent.bounds.contains(bounds)) continue
        const pBounds = bounds.pad(0.3)
        const pReq = (overlayReqRef.current[ov.id] || 0) + 1
        overlayReqRef.current[ov.id] = pReq
        setOverlayStatus(s => ({ ...s, [ov.id]: 'loading' }))
        parcelsInBounds(pBounds).then(res => {
          if (overlayReqRef.current[ov.id] !== pReq || !mapRef.current) return
          const prev = overlayLayersRef.current[ov.id]
          if (prev) groupsRef.current.overlays.removeLayer(prev)
          if (res.reason === 'no-source' || res.reason === 'expired' || res.reason === 'error') { setOverlayStatus(s => ({ ...s, [ov.id]: res.reason === 'expired' ? 'expired' : res.reason === 'error' ? 'error' : 'nosource' })); return }
          const layer = L.geoJSON({ type: 'FeatureCollection', features: res.features }, {
            style: { color: ov.color, weight: 1, fillOpacity: 0.04 },
            onEachFeature: (feature, lyr) => {
              const pc = feature.properties
              lyr.bindTooltip(`<b>${esc(pc.address || pc.parcel_id)}</b>${pc.owner_name ? '<br>' + esc(pc.owner_name) : ''}<br>${esc(parcelSummary(pc) || pc.source_label)}`, { sticky: true })
              lyr.on('click', e => {
                if (modeRef.current !== 'select') return
                const el = document.createElement('div')
                el.style.font = '13px system-ui'
                el.innerHTML = `<div style="font-weight:700">${esc(pc.address || 'Parcel ' + pc.parcel_id)}</div>${pc.owner_name ? `<div style="color:#666">${esc(pc.owner_name)}</div>` : ''}<div style="color:#666;margin-bottom:8px">${esc(parcelSummary(pc))}</div>`
                const b = document.createElement('button')
                b.textContent = 'Add as lead'
                b.style.cssText = `background:${t.accent};color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;font:600 12px system-ui`
                b.onclick = () => { mapRef.current?.closePopup(); openDropFromParcel(pc, e.latlng) }
                el.appendChild(b)
                L.popup({ autoPan: false }).setLatLng(e.latlng).setContent(el).openOn(mapRef.current)
              })
            }
          })
          groupsRef.current.overlays.addLayer(layer)
          overlayLayersRef.current[ov.id] = layer
          overlayExtentRef.current[ov.id] = { bounds: pBounds, zoom }
          setOverlayStatus(s => ({ ...s, [ov.id]: res.features.length ? 'ok' : 'empty' }))
        }).catch(() => setOverlayStatus(s => ({ ...s, [ov.id]: 'error' })))
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
              const b = document.createElement('button')
              b.textContent = 'Make this a territory'
              b.style.cssText = `background:${t.accent};color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;font:600 12px system-ui`
              b.onclick = () => { mapRef.current?.closePopup(); openTerritoryFromFeature(feature, ov) }
              el.appendChild(b)
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

  // ------------------------------------------------- Find Prospects on the map
  // Search results that carry a street address become purple prospect pins.
  // Tapping one imports it as a lead (the function geocodes it on import).
  const plotProspects = useCallback(async list => {
    const L = window.L, g = groupsRef.current.prospects, map = mapRef.current
    if (!L || !g || !map) return
    g.clearLayers()
    const withAddr = (list || []).filter(p => (p.address || p.enrichment?.address || '').trim())
    if (!withAddr.length) { notify('No street addresses in these results to plot'); return }
    const placed = []
    for (const p of withAddr) {
      const addr = [p.enrichment?.address || p.address, p.city, p.state].filter(Boolean).join(', ')
      const hit = await geocodeAddress(addr)
      if (!hit) continue
      placed.push([hit.lat, hit.lng])
      const icon = L.divIcon({ className: '', html: `<div style="width:22px;height:22px;border-radius:50%;background:#7c3aed;color:#fff;display:flex;align-items:center;justify-content:center;font:700 13px system-ui;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">✦</div>`, iconSize: [22, 22], iconAnchor: [11, 11] })
      const m = L.marker([hit.lat, hit.lng], { icon }).addTo(g)
      m.bindTooltip(`<b>${esc(p.company_name || 'Prospect')}</b><br>${esc(addr)}${p.phone ? '<br>' + esc(p.phone) : ''}`, { direction: 'top' })
      m.on('click', () => {
        const el = document.createElement('div')
        el.style.font = '13px system-ui'
        el.innerHTML = `<div style="font-weight:700">${esc(p.company_name || 'Prospect')}</div><div style="color:#666">${esc(addr)}</div>${p.phone ? `<div style="color:#666">${esc(p.phone)}</div>` : ''}${p.why_it_matches ? `<div style="margin-top:4px">${esc(p.why_it_matches)}</div>` : ''}`
        const b = document.createElement('button')
        b.textContent = 'Import as lead'
        b.style.cssText = 'margin-top:8px;background:#7c3aed;color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;font:600 12px system-ui'
        b.onclick = async () => {
          b.disabled = true; b.textContent = 'Importing…'
          try {
            const res = await callProspectResearch('import', companyId, { candidate_ids: [p.candidate_id], salesperson_id: user?.id || undefined, lead_source: 'AI Prospect Research' })
            mapRef.current?.closePopup(); g.removeLayer(m)
            notify(res.imported ? 'Prospect added to the pipeline' : 'Already in the pipeline')
            onLeadsChanged?.()
          } catch (e) { b.disabled = false; b.textContent = 'Import as lead'; notify('Import failed: ' + e.message) }
        }
        el.appendChild(b)
        L.popup({ autoPan: true }).setLatLng(m.getLatLng()).setContent(el).openOn(map)
      })
    }
    if (placed.length) map.fitBounds(placed, { padding: [40, 40], maxZoom: 14 })
    notify(`${placed.length} of ${list.length} prospects placed on the map`)
  }, [companyId, user?.id, notify, onLeadsChanged])

  // Results handed over from the Lead Setter's Find Prospects drawer.
  useEffect(() => {
    if (!ready) return
    const handoff = takeProspectsHandoff()
    if (handoff) plotProspects(handoff)
  }, [ready, plotProspects])

  // Open Find Prospects scoped to what the map is showing.
  const openFindProspects = async () => {
    const map = mapRef.current
    if (!map) { setShowFindProspects(true); return }
    const c = map.getCenter(), ne = map.getBounds().getNorthEast()
    // half-diagonal of the view in km, clamped to something a search can mean
    const toRad = d => d * Math.PI / 180
    const dLat = toRad(ne.lat - c.lat), dLng = toRad(ne.lng - c.lng)
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(c.lat)) * Math.cos(toRad(ne.lat)) * Math.sin(dLng / 2) ** 2
    const radiusKm = Math.min(80, Math.max(2, Math.round(2 * 6371 * Math.asin(Math.sqrt(h)))))
    const label = await reverseGeocodeArea(c.lat, c.lng)
    setMapArea({ lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), radius_km: radiusKm, label: label || `${c.lat.toFixed(3)}, ${c.lng.toFixed(3)}` })
    setShowFindProspects(true)
  }

  // Ask Find Prospects AI what is at the dropped pin's address.
  const researchAddress = async () => {
    const f = dropForm
    if (!f?.address?.trim() || researching) return
    setResearching(true); setResearchError('')
    try {
      const pc = f.parcel
      const parcel = pc ? { source: pc.source_label, owner_of_record: pc.owner_name || '', year_built: pc.year_built || '', sqft: pc.sqft || '', lot_acres: pc.lot_acres || '', market_value: pc.market_value || '', last_sale: pc.last_sale_date ? `${pc.last_sale_date}${pc.last_sale_price ? ` $${pc.last_sale_price.toLocaleString()}` : ''}` : '', prop_class: pc.prop_class || '' } : undefined
      const res = await callProspectResearch('research_address', companyId, { address: f.address.trim(), lat: f.lat, lng: f.lng, parcel })
      const r = { ...res.research, candidate_id: res.candidate_id }
      setDropForm(cur => cur && ({
        ...cur, research: r,
        customer_name: cur.customer_name || r.occupant_or_owner_name || r.business_name || '',
        business_name: cur.business_name || r.business_name || '',
        phone: cur.phone || r.mobile_phone || r.phone || '',
        email: cur.email || r.email || ''
      }))
    } catch (e) {
      setResearchError(e.blocked ? e.message : `Research failed: ${e.message}`)
    } finally { setResearching(false) }
  }

  // -------------------------------------------------------------- handlers
  const handleMapClick = async latlng => {
    const m = modeRef.current
    if (m === 'draw') {
      setDrawPts([...drawPtsRef.current, { lat: latlng.lat, lng: latlng.lng }])
    } else if (m === 'drop') {
      startDropAt(latlng.lat, latlng.lng)
    } else if (m === 'neighbors') {
      loadNeighbors(latlng)
    }
  }

  // ------------------------------------------------------------ cloverleaf
  // The parcels around a point (a finished job, a lead, a tap), nearest
  // first, owner of record where the county publishes it. Parcels that
  // already hold a pinned lead are shown but not offered again.
  const loadNeighbors = async (latlng, label = '', radiusFt = neighbors?.radiusFt || 500) => {
    const lat = latlng.lat, lng = latlng.lng
    const req = ++neighborsReqRef.current
    setTerritoryForm(null); setDropForm(null); setActiveLeadId(null); setMode('select'); setSheetOpen(true)
    setNeighbors({ lat, lng, label, radiusFt, loading: true, items: [] })
    setNeighborSel(new Set())
    const r = await neighborsAround(lat, lng, radiusFt / 3.28084)
    if (req !== neighborsReqRef.current) return
    const items = r.neighbors.map((n, i) => {
      const key = String(n.parcel.parcel_id || `${n.lat},${n.lng}`) + ':' + i
      const lead = geocodedLeads.find(l => pointInGeometry(Number(l.latitude), Number(l.longitude), n.parcel.geometry))
      return { ...n, key, lead: lead || null }
    })
    const originLabel = label || parcelAddress(r.origin?.parcel) || (await reverseGeocode(lat, lng).catch(() => '')) || 'this spot'
    if (req !== neighborsReqRef.current) return
    setNeighbors({ lat, lng, label: originLabel, radiusFt, loading: false, items, origin: r.origin, reason: r.reason, provider: r.provider, county: r.county })
    setNeighborSel(new Set(items.filter(i => !i.lead).map(i => i.key)))
    const map = mapRef.current
    if (map && items.length) map.fitBounds(items.map(i => [i.lat, i.lng]).concat([[lat, lng]]), { padding: [30, 30], maxZoom: 18 })
  }
  loadNeighborsRef.current = loadNeighbors

  // ------------------------------------------------------------- lead card
  const activeLead = useMemo(() => activeLeadId == null ? null : leads.find(l => String(l.id) === String(activeLeadId)) || null, [leads, activeLeadId])
  const openLeadCard = lead => {
    setTerritoryForm(null); setDropForm(null)
    setActiveLeadId(lead.id); setSheetOpen(true)
  }
  openLeadRef.current = openLeadCard

  const changeStage = async (lead, stageId) => {
    if (!onChangeStage) { onSelectLead?.(lead); return }
    setChangingStage(stageId)
    try { await onChangeStage(lead, stageId) } finally { setChangingStage(null) }
  }

  const closeNeighbors = () => { neighborsReqRef.current++; setNeighbors(null); setNeighborSel(new Set()); groupsRef.current.neighbors?.clearLayers() }

  const focusNeighbor = it => {
    const map = mapRef.current, L = window.L
    if (!map || !L) return
    map.panTo([it.lat, it.lng])
    const pc = it.parcel
    const el = document.createElement('div')
    el.style.font = '13px system-ui'
    el.innerHTML = `<div style="font-weight:700">${esc(pc.owner_name || parcelAddress(pc) || 'Parcel')}</div>${pc.owner_name ? `<div style="color:#666">${esc(parcelAddress(pc))}</div>` : ''}<div style="color:#666">${esc(parcelSummary(pc))}</div>`
    if (!it.lead) {
      const b = document.createElement('button')
      b.textContent = 'Add as lead'
      b.style.cssText = `margin-top:8px;background:${t.accent};color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;font:600 12px system-ui`
      b.onclick = () => { map.closePopup(); startDropAt(it.lat, it.lng, { address: parcelAddress(pc), parcel: pc }) }
      el.appendChild(b)
    }
    L.popup({ autoPan: true }).setLatLng([it.lat, it.lng]).setContent(el).openOn(map)
  }

  // Add every ticked neighbor as a New lead in one insert.
  const addNeighbors = async () => {
    const picked = (neighbors?.items || []).filter(i => !i.lead && neighborSel.has(i.key))
    if (!picked.length) return
    setAddingNeighbors(true)
    const rows = picked.map(i => leadRowFromParcel({ companyId, user, pc: i.parcel, lat: i.lat, lng: i.lng, leadSource: 'Cloverleaf', notes: `Neighbor of ${neighbors.label}` }))
    const { data, error } = await supabase.from('leads').insert(rows).select()
    setAddingNeighbors(false)
    if (error) { notify('Could not add leads: ' + error.message); return }
    const byKey = new Map(picked.map((p, i) => [p.key, data?.[i]]))
    setNeighbors(n => n && ({ ...n, items: n.items.map(i => byKey.has(i.key) ? { ...i, lead: byKey.get(i.key) || { status: 'New' } } : i) }))
    setNeighborSel(new Set())
    notify(`${rows.length} neighbor${rows.length > 1 ? 's' : ''} added as leads`)
    onLeadsChanged?.()
  }

  // Route the ticked neighbors from where the rep stands. Rows that are not
  // leads yet ride along as stand-ins (no id) so the route panel can list them.
  const routeNeighbors = async () => {
    const L = window.L, map = mapRef.current
    const picked = (neighbors?.items || []).filter(i => neighborSel.has(i.key) || i.lead)
    if (!L || !map || !picked.length) return
    setRouting(true)
    const start = await getStartPoint(map)
    const stops = picked.map(i => i.lead?.id ? i.lead : { latitude: i.lat, longitude: i.lng, customer_name: i.parcel.owner_name || parcelAddress(i.parcel) || 'Neighbor', status: 'New', _neighbor: i })
    const built = await buildRoute(start, stops)
    drawRoute(L, groupsRef.current.route, built)
    setRoute(built)
    setRouting(false)
  }

  // Outlines and numbered dots for the loaded neighbors; ticked ones are bold.
  useEffect(() => {
    const L = window.L, g = groupsRef.current.neighbors
    if (!ready || !L || !g) return
    g.clearLayers()
    if (!neighbors) return
    L.circle([neighbors.lat, neighbors.lng], { radius: neighbors.radiusFt / 3.28084, color: '#15803d', weight: 1, dashArray: '4 4', fill: false, interactive: false }).addTo(g)
    if (neighbors.origin?.parcel?.geometry) L.geoJSON(neighbors.origin.parcel.geometry, { style: { color: '#15803d', weight: 2, fillOpacity: 0.25, fillColor: '#15803d' }, interactive: false }).addTo(g)
    neighbors.items.forEach((it, i) => {
      const on = neighborSel.has(it.key), done = !!it.lead
      const color = done ? (stageById[it.lead.status]?.color || '#71717a') : '#15803d'
      if (it.parcel.geometry) L.geoJSON(it.parcel.geometry, { style: { color, weight: on ? 2 : 1, fillOpacity: on ? 0.18 : 0.06, fillColor: color }, interactive: false }).addTo(g)
      const icon = L.divIcon({ className: '', html: `<div style="width:20px;height:20px;border-radius:50%;background:${done ? color : on ? '#15803d' : '#fff'};color:${done || on ? '#fff' : '#15803d'};border:2px solid ${color};display:flex;align-items:center;justify-content:center;font:700 11px system-ui;box-shadow:0 1px 3px rgba(0,0,0,.35)">${i + 1}</div>`, iconSize: [20, 20], iconAnchor: [10, 10] })
      L.marker([it.lat, it.lng], { icon }).on('click', () => focusNeighbor(it)).addTo(g)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, neighbors, neighborSel, stageById])

  // Every way of starting a lead at a point comes through here: map tap,
  // "Add lead here" after an address search, a parcel on the overlay.
  // Assessor parcel first (free, instant, exact situs address, owner where
  // the county publishes it); reverse geocode in parallel as the fallback.
  const startDropAt = async (lat, lng, { address = '', parcel: known = null } = {}) => {
    setTerritoryForm(null); setActiveLeadId(null)
    const form = { lat, lng, address, customer_name: '', business_name: '', phone: '', email: '', resolving: !address, parcelLoading: !known, parcel: known }
    setDropForm(form)
    if (known) { applyParcelToForm(known, form); return }
    const [addr, pr] = await Promise.all([address ? Promise.resolve(address) : reverseGeocode(lat, lng), parcelAt(lat, lng)])
    setDropForm(f => f && f.lat === form.lat && f.lng === form.lng ? {
      ...f, resolving: false, parcelLoading: false, parcel: pr.parcel, parcelReason: pr.parcel ? null : pr.reason,
      address: f.address || addr || ''
    } : f)
    if (pr.parcel) applyParcelToForm(pr.parcel, form)
  }

  const applyParcelToForm = (pc, form) => {
    const parcelAddr = parcelAddress(pc)
    setDropForm(f => f && f.lat === form.lat && f.lng === form.lng ? {
      ...f, parcel: pc, parcelLoading: false, parcelReason: null,
      address: parcelAddr || f.address,
      customer_name: f.customer_name || (pc.owner_name && !isCompanyName(pc.owner_name) ? pc.owner_name : ''),
      business_name: f.business_name || (pc.owner_name && isCompanyName(pc.owner_name) ? pc.owner_name : '')
    } : f)
  }

  // "Add as lead" from a parcel on the assessor overlay: the drop form, already
  // filled from the county record, no tap-and-wait.
  const openDropFromParcel = (pc, latlng) => {
    startDropAt(pc.lat ?? latlng.lat, pc.lng ?? latlng.lng, { address: [pc.address, pc.city, pc.zip].filter(Boolean).join(', '), parcel: pc })
    setMode('select')
  }

  const changeMode = m => {
    if (m !== 'draw') { setDrawPts([]) }
    setMode(m)
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

  const matchProvider = name => {
    if (!name) return null
    const n = name.toLowerCase().replace(/[^a-z0-9 ]/g, '')
    return utilityProviders.find(u => {
      const pn = (u.provider_name || '').toLowerCase().replace(/[^a-z0-9 ]/g, '')
      return pn && (n.includes(pn) || pn.includes(n))
    }) || null
  }

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

  const editTerritory = tr => {
    setTerritoryForm({
      id: tr.id, name: tr.name, color: tr.color, geometry: tr.polygon, source: tr.source,
      owner_id: tr.owner_id || '', prev_owner_id: tr.owner_id || '', hand_leads: true,
      utility_provider_id: tr.utility_provider_id || '', utility_name: tr.utility_name || '',
      notes: tr.notes || '', detecting: false
    })
  }

  // Leads a change of territory owner would carry along: the ones the old
  // owner held inside it, plus any nobody owns.
  const handoverIds = useMemo(() => {
    const f = territoryForm
    if (!f?.geometry || !f.owner_id || String(f.owner_id) === String(f.prev_owner_id || '')) return []
    return geocodedLeads
      .filter(l => pointInGeometry(Number(l.latitude), Number(l.longitude), f.geometry))
      .filter(l => !l.lead_owner_id || (f.prev_owner_id && String(l.lead_owner_id) === String(f.prev_owner_id)))
      .map(l => l.id)
  }, [territoryForm, geocodedLeads])

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
    if (error) { setSaving(false); notify('Could not save: ' + error.message); return }
    // A new owner takes the old owner's leads inside the territory with them
    // (and any unowned ones) when the manager leaves the box ticked.
    let handed = 0
    if (f.id && f.hand_leads && handoverIds.length && row.owner_id && (canManage || String(row.owner_id) === String(user?.id))) {
      const { error: e2 } = await supabase.from('leads').update({ lead_owner_id: row.owner_id, updated_at: new Date().toISOString() }).in('id', handoverIds)
      if (e2) notify('Territory saved, but its leads were not reassigned: ' + e2.message)
      else { handed = handoverIds.length; patchOwners(handoverIds, row.owner_id); onLeadsChanged?.() }
    }
    setSaving(false)
    setTerritoryForm(null)
    notify(f.id ? (handed ? `Territory updated · ${handed} lead${handed > 1 ? 's' : ''} handed to ${employeeById[row.owner_id]?.name || 'the new owner'}` : 'Territory updated') : 'Territory saved')
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
    const b = document.createElement('button')
    b.textContent = 'Add lead here'
    b.style.cssText = `background:${t.accent};color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;font:600 12px system-ui`
    b.onclick = () => { map.closePopup(); startDropAt(hit.lat, hit.lng, { address: hit.formatted || q }) }
    el.appendChild(b)
    const nb = document.createElement('button')
    nb.textContent = 'Neighbors'
    nb.style.cssText = `margin-left:6px;background:#fff;color:#15803d;border:1px solid #15803d;border-radius:6px;padding:6px 10px;cursor:pointer;font:600 12px system-ui`
    nb.onclick = () => { map.closePopup(); loadNeighbors({ lat: hit.lat, lng: hit.lng }, hit.formatted || q) }
    el.appendChild(nb)
    L.marker([hit.lat, hit.lng]).addTo(g).bindPopup(el).openPopup()
  }

  const saveDropLead = async () => {
    const f = dropForm
    if (!f) return
    if (!f.customer_name.trim() && !f.address.trim()) { notify('Add a name or address'); return }
    setSaving(true)
    const r = f.research
    const prop = r?.property || {}
    const pc = f.parcel
    const parcelNote = parcelNotes(pc)
    const researchNotes = r ? [
      `AI research (${r.kind || 'property'}${r.confidence ? `, ${r.confidence} confidence` : ''})`,
      r.website ? `Website: ${r.website}` : null,
      r.mobile_phone && r.mobile_phone !== f.phone ? `Mobile: ${r.mobile_phone}` : null,
      r.phone && r.phone !== f.phone ? `Phone: ${r.phone}` : null,
      [prop.type && `type ${prop.type}`, prop.year_built && `built ${prop.year_built}`, prop.sqft && `${prop.sqft} sq ft`, prop.lot_size && `lot ${prop.lot_size}`, prop.owner_of_record && `owner of record ${prop.owner_of_record}`, prop.last_sale && `last sale ${prop.last_sale}`, prop.assessed_value && `assessed ${prop.assessed_value}`].filter(Boolean).join(' · ') || null,
      r.notes || null,
      ...(r.source_urls || []).slice(0, 4).map(u => `Source: ${u}`)
    ].filter(Boolean).join('\n') : null
    const row = {
      company_id: companyId,
      customer_name: f.customer_name.trim() || f.address.trim(),
      business_name: (f.business_name || '').trim() || null,
      phone: f.phone.trim() || null,
      email: (f.email || '').trim() || null,
      address: f.address.trim() || null,
      latitude: f.lat, longitude: f.lng, geocoded_at: new Date().toISOString(),
      status: 'New', lead_source: 'Door Knock',
      lead_owner_id: user?.id || null, salesperson_id: user?.id || null,
      ...(r ? { external_prospect_id: r.candidate_id } : {}),
      ...(r || pc ? { enrichment_data: { ...(r || {}), parcel: pc ? { ...pc, geometry: undefined } : undefined }, notes: [parcelNote, researchNotes].filter(Boolean).join('\n\n') } : {})
    }
    const { data, error } = await supabase.from('leads').insert(row).select().single()
    setSaving(false)
    if (error) { notify('Could not create lead: ' + error.message); return }
    if (r?.candidate_id && data?.id) {
      supabase.from('prospect_enrichments').update({ imported_as_lead_id: data.id, imported_at: new Date().toISOString() })
        .eq('company_id', companyId).eq('external_prospect_id', r.candidate_id).then(() => {})
    }
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

  // Hand a set of leads to a rep. Reps may only take unowned leads for
  // themselves; managers may give any lead in a territory to its owner.
  const assignLeads = async (ids, ownerId, { where = 'this area', onlyUnowned = true } = {}) => {
    ownerId = ownerId || user?.id
    if (!ids.length || !ownerId) return
    if (!canManage && String(ownerId) !== String(user?.id)) { notify('Only a manager can assign leads to someone else'); return }
    const who = String(ownerId) === String(user?.id) ? 'you' : (employeeById[ownerId]?.name || 'that rep')
    if (!window.confirm(`Assign ${ids.length} lead${ids.length > 1 ? 's' : ''} in ${where} to ${who}?`)) return
    setClaiming(true)
    let q = supabase.from('leads').update({ lead_owner_id: Number(ownerId), updated_at: new Date().toISOString() }).in('id', ids)
    if (onlyUnowned || !canManage) q = q.is('lead_owner_id', null)
    const { error } = await q
    setClaiming(false)
    if (error) { notify('Could not assign: ' + error.message); return }
    patchOwners(ids, Number(ownerId))
    notify(`${ids.length} lead${ids.length > 1 ? 's' : ''} assigned to ${who}`)
    onLeadsChanged?.()
  }
  const claimUnassigned = (ownerId) => assignLeads(unassignedInFilter.map(l => l.id), ownerId, { where: filterLabel })
  // "Assign to owner" on a territory row: its unowned leads, and for a
  // manager also the ones other reps hold inside it.
  const assignTerritoryLeads = tr => {
    const c = territoryCounts[tr.id]
    if (!c || !tr.owner_id) return
    const ids = canManage ? [...c.unassignedIds, ...c.othersIds] : c.unassignedIds
    return assignLeads(ids, tr.owner_id, { where: tr.name, onlyUnowned: !canManage })
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
    const start = await getStartPoint(map)
    const built = await buildRoute(start, open)
    drawRoute(L, groupsRef.current.route, built)
    setRoute(built)
    setRouting(false)
  }

  const clearRoute = () => { groupsRef.current.route?.clearLayers(); setRoute(null) }

  const toggleOverlay = id => setActiveOverlays(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })

  // --------------------------------------------------------------------- UI
  if (loadError) {
    return <div style={{ padding: 24, color: t.textMuted, fontSize: 13 }}>Map could not load: {loadError}</div>
  }

  const sheetTitle = territoryForm ? (territoryForm.id ? 'Edit territory' : 'New territory')
    : dropForm ? 'New lead'
    : activeLead ? (activeLead.customer_name || activeLead.business_name || 'Lead')
    : neighbors ? (neighbors.loading ? 'Neighbors · looking…' : `Neighbors · ${neighbors.items.length} within ${neighbors.radiusFt} ft`)
    : route ? `Route · ${route.stops.length} stops`
    : filterLabel ? `${filterLabel} · ${unassignedInFilter.length} unassigned`
    : `Territories · ${territories.length}`

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: compact ? 'column' : 'row', minHeight: compact ? 0 : '480px', position: 'relative', overflow: 'hidden' }}>
      {/* ------------------------------------------------------- map column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <LiahonaToolbar
          t={t} compact={compact} mode={mode} onMode={changeMode}
          searchText={searchText} setSearchText={setSearchText} onSearch={runSearch} searching={searching}
          territories={territories} territoryFilter={territoryFilter} setTerritoryFilter={setTerritoryFilter} user={user}
          onPlanRoute={planRoute} routing={routing}
          activeOverlays={activeOverlays} overlayStatus={overlayStatus} showOverlayMenu={showOverlayMenu} setShowOverlayMenu={setShowOverlayMenu} toggleOverlay={toggleOverlay}
          onFit={fitToPins} unmappedCount={unmappedCount} geocoding={geocoding} onGeocodeMissing={geocodeMissing}
          onFindProspects={openFindProspects}
        />

        {compact && onToggleStage && (
          <StageChips t={t} stages={stages} hiddenStages={hiddenStages} geocodedLeads={geocodedLeads} onToggleStage={onToggleStage} />
        )}

        {/* map */}
        <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
          <div ref={mapDivRef} style={{ position: 'absolute', inset: 0, cursor: mode === 'select' ? '' : 'crosshair' }} />
          {mode !== 'select' && (
            <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, display: 'flex', alignItems: 'center', gap: 6, backgroundColor: '#111', color: '#fff', padding: '6px 10px', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,.3)' }}>
              {mode === 'drop' ? `${compact ? 'Tap' : 'Click'} the map where the lead is`
                : mode === 'neighbors' ? `${compact ? 'Tap' : 'Click'} a pin or a house to see its neighbors`
                : `${compact ? 'Tap' : 'Click'} to add points · ${drawPts.length} so far`}
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
            <span style={{ fontSize: 13, fontWeight: 600, color: t.text, flex: 1, marginTop: 4 }}>{sheetTitle}</span>
            <span style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>{visibleLeads.length}/{leads.length} pinned · {sheetOpen ? 'hide' : 'show'}</span>
          </div>
        )}
        {(!compact || sheetOpen) && (
          territoryForm ? (
            <TerritoryForm t={t} form={territoryForm} setForm={setTerritoryForm} employees={employees} user={user} utilityProviders={utilityProviders}
              saving={saving} onSave={saveTerritory} onCancel={() => setTerritoryForm(null)}
              canManage={canManage} handoverCount={handoverIds.length} />
          ) : dropForm ? (
            <DropLeadForm t={t} form={dropForm} setForm={setDropForm} saving={saving} onSave={saveDropLead} onCancel={() => { setDropForm(null); setResearchError('') }}
              onPan={(lat, lng) => mapRef.current?.panTo([lat, lng])}
              onResearch={researchAddress} researching={researching} researchError={researchError} />
          ) : activeLead ? (
            <LeadCard t={t} lead={activeLead} stages={stages} stageById={stageById} employeeById={employeeById}
              followUps={followUpsByLead?.get(String(activeLead.id)) || []} companyId={companyId} employeeId={employeeId}
              changingStage={changingStage} onChangeStage={changeStage}
              onOpen={() => onSelectLead?.(activeLead)}
              onNeighbors={() => loadNeighbors({ lat: Number(activeLead.latitude), lng: Number(activeLead.longitude) }, activeLead.customer_name || activeLead.business_name || activeLead.address)}
              onPan={() => mapRef.current?.panTo([Number(activeLead.latitude), Number(activeLead.longitude)])}
              onClose={() => setActiveLeadId(null)}
              onLogged={k => { notify(`Logged: ${k.label}`); onLogged?.() }} onError={notify} />
          ) : (
            <>
              {route && <RoutePanel t={t} route={route} stageById={stageById} onClear={clearRoute} onSelectLead={l => l?.id ? onSelectLead?.(l) : l?._neighbor && focusNeighbor(l._neighbor)} />}
              {neighbors && (
                <NeighborsPanel t={t} data={neighbors} selected={neighborSel} setSelected={setNeighborSel} stageById={stageById}
                  onRadius={r => loadNeighbors({ lat: neighbors.lat, lng: neighbors.lng }, neighbors.label, r)}
                  onAdd={it => startDropAt(it.lat, it.lng, { address: parcelAddress(it.parcel), parcel: it.parcel })}
                  onAddAll={addNeighbors} onRoute={routeNeighbors} onFocus={focusNeighbor} onClose={closeNeighbors}
                  adding={addingNeighbors} routing={routing} />
              )}
              <TerritoryPanel
                t={t} compact={compact} leads={leads} visibleLeads={visibleLeads} hiddenStages={hiddenStages}
                territories={territories} territoryCounts={territoryCounts} employeeById={employeeById} selectedTerritoryId={selectedTerritoryId}
                territoryFilter={territoryFilter} setTerritoryFilter={setTerritoryFilter} filterLabel={filterLabel} filterPolygons={filterPolygons}
                unassignedInFilter={unassignedInFilter} claiming={claiming} onClaim={claimUnassigned} user={user}
                canManage={canManage} employees={employees} repStats={repStats} onAssignTerritory={assignTerritoryLeads}
                onZoom={zoomToTerritory} onEdit={editTerritory} onDelete={deleteTerritory}
              />
            </>
          )
        )}
      </div>

      {showFindProspects && (
        <ProspectResearchDrawer
          companyId={companyId}
          employees={employees}
          theme={{ bg: t.bg, bgCard: t.bgCard, border: t.border, text: t.text, textMuted: t.textMuted, textSecondary: t.textSecondary, accent: t.accent }}
          isMobile={compact}
          onClose={() => setShowFindProspects(false)}
          onImported={() => onLeadsChanged?.()}
          onResults={list => plotProspects(list)}
          mapArea={mapArea}
        />
      )}
    </div>
  )
}
