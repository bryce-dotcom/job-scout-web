// Company Map — one map for everything that moves.
//
// The dashboard's Who's Working answers "where are my people". Freddy's
// tracking page answers "where is my equipment". Neither answers the question
// a dispatcher actually asks, which is both at once: is there a truck near
// that crew, is anyone close to this job.
//
// So this page unions the two live sources onto a single map:
//   people    — time_clock rows still open (clock_out IS NULL), same source
//               and same live-ping-over-clock-in-location rule as WhosWorking
//   equipment — fleet_latest_positions, the RLS-respecting view over the
//               telemetry watchdog-sync caches from Moto Watchdog
//
// Deliberately reads the cache, never the provider. The whole point of
// syncing into Postgres is that ten people watching this map costs one poll,
// not ten.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Map as MapIcon, Users, Truck, RefreshCw, AlertTriangle, MapPin, Clock, Navigation, Fuel } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { useIsMobile } from '../hooks/useIsMobile'
import { loadGoogleMaps, hasMapsKey } from '../lib/googleMaps'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', bgCardHover: '#eef2eb', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
  info: '#3b82f6', success: '#22c55e', warning: '#eab308', error: '#ef4444',
}

// People and equipment need to be told apart at a glance on a shared map, so
// each layer owns a colour and keeps it everywhere — pill, pin, roster dot.
const PEOPLE_COLOR = '#5a6349'
const EQUIP_COLOR = '#3b82f6'

function elapsed(since, now) {
  if (!since) return ''
  const mins = Math.max(0, Math.floor(((now ?? Date.now()) - new Date(since).getTime()) / 60000))
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h ${mins % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))

