// "Who's Working" — dashboard section showing a Google Map with pins for
// every employee currently clocked in (time_clock rows where clock_out IS NULL).
//
// Pulls clock_in_lat/lng/address from the time_clock row, joins to employees
// for name + headshot, drops a marker per person with an info window.

import { useEffect, useRef, useState } from 'react'
import { Users, MapPin, Clock, AlertTriangle, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { loadGoogleMaps, hasMapsKey } from '../lib/googleMaps'

function formatElapsed(start) {
  if (!start) return ''
  const ms = Date.now() - new Date(start).getTime()
  const mins = Math.max(0, Math.floor(ms / 60000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// A shift open longer than this is almost certainly a forgotten clock-out, not
// someone still on the job — real shifts don't run 16h. We keep these OUT of the
// live map + "on the clock" count (they'd otherwise pin people at old job sites
// from days ago) and surface them separately as "needs a clock-out fixed."
const STALE_SHIFT_MS = 16 * 60 * 60 * 1000
const isForgottenShift = (a) => (Date.now() - new Date(a.clock_in).getTime()) > STALE_SHIFT_MS

export default function WhosWorking({ theme }) {
  const companyId = useStore(s => s.companyId)
  const mapElRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const infoRef = useRef(null)
  const [active, setActive] = useState([])  // [{ entryId, employeeId, name, headshot, lat, lng, address, clock_in }]
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [, forceTick] = useState(0)  // re-render every minute for elapsed labels

  // Tick every 60s so "elapsed" stays fresh
  useEffect(() => {
    const id = setInterval(() => forceTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  // Load active entries
  const load = async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      // FK hint required: time_clock has multiple relationships to employees
      // (employee_id and adjusted_by both reference employees).
      const { data, error } = await supabase
        .from('time_clock')
        .select('id, employee_id, clock_in, clock_in_lat, clock_in_lng, clock_in_address, last_lat, last_lng, last_ping_at, employees!time_clock_employee_id_fkey(id, name, headshot_url)')
        .eq('company_id', companyId)
        .is('clock_out', null)
        .order('clock_in', { ascending: false })
      if (error) throw error

      // Freshest location comes from location_pings — the GLOBAL tracker
      // (useLocationTracking in Layout) pings from ANY page while on the clock,
      // every ~15 min. time_clock.last_lat is only written by FieldScout, which
      // techs rarely keep open, so it was usually stale/empty and the map fell
      // back to the clock-in spot. Prefer the latest ping per shift.
      const shiftIds = (data || []).map(r => r.id)
      const latestPing = new Map()
      if (shiftIds.length) {
        const { data: pings } = await supabase
          .from('location_pings')
          .select('time_clock_id, lat, lng, pinged_at')
          .eq('company_id', companyId)
          .in('time_clock_id', shiftIds)
          .order('pinged_at', { ascending: false })
          .limit(500)
        for (const p of pings || []) { if (!latestPing.has(p.time_clock_id)) latestPing.set(p.time_clock_id, p) }
      }

      const rows = (data || []).map(r => {
        const ping = latestPing.get(r.id)
        // priority: latest location ping > time_clock.last_lat > clock-in spot.
        const liveLat = ping && ping.lat != null ? Number(ping.lat) : (r.last_lat != null ? Number(r.last_lat) : null)
        const liveLng = ping && ping.lng != null ? Number(ping.lng) : (r.last_lng != null ? Number(r.last_lng) : null)
        const lat = liveLat != null ? liveLat : (r.clock_in_lat != null ? Number(r.clock_in_lat) : null)
        const lng = liveLng != null ? liveLng : (r.clock_in_lng != null ? Number(r.clock_in_lng) : null)
        return {
          entryId: r.id,
          employeeId: r.employee_id,
          name: r.employees?.name || 'Unknown',
          headshot: r.employees?.headshot_url || null,
          lat, lng,
          address: r.clock_in_address || null,
          clock_in: r.clock_in,
          last_ping_at: ping?.pinged_at || r.last_ping_at || null,
          isLive: liveLat != null && liveLng != null,
        }
      })
      setActive(rows)
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [companyId])

  // Realtime: refresh when any time_clock row for this company changes
  useEffect(() => {
    if (!companyId) return
    const ch = supabase
      .channel(`whos-working-${companyId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'time_clock',
        filter: `company_id=eq.${companyId}`,
      }, () => load())
      .subscribe()
    // Also reload every 3 min so fresh location_pings show without a clock
    // in/out (realtime only fires on time_clock changes, not new pings).
    const reloadId = setInterval(() => load(), 3 * 60 * 1000)
    return () => { supabase.removeChannel(ch); clearInterval(reloadId) }
  }, [companyId])

  // Init map once Google is ready
  useEffect(() => {
    if (!hasMapsKey()) { setError('Maps key not configured.'); return }
    let cancelled = false
    loadGoogleMaps().then(google => {
      if (cancelled || !mapElRef.current || mapRef.current) return
      // Default center: company HQ (Highland, UT). When markers are present,
      // fitBounds takes over below, so this only matters for the empty state.
      mapRef.current = new google.maps.Map(mapElRef.current, {
        center: { lat: 40.4297, lng: -111.7977 },
        zoom: 10,
        mapTypeId: 'roadmap',
        streetViewControl: false,
        fullscreenControl: false,
        mapTypeControl: false,
        gestureHandling: 'cooperative',
      })
      infoRef.current = new google.maps.InfoWindow()
    }).catch(e => setError(e.message || 'Failed to load Maps'))
    return () => { cancelled = true }
  }, [])

  // Sync markers whenever `active` changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !window.google) return
    const google = window.google

    // clear old markers
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []

    // Only pin people who are actually working now — not forgotten clock-outs
    // still open from days ago (those would drop a pin at a stale job site).
    const located = active.filter(a => a.lat != null && a.lng != null && !isForgottenShift(a))
    if (located.length === 0) return

    const bounds = new google.maps.LatLngBounds()
    located.forEach(p => {
      const marker = new google.maps.Marker({
        map,
        position: { lat: p.lat, lng: p.lng },
        title: p.name,
        label: { text: (p.name || '?').charAt(0).toUpperCase(), color: '#fff', fontWeight: '700', fontSize: '13px' },
      })
      marker.addListener('click', () => {
        const fresh = p.isLive && p.last_ping_at
          ? `<span style="color:#15803d;">📍 Live · updated ${formatElapsed(p.last_ping_at)} ago</span>`
          : `<span style="color:#7d8a7f;">📍 Clock-in location (no live ping yet)</span>`
        const html = `
          <div style="font-family: system-ui, -apple-system, sans-serif; min-width: 180px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
              ${p.headshot ? `<img src="${p.headshot}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:1px solid #d6cdb8;" />` : ''}
              <div>
                <div style="font-weight:700; color:#2c3530; font-size:14px;">${p.name}</div>
                <div style="font-size:11px; color:#7d8a7f;">On the clock · ${formatElapsed(p.clock_in)}</div>
              </div>
            </div>
            <div style="font-size:11px; margin-bottom:4px;">${fresh}</div>
            ${p.address ? `<div style="font-size:12px; color:#4d5a52;">${p.address}</div>` : ''}
          </div>`
        infoRef.current.setContent(html)
        infoRef.current.open(map, marker)
      })
      markersRef.current.push(marker)
      bounds.extend({ lat: p.lat, lng: p.lng })
    })

    if (located.length === 1) {
      map.setCenter({ lat: located[0].lat, lng: located[0].lng })
      map.setZoom(15)
    } else {
      map.fitBounds(bounds, 60)
    }
  }, [active])

  // "On the clock" = current shifts only; forgotten clock-outs are handled
  // separately so someone with an old open shift isn't shown as still working.
  const currentShifts = active.filter(a => !isForgottenShift(a))
  const forgottenShifts = active.filter(isForgottenShift)
  const located = currentShifts.filter(a => a.lat != null && a.lng != null)
  const unlocated = currentShifts.filter(a => a.lat == null || a.lng == null)

  return (
    <div style={{
      backgroundColor: theme.bgCard,
      borderRadius: 12,
      border: `1px solid ${theme.border}`,
      padding: 20,
      marginBottom: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: theme.text, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <Users size={20} style={{ color: theme.accent }} />
          Who's Working
          <span style={{ fontSize: 12, fontWeight: 500, color: theme.textMuted, padding: '2px 8px', background: theme.accentBg, borderRadius: 12 }}>
            {currentShifts.length} on the clock
          </span>
        </h2>
        <button
          onClick={load}
          title="Refresh"
          style={{ padding: '6px 10px', background: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <RefreshCw size={12} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} /> Refresh
        </button>
      </div>

      {error && (
        <div style={{ display: 'flex', gap: 8, padding: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 8, color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>
          <AlertTriangle size={16} style={{ flexShrink: 0 }} /> {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(220px, 1fr)', gap: 16 }}>
        {/* Map */}
        <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: `1px solid ${theme.border}`, minHeight: 320 }}>
          <div ref={mapElRef} style={{ width: '100%', height: 360 }} />
          {!loading && currentShifts.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(247,245,239,0.92)', color: theme.textMuted, gap: 6, padding: 16, textAlign: 'center', zIndex: 5, pointerEvents: 'none' }}>
              <Clock size={28} />
              <div style={{ fontWeight: 600, color: theme.textSecondary }}>Nobody is clocked in right now</div>
              <div style={{ fontSize: 12 }}>This map will show pins as soon as someone clocks in.</div>
            </div>
          )}
        </div>

        {/* Roster — keep the column visible even when empty so the layout
            doesn't collapse. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto', minHeight: 60 }}>
          {currentShifts.length === 0 && !loading && (
            <div style={{ fontSize: 13, color: theme.textMuted, padding: 12, textAlign: 'center', background: theme.bg, border: `1px dashed ${theme.border}`, borderRadius: 8 }}>
              No one on the clock right now.
            </div>
          )}
          {loading && currentShifts.length === 0 && (
            <div style={{ fontSize: 13, color: theme.textMuted, padding: 12, textAlign: 'center' }}>Loading…</div>
          )}
          {currentShifts.map(p => (
            <RosterRow
              key={p.entryId}
              p={p}
              theme={theme}
              located={located}
              mapRef={mapRef}
              markersRef={markersRef}
            />
          ))}
          {/* Forgotten clock-outs — NOT shown as "working"; surfaced so an admin
              fixes the real clock-out time on Payroll (where hours get corrected). */}
          {forgottenShifts.length > 0 && (
            <div style={{ marginTop: 4, padding: 10, background: 'rgba(212,148,10,0.08)', border: '1px solid rgba(212,148,10,0.4)', borderRadius: 8, fontSize: 12, color: '#7a5600' }}>
              <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <AlertTriangle size={13} /> {forgottenShifts.length} forgotten clock-out{forgottenShifts.length === 1 ? '' : 's'}
              </div>
              {forgottenShifts.slice(0, 5).map(p => (
                <div key={p.entryId} style={{ marginTop: 2 }}>{p.name} — open since {new Date(p.clock_in).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
              ))}
              <div style={{ marginTop: 5, color: theme.textMuted }}>These aren't counted as working. Set the real clock-out on the Payroll page.</div>
            </div>
          )}
        </div>
      </div>

      {unlocated.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: theme.textMuted }}>
          {unlocated.length} clocked-in {unlocated.length === 1 ? 'person has' : 'people have'} no recorded location.
        </div>
      )}
    </div>
  )
}

// Single roster row. Pulled out so we can compute `isStale` cleanly without
// a block-body in the parent's .map callback.
function RosterRow({ p, theme, located, mapRef, markersRef }) {
  const ageMin = (Date.now() - new Date(p.clock_in).getTime()) / 60000
  const isStale = ageMin > 16 * 60
  const formatted = (() => {
    const mins = Math.max(0, Math.floor(ageMin))
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  })()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: isStale ? 'rgba(212,148,10,0.08)' : theme.bg, border: `1px solid ${isStale ? '#d4940a' : theme.border}`, borderRadius: 8 }}>
      {p.headshot
        ? <img src={p.headshot} alt={p.name} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${theme.border}` }} />
        : <div style={{ width: 36, height: 36, borderRadius: '50%', background: theme.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>{(p.name || '?').charAt(0).toUpperCase()}</div>
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: theme.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
        <div style={{ fontSize: 11, color: theme.textMuted, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <Clock size={11} /> {formatted}
          {p.isLive && <span style={{ marginLeft: 4, color: '#15803d', fontWeight: 600 }}>· live</span>}
          {isStale && <span style={{ marginLeft: 4, color: '#b07300', fontWeight: 600 }}>· stuck — forgot to clock out?</span>}
          {(p.lat == null || p.lng == null) && <span style={{ marginLeft: 4, color: '#d4940a' }}>· no location</span>}
        </div>
      </div>
      {p.lat != null && p.lng != null && (
        <button
          onClick={() => {
            if (!mapRef.current) return
            mapRef.current.setCenter({ lat: p.lat, lng: p.lng })
            mapRef.current.setZoom(16)
            const idx = located.findIndex(x => x.entryId === p.entryId)
            if (idx >= 0 && markersRef.current[idx]) {
              window.google.maps.event.trigger(markersRef.current[idx], 'click')
            }
          }}
          title="Show on map"
          style={{ padding: 6, background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 6, color: theme.textSecondary, cursor: 'pointer', display: 'flex' }}
        >
          <MapPin size={14} />
        </button>
      )}
    </div>
  )
}