export default function CompanyMap() {
  const navigate = useNavigate()
  const themeCtx = useTheme?.()
  const theme = themeCtx?.theme || themeCtx || defaultTheme
  const isMobile = useIsMobile()
  const companyId = useStore(s => s.companyId)
  const hasAgent = useStore(s => s.hasAgent)
  const fleetEnabled = typeof hasAgent === 'function' ? hasAgent('freddy-fleet') : false

  const mapElRef = useRef(null)
  const mapRef = useRef(null)
  const infoRef = useRef(null)
  const markersRef = useRef(new Map())   // key -> google marker
  const didFitRef = useRef(false)        // only auto-fit once, so refreshes don't yank the view

  const [people, setPeople] = useState([])
  const [equipment, setEquipment] = useState([])
  const [showPeople, setShowPeople] = useState(true)
  const [showEquip, setShowEquip] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)      // data fetch
  const [mapError, setMapError] = useState(null)  // Maps availability — kept
                                                  // separate so load()'s
                                                  // setError(null) can't wipe it
  const [now, setNow] = useState(() => Date.now())
  // Whether the Maps script is loaded, tracked as state rather than acted on
  // inside the loader's .then(). See the init effects below.
  const [mapsReady, setMapsReady] = useState(false)

  // Re-render each minute so the "3m ago" labels don't quietly go stale.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const load = async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      // FK hint required: time_clock reaches employees twice (employee_id and
      // adjusted_by), so an unqualified join is ambiguous.
      const peopleQ = supabase
        .from('time_clock')
        .select('id, employee_id, clock_in, clock_in_lat, clock_in_lng, clock_in_address, last_lat, last_lng, last_ping_at, employees!time_clock_employee_id_fkey(id, name, headshot_url)')
        .eq('company_id', companyId)
        .is('clock_out', null)
        .order('clock_in', { ascending: false })

      // Equipment only when Freddy is active — without the agent there is no
      // telemetry and the query would just be a wasted round trip.
      const equipQ = fleetEnabled
        ? supabase
            .from('fleet_latest_positions')
            .select('device_id, fleet_id, recorded_at, latitude, longitude, speed_mph, ignition, fuel_percent, address, online, fleet:fleet_id(id, name, asset_id, type, status)')
            .eq('company_id', companyId)
        : Promise.resolve({ data: [], error: null })

      const [pRes, eRes] = await Promise.all([peopleQ, equipQ])
      if (pRes.error) throw pRes.error
      if (eRes.error) throw eRes.error

      setPeople((pRes.data || []).map(r => {
        // Prefer the live ping; fall back to where they clocked in. Same rule
        // as the dashboard map, so the two never disagree about a person.
        const liveLat = r.last_lat != null ? Number(r.last_lat) : null
        const liveLng = r.last_lng != null ? Number(r.last_lng) : null
        return {
          kind: 'person',
          key: `p-${r.id}`,
          id: r.employee_id,
          name: r.employees?.name || 'Unknown',
          headshot: r.employees?.headshot_url || null,
          lat: liveLat ?? (r.clock_in_lat != null ? Number(r.clock_in_lat) : null),
          lng: liveLng ?? (r.clock_in_lng != null ? Number(r.clock_in_lng) : null),
          address: r.clock_in_address || null,
          since: r.clock_in,
          lastSeen: r.last_ping_at || null,
          isLive: liveLat != null && liveLng != null,
        }
      }))

      setEquipment((eRes.data || []).map(r => ({
        kind: 'equipment',
        key: `e-${r.device_id}`,
        id: r.fleet_id,
        name: r.fleet?.name || r.fleet?.asset_id || 'Unlinked tracker',
        assetType: r.fleet?.type || null,
        status: r.fleet?.status || null,
        lat: r.latitude != null ? Number(r.latitude) : null,
        lng: r.longitude != null ? Number(r.longitude) : null,
        address: r.address || null,
        speed: r.speed_mph != null ? Number(r.speed_mph) : null,
        ignition: r.ignition,
        fuel: r.fuel_percent != null ? Number(r.fuel_percent) : null,
        online: r.online,
        lastSeen: r.recorded_at,
        // A tracker with no fleet row is real telemetry nobody has claimed.
        // Surfaced rather than hidden: it reads as "GPS is broken" otherwise.
        unlinked: !r.fleet_id,
      })))
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [companyId, fleetEnabled])

  // Live-update on clock in/out so the map matches the floor without a manual
  // refresh. Equipment moves on the sync's schedule, so it rides the same
  // reload rather than getting its own subscription.
  useEffect(() => {
    if (!companyId) return
    const ch = supabase
      .channel(`company-map-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_clock', filter: `company_id=eq.${companyId}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [companyId])

  // Loading the script and creating the map are deliberately two effects.
  //
  // Doing both inside loadGoogleMaps().then() looks simpler but loses the map
  // whenever the promise resolves across a mount boundary: the first mount's
  // cleanup sets cancelled, the .then() returns early, and because the loader
  // hands back one cached promise the second mount's .then() can resolve into
  // a closure that has already been cancelled too. Nothing throws, so no error
  // shows — the container just sits there empty, which is exactly how this
  // failed in production while reporting healthy.
  //
  // Splitting them means map creation happens in a render-driven effect where
  // the ref is guaranteed attached, and it re-attempts on any remount.
  useEffect(() => {
    if (!hasMapsKey()) { setMapError('Google Maps key is not configured (VITE_GOOGLE_MAPS_API_KEY).'); return }
    let cancelled = false
    const ready = () => { if (!cancelled) setMapsReady(true) }

    loadGoogleMaps()
      .then(ready)
      .catch(e => { if (!cancelled) setMapError(e.message || 'Failed to load Google Maps') })

    // Backstop, because the loader resolves off a `callback=` query param.
    // If anything else on the page has already injected the Maps script,
    // Google ignores the duplicate include and never invokes our callback —
    // so that promise settles neither way. No .then, no .catch, no error, and
    // the map is simply never constructed. That is exactly how this failed in
    // production while every health signal looked fine.
    //
    // window.google.maps is the thing we actually need, so wait for that
    // rather than for the notification that it arrived.
    const poll = setInterval(() => {
      if (window.google && window.google.maps) { clearInterval(poll); ready() }
    }, 200)
    return () => { cancelled = true; clearInterval(poll) }
  }, [])

  useEffect(() => {
    if (!mapsReady || mapRef.current || !mapElRef.current || !window.google) return
    mapRef.current = new window.google.maps.Map(mapElRef.current, {
      center: { lat: 40.4297, lng: -111.7977 },
      zoom: 10,
      mapTypeId: 'roadmap',
      streetViewControl: false,
      fullscreenControl: false,
      mapTypeControl: false,
      gestureHandling: 'greedy',
    })
    infoRef.current = new window.google.maps.InfoWindow()
  }, [mapsReady])

  const visible = useMemo(() => [
    ...(showPeople ? people : []),
    ...(showEquip ? equipment : []),
  ], [people, equipment, showPeople, showEquip])

  const located = useMemo(() => visible.filter(v => v.lat != null && v.lng != null), [visible])

  const openInfo = (item) => {
    const marker = markersRef.current.get(item.key)
    if (!marker || !mapRef.current) return
    const color = item.kind === 'person' ? PEOPLE_COLOR : EQUIP_COLOR
    const detail = item.kind === 'person'
      ? `<div style="font-size:11px;color:${item.isLive ? '#15803d' : '#7d8a7f'};margin-bottom:4px;">
           ${item.isLive ? `Live &middot; updated ${esc(elapsed(item.lastSeen, now))} ago` : 'Clock-in location (no live ping yet)'}
         </div>
         <div style="font-size:11px;color:#7d8a7f;">On the clock &middot; ${esc(elapsed(item.since, now))}</div>`
      : `<div style="font-size:11px;color:${item.online ? '#15803d' : '#7d8a7f'};margin-bottom:4px;">
           ${item.online ? 'Online' : 'Last seen'} &middot; ${esc(elapsed(item.lastSeen, now))} ago
         </div>
         <div style="font-size:11px;color:#7d8a7f;">
           ${item.ignition ? 'Engine on' : 'Engine off'}${item.speed != null ? ` &middot; ${esc(item.speed)} mph` : ''}${item.fuel != null ? ` &middot; fuel ${esc(item.fuel)}%` : ''}
         </div>`
    infoRef.current.setContent(`
      <div style="font-family:system-ui,-apple-system,sans-serif;min-width:190px;">
        <div style="font-weight:700;color:#2c3530;font-size:14px;border-left:3px solid ${color};padding-left:6px;margin-bottom:6px;">
          ${esc(item.name)}
        </div>
        ${detail}
        ${item.address ? `<div style="font-size:12px;color:#4d5a52;margin-top:5px;">${esc(item.address)}</div>` : ''}
      </div>`)
    infoRef.current.open(mapRef.current, marker)
  }

  // Rebuild markers on any change to the visible set. Markers are keyed so the
  // filter pills add and remove pins without disturbing the rest.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !window.google) return
    const google = window.google

    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = new Map()

    located.forEach(item => {
      const isPerson = item.kind === 'person'
      const color = isPerson ? PEOPLE_COLOR : EQUIP_COLOR
      const marker = new google.maps.Marker({
        map,
        position: { lat: item.lat, lng: item.lng },
        title: item.name,
        // Equipment gets a squared pin and people a round one, so the two
        // layers stay distinguishable for anyone who can't rely on colour.
        icon: {
          path: isPerson
            ? google.maps.SymbolPath.CIRCLE
            : 'M -8,-8 8,-8 8,8 -8,8 Z',
          scale: isPerson ? 11 : 1,
          fillColor: color,
          fillOpacity: item.kind === 'equipment' && !item.online ? 0.45 : 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
        label: {
          text: isPerson ? (item.name || '?').charAt(0).toUpperCase() : 'T',
          color: '#ffffff', fontWeight: '700', fontSize: '11px',
        },
      })
      marker.addListener('click', () => openInfo(item))
      markersRef.current.set(item.key, marker)
    })

    // Fit once. Re-fitting on every poll would fight the user every time they
    // panned or zoomed to look at something.
    if (!didFitRef.current && located.length > 0) {
      if (located.length === 1) {
        map.setCenter({ lat: located[0].lat, lng: located[0].lng })
        map.setZoom(14)
      } else {
        const bounds = new google.maps.LatLngBounds()
        located.forEach(i => bounds.extend({ lat: i.lat, lng: i.lng }))
        map.fitBounds(bounds, 60)
      }
      didFitRef.current = true
    }
  }, [located, mapsReady])

  // Google Maps caches its container size exactly as Leaflet does, and the
  // map is sized in vh on a phone — which changes when the device rotates and
  // again when the address bar collapses on first scroll. Without a resize
  // event the map keeps rendering at the old size, leaving grey bands.
  useEffect(() => {
    if (!mapsReady) return
    const onResize = () => {
      const map = mapRef.current
      if (!map || !window.google) return
      const centre = map.getCenter()
      window.google.maps.event.trigger(map, 'resize')
      // Re-centring after a resize: without it the map keeps the old centre
      // pixel, which slides the view off whatever the user was looking at.
      if (centre) map.setCenter(centre)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    const settle = setTimeout(onResize, 250)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      clearTimeout(settle)
    }
  }, [mapsReady, isMobile])

  const fitAll = () => {
    const map = mapRef.current
    if (!map || !window.google || located.length === 0) return
    if (located.length === 1) {
      map.setCenter({ lat: located[0].lat, lng: located[0].lng })
      map.setZoom(14)
      return
    }
    const bounds = new window.google.maps.LatLngBounds()
    located.forEach(i => bounds.extend({ lat: i.lat, lng: i.lng }))
    map.fitBounds(bounds, 60)
  }

  const unlocated = visible.filter(v => v.lat == null || v.lng == null)

  return (
    <div style={{ padding: isMobile ? 16 : 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, color: theme.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <MapIcon size={isMobile ? 22 : 26} style={{ color: theme.accent }} />
            Company Map
          </h1>
          <p style={{ fontSize: 13, color: theme.textMuted, margin: '4px 0 0' }}>
            Everyone on the clock and every tracked asset, on one map.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={fitAll}
            disabled={located.length === 0}
            style={{
              minHeight: 44, padding: '0 14px', background: 'transparent', color: theme.textSecondary,
              border: `1px solid ${theme.border}`, borderRadius: 8, fontSize: 13, fontWeight: 500,
              cursor: located.length ? 'pointer' : 'not-allowed', opacity: located.length ? 1 : 0.5,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Navigation size={14} /> Fit all
          </button>
          <button
            onClick={load}
            style={{
              minHeight: 44, padding: '0 14px', background: 'transparent', color: theme.textSecondary,
              border: `1px solid ${theme.border}`, borderRadius: 8, fontSize: 13, fontWeight: 500,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} /> Refresh
          </button>
        </div>
      </div>

      {/* Filter pills. Each is a real toggle, not a segmented control — the
          useful views include both layers and either one alone. */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <FilterPill
          theme={theme} Icon={Users} label="People" count={people.length}
          color={PEOPLE_COLOR} active={showPeople} onClick={() => setShowPeople(v => !v)}
        />
        <FilterPill
          theme={theme} Icon={Truck} label="Equipment" count={equipment.length}
          color={EQUIP_COLOR} active={showEquip} onClick={() => setShowEquip(v => !v)}
          disabled={!fleetEnabled}
          disabledHint="Freddy Fleet not active"
        />
      </div>

      {error && (
        <div style={{ display: 'flex', gap: 8, padding: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 8, color: '#b91c1c', fontSize: 13, marginBottom: 14 }}>
          <AlertTriangle size={16} style={{ flexShrink: 0 }} /> {error}
        </div>
      )}

      {/* minmax(0, …) on both tracks: the app root clips overflowX, so a plain
          1fr would silently cut the roster off instead of scrolling it. */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 2.2fr) minmax(0, 1fr)',
        gap: 16,
      }}>
        {/* Edge to edge on a phone. This is the screen someone opens to ask
            where their crew and their iron are; a map inset inside page
            padding answers that worse at every size. */}
        <div style={{
          position: 'relative', overflow: 'hidden', minHeight: 320,
          borderRadius: isMobile ? 0 : 12,
          border: isMobile ? 'none' : `1px solid ${theme.border}`,
          borderTop: isMobile ? `1px solid ${theme.border}` : undefined,
          borderBottom: isMobile ? `1px solid ${theme.border}` : undefined,
          margin: isMobile ? `0 -${16}px` : undefined,
        }}>
          {/* 52vh rather than a fixed height: tall enough to be a map, and it
              still leaves roster rows visible so the list below is
              discoverable without scrolling first. */}
          <div ref={mapElRef} style={{ width: '100%', height: isMobile ? '52vh' : 560 }} />
          {(mapError || (!loading && located.length === 0)) && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', background: 'rgba(247,245,239,0.94)',
              color: theme.textMuted, gap: 6, padding: 16, textAlign: 'center', zIndex: 5, pointerEvents: 'none',
            }}>
              {mapError ? <AlertTriangle size={28} style={{ color: '#d4940a' }} /> : <MapPin size={28} />}
              <div style={{ fontWeight: 600, color: theme.textSecondary }}>
                {mapError
                  ? 'Map unavailable'
                  : (!showPeople && !showEquip ? 'Both layers are hidden' : 'Nothing to show yet')}
              </div>
              <div style={{ fontSize: 12, maxWidth: 340 }}>
                {mapError
                  // Say what's actually wrong and that the data is fine — a
                  // blank map with no caption reads as "the GPS is broken".
                  ? `${mapError} The list on the right is still live.`
                  : (!showPeople && !showEquip
                      ? 'Turn on a pill above to see people or equipment.'
                      : 'Pins appear when someone clocks in, or when a tracker reports a position.')}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: isMobile ? 'none' : 560, overflowY: 'auto', minHeight: 60 }}>
          {loading && visible.length === 0 && (
            <div style={{ fontSize: 13, color: theme.textMuted, padding: 12, textAlign: 'center' }}>Loading…</div>
          )}
          {!loading && visible.length === 0 && (
            <div style={{ fontSize: 13, color: theme.textMuted, padding: 14, textAlign: 'center', background: theme.bg, border: `1px dashed ${theme.border}`, borderRadius: 8 }}>
              Nothing matches the current filters.
            </div>
          )}
          {visible.map(item => (
            <RosterRow
              key={item.key} item={item} theme={theme} now={now}
              onLocate={() => {
                if (item.lat == null || !mapRef.current) return
                mapRef.current.setCenter({ lat: item.lat, lng: item.lng })
                mapRef.current.setZoom(16)
                openInfo(item)
              }}
              onOpen={() => {
                if (item.kind === 'equipment' && item.id) navigate(`/fleet/${item.id}`)
              }}
            />
          ))}
        </div>
      </div>

      {unlocated.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: theme.textMuted }}>
          {unlocated.length} {unlocated.length === 1 ? 'entry has' : 'entries have'} no recorded location.
        </div>
      )}
    </div>
  )
}

function FilterPill({ theme, Icon, label, count, color, active, onClick, disabled, disabledHint }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={disabled ? disabledHint : `${active ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
      aria-pressed={active}
      disabled={disabled}
      style={{
        minHeight: 44, padding: '0 16px', borderRadius: 22,
        // Active state carries the layer's own colour so the pill and its pins
        // read as the same thing.
        background: disabled ? theme.bg : (active ? `${color}1f` : 'transparent'),
        border: `1.5px solid ${disabled ? theme.border : (active ? color : theme.border)}`,
        color: disabled ? theme.textMuted : (active ? color : theme.textSecondary),
        fontSize: 14, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        display: 'flex', alignItems: 'center', gap: 8,
      }}
    >
      <Icon size={16} />
      {label}
      <span style={{
        fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
        background: disabled ? 'transparent' : (active ? color : theme.border),
        color: disabled ? theme.textMuted : (active ? '#ffffff' : theme.textSecondary),
      }}>
        {count}
      </span>
    </button>
  )
}

function RosterRow({ item, theme, now, onLocate, onOpen }) {
  const isPerson = item.kind === 'person'
  const color = isPerson ? PEOPLE_COLOR : EQUIP_COLOR
  // A shift running past 16 hours is almost always a missed clock-out rather
  // than a very long day, and it quietly corrupts payroll if nobody notices.
  const stale = isPerson && (now - new Date(item.since).getTime()) / 3600000 > 16

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: 10,
      background: stale ? 'rgba(212,148,10,0.08)' : theme.bg,
      border: `1px solid ${stale ? '#d4940a' : theme.border}`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 8,
    }}>
      {isPerson && item.headshot ? (
        <img src={item.headshot} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${theme.border}`, flexShrink: 0 }} />
      ) : (
        <div style={{
          width: 36, height: 36, borderRadius: isPerson ? '50%' : 8, background: color,
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {isPerson
            ? <span style={{ fontWeight: 700, fontSize: 14 }}>{(item.name || '?').charAt(0).toUpperCase()}</span>
            : <Truck size={17} />}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: theme.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.name}
        </div>
        <div style={{ fontSize: 11, color: theme.textMuted, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {isPerson ? (
            <>
              <Clock size={11} /> {elapsed(item.since, now)}
              {item.isLive && <span style={{ color: '#15803d', fontWeight: 600 }}>· live</span>}
              {stale && <span style={{ color: '#b07300', fontWeight: 600 }}>· stuck — forgot to clock out?</span>}
            </>
          ) : (
            <>
              <span style={{ color: item.online ? '#15803d' : theme.textMuted, fontWeight: 600 }}>
                {item.online ? 'online' : `last seen ${elapsed(item.lastSeen, now)} ago`}
              </span>
              {item.ignition && <span>· engine on</span>}
              {item.speed != null && item.speed > 0 && <span>· {item.speed} mph</span>}
              {item.fuel != null && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><Fuel size={10} />{item.fuel}%</span>}
              {item.unlinked && <span style={{ color: '#b07300', fontWeight: 600 }}>· not linked to a vehicle</span>}
            </>
          )}
          {(item.lat == null || item.lng == null) && <span style={{ color: '#d4940a' }}>· no location</span>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {item.lat != null && item.lng != null && (
          <button
            onClick={onLocate}
            title="Show on map"
            style={{ width: 44, height: 44, background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <MapPin size={15} />
          </button>
        )}
        {!isPerson && item.id && (
          <button
            onClick={onOpen}
            title="Open vehicle"
            style={{ width: 44, height: 44, background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Truck size={15} />
          </button>
        )}
      </div>
    </div>
  )
}
