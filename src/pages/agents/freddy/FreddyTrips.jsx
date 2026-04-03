import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { useIsMobile } from '../../../hooks/useIsMobile'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  MapPin, Navigation, Clock, Gauge, Route, X, ChevronRight,
  Play, Square, Calendar, Truck, AlertTriangle, Loader2, Search
} from 'lucide-react'

const defaultTheme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentHover: '#4a5239',
  accentBg: 'rgba(90,99,73,0.12)',
  shadow: '0 1px 3px rgba(0,0,0,0.08)',
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0m'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatDateTime(dateStr) {
  if (!dateStr) return '--'
  const d = new Date(dateStr)
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function formatTime(dateStr) {
  if (!dateStr) return '--'
  const d = new Date(dateStr)
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

export default function FreddyTrips() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()

  const companyId = useStore(s => s.companyId)
  const fleet = useStore(s => s.fleet)
  const getCompanyAgent = useStore(s => s.getCompanyAgent)
  const companyAgent = getCompanyAgent('freddy-fleet')
  const authToken = companyAgent?.settings?.watchdog_auth_token || ''

  const [selectedVehicle, setSelectedVehicle] = useState('')
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Trip detail modal
  const [selectedTrip, setSelectedTrip] = useState(null)
  const [tripLocations, setTripLocations] = useState([])
  const [loadingLocations, setLoadingLocations] = useState(false)
  const mapRef = useRef(null)
  const mapContainerRef = useRef(null)

  // Build device-to-vehicle map
  const deviceVehicleMap = {}
  fleet.forEach(v => {
    if (v.gps_device_id) deviceVehicleMap[v.gps_device_id] = v
  })

  const vehiclesWithGps = fleet.filter(v => v.gps_device_id)

  const loadTrips = async () => {
    if (!authToken) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('watchdog-proxy', {
        body: {
          action: 'trips_between',
          auth_token: authToken,
          params: { start_date: startDate, end_date: endDate },
        },
      })
      if (fnError) throw fnError

      const tripList = Array.isArray(data) ? data : data?.trips || data?.data || []

      // Optionally filter by selected vehicle
      const filtered = selectedVehicle
        ? tripList.filter(t => {
            const vehicle = deviceVehicleMap[t.device_id]
            return vehicle && vehicle.id === parseInt(selectedVehicle)
          })
        : tripList

      setTrips(filtered)
    } catch (e) {
      console.error('Error loading trips:', e)
      setError(e.message || 'Failed to load trips')
    } finally {
      setLoading(false)
    }
  }

  const openTripDetail = async (trip) => {
    setSelectedTrip(trip)
    setTripLocations([])
    setLoadingLocations(true)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('watchdog-proxy', {
        body: {
          action: 'trip_locations',
          auth_token: authToken,
          params: { trip_id: trip.id || trip.trip_id },
        },
      })
      if (fnError) throw fnError
      const locations = Array.isArray(data) ? data : data?.locations || data?.data || []
      setTripLocations(locations)
    } catch (e) {
      console.error('Error loading trip locations:', e)
    } finally {
      setLoadingLocations(false)
    }
  }

  const closeTripDetail = useCallback(() => {
    setSelectedTrip(null)
    setTripLocations([])
    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }
  }, [])

  // Initialize/update leaflet map when locations load
  useEffect(() => {
    if (!selectedTrip || tripLocations.length === 0 || !mapContainerRef.current) return

    // Clean up previous map
    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: false,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map)

    const coords = tripLocations
      .filter(loc => loc.latitude && loc.longitude)
      .map(loc => [parseFloat(loc.latitude), parseFloat(loc.longitude)])

    if (coords.length > 0) {
      // Draw polyline trail
      const polyline = L.polyline(coords, {
        color: '#5a6349',
        weight: 4,
        opacity: 0.85,
        smoothFactor: 1,
      }).addTo(map)

      // Start marker (green)
      const startIcon = L.divIcon({
        html: '<div style="width:14px;height:14px;border-radius:50%;background:#22c55e;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
        className: '',
      })
      L.marker(coords[0], { icon: startIcon }).addTo(map).bindPopup('Trip Start')

      // End marker (red)
      const endIcon = L.divIcon({
        html: '<div style="width:14px;height:14px;border-radius:50%;background:#ef4444;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
        className: '',
      })
      L.marker(coords[coords.length - 1], { icon: endIcon }).addTo(map).bindPopup('Trip End')

      map.fitBounds(polyline.getBounds(), { padding: [30, 30] })
    }

    mapRef.current = map

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [tripLocations, selectedTrip])

  const getVehicleName = (trip) => {
    const vehicle = deviceVehicleMap[trip.device_id]
    return vehicle?.name || `Device ${trip.device_id || '??'}`
  }

  // Styles
  const cardStyle = {
    backgroundColor: theme.bgCard,
    border: `1px solid ${theme.border}`,
    borderRadius: '10px',
    padding: isMobile ? '14px' : '20px',
    boxShadow: theme.shadow,
  }

  const buttonStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '10px 18px',
    backgroundColor: theme.accent,
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    minHeight: '44px',
    minWidth: '44px',
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    fontSize: '14px',
    color: theme.text,
    backgroundColor: theme.bgCard,
    outline: 'none',
    minHeight: '44px',
    boxSizing: 'border-box',
  }

  const labelStyle = {
    display: 'block',
    fontSize: '12px',
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  }

  // No auth token
  if (!authToken) {
    return (
      <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{
          ...cardStyle,
          textAlign: 'center',
          padding: '40px 24px',
        }}>
          <AlertTriangle size={40} style={{ color: theme.textMuted, marginBottom: '12px' }} />
          <h3 style={{ margin: '0 0 8px', color: theme.text, fontSize: '16px' }}>
            GPS Tracking Not Connected
          </h3>
          <p style={{ margin: 0, color: theme.textSecondary, fontSize: '14px' }}>
            Connect your GPS provider in Freddy Settings to view trip history.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text }}>
          Trip History
        </h2>
        <p style={{ margin: 0, fontSize: '13px', color: theme.textMuted }}>
          GPS trail replay and trip analytics
        </p>
      </div>

      {/* Filters */}
      <div style={{
        ...cardStyle,
        marginBottom: '20px',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr auto',
          gap: '12px',
          alignItems: 'end',
        }}>
          <div>
            <label style={labelStyle}>Vehicle</label>
            <select
              value={selectedVehicle}
              onChange={e => setSelectedVehicle(e.target.value)}
              style={inputStyle}
            >
              <option value="">All Vehicles</option>
              {vehiclesWithGps.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              style={inputStyle}
            />
          </div>
          <button
            onClick={loadTrips}
            disabled={loading}
            style={{
              ...buttonStyle,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={16} />}
            Load Trips
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '8px',
          color: '#ef4444',
          fontSize: '13px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Trip List */}
      {trips.length === 0 && !loading && (
        <div style={{
          ...cardStyle,
          textAlign: 'center',
          padding: '40px 24px',
          color: theme.textMuted,
        }}>
          <Route size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
          <p style={{ margin: 0, fontSize: '14px' }}>
            {error ? 'Unable to load trips' : 'Select a date range and click "Load Trips" to view trip history.'}
          </p>
        </div>
      )}

      {trips.length > 0 && (
        <div style={cardStyle}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
          }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>
              {trips.length} Trip{trips.length !== 1 ? 's' : ''} Found
            </span>
          </div>

          {/* Desktop table */}
          {!isMobile ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Vehicle', 'Start', 'End', 'From', 'To', 'Distance', 'Duration', 'Max Speed', ''].map(h => (
                      <th key={h} style={{
                        textAlign: 'left',
                        padding: '10px 12px',
                        fontSize: '11px',
                        fontWeight: '600',
                        color: theme.textMuted,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        borderBottom: `1px solid ${theme.border}`,
                        whiteSpace: 'nowrap',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trips.map((trip, idx) => (
                    <tr
                      key={trip.id || trip.trip_id || idx}
                      onClick={() => openTripDetail(trip)}
                      style={{
                        cursor: 'pointer',
                        borderBottom: idx < trips.length - 1 ? `1px solid ${theme.border}` : 'none',
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = theme.accentBg}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: '600', color: theme.text }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Truck size={14} style={{ color: theme.accent }} />
                          {getVehicleName(trip)}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', color: theme.textSecondary, whiteSpace: 'nowrap' }}>
                        {formatDateTime(trip.start_time || trip.started_at)}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', color: theme.textSecondary, whiteSpace: 'nowrap' }}>
                        {formatDateTime(trip.end_time || trip.ended_at)}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', color: theme.textSecondary, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {trip.start_address || trip.from_address || '--'}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', color: theme.textSecondary, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {trip.end_address || trip.to_address || '--'}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: '600', color: theme.text, whiteSpace: 'nowrap' }}>
                        {trip.distance_miles != null ? `${parseFloat(trip.distance_miles).toFixed(1)} mi` : trip.distance ? `${(parseFloat(trip.distance) / 1609.34).toFixed(1)} mi` : '--'}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', color: theme.textSecondary, whiteSpace: 'nowrap' }}>
                        {formatDuration(trip.duration_seconds || trip.duration)}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', color: parseFloat(trip.max_speed_mph || trip.max_speed || 0) > 80 ? '#ef4444' : theme.textSecondary, whiteSpace: 'nowrap' }}>
                        {trip.max_speed_mph != null ? `${parseFloat(trip.max_speed_mph).toFixed(0)} mph` : trip.max_speed != null ? `${parseFloat(trip.max_speed).toFixed(0)} mph` : '--'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <ChevronRight size={16} style={{ color: theme.textMuted }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Mobile cards */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {trips.map((trip, idx) => (
                <div
                  key={trip.id || trip.trip_id || idx}
                  onClick={() => openTripDetail(trip)}
                  style={{
                    padding: '12px',
                    border: `1px solid ${theme.border}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    backgroundColor: theme.bgCard,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Truck size={14} style={{ color: theme.accent }} />
                      {getVehicleName(trip)}
                    </span>
                    <ChevronRight size={16} style={{ color: theme.textMuted }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '12px', color: theme.textSecondary }}>
                    <div>
                      <span style={{ color: theme.textMuted }}>From: </span>
                      {formatTime(trip.start_time || trip.started_at)}
                    </div>
                    <div>
                      <span style={{ color: theme.textMuted }}>To: </span>
                      {formatTime(trip.end_time || trip.ended_at)}
                    </div>
                    <div>
                      <span style={{ color: theme.textMuted }}>Dist: </span>
                      {trip.distance_miles != null ? `${parseFloat(trip.distance_miles).toFixed(1)} mi` : trip.distance ? `${(parseFloat(trip.distance) / 1609.34).toFixed(1)} mi` : '--'}
                    </div>
                    <div>
                      <span style={{ color: theme.textMuted }}>Max: </span>
                      {trip.max_speed_mph != null ? `${parseFloat(trip.max_speed_mph).toFixed(0)} mph` : trip.max_speed != null ? `${parseFloat(trip.max_speed).toFixed(0)} mph` : '--'}
                    </div>
                  </div>
                  {(trip.start_address || trip.from_address) && (
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {trip.start_address || trip.from_address} → {trip.end_address || trip.to_address || '...'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Trip Detail Modal */}
      {selectedTrip && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: isMobile ? '0' : '24px',
          }}
          onClick={e => { if (e.target === e.currentTarget) closeTripDetail() }}
        >
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: isMobile ? '0' : '12px',
            width: isMobile ? '100%' : '900px',
            maxWidth: '100%',
            height: isMobile ? '100%' : '80vh',
            maxHeight: isMobile ? '100%' : '700px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Modal header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <div>
                <h3 style={{ margin: '0 0 2px', fontSize: '16px', fontWeight: '700', color: theme.text }}>
                  Trip Detail
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: theme.textMuted }}>
                  {getVehicleName(selectedTrip)} &middot; {formatDateTime(selectedTrip.start_time || selectedTrip.started_at)}
                </p>
              </div>
              <button
                onClick={closeTripDetail}
                style={{
                  padding: '8px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${theme.border}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  color: theme.textMuted,
                  minHeight: '44px',
                  minWidth: '44px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal body */}
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
              {/* Map */}
              <div style={{
                height: isMobile ? '250px' : '320px',
                borderRadius: '10px',
                overflow: 'hidden',
                border: `1px solid ${theme.border}`,
                marginBottom: '16px',
                backgroundColor: '#e8e4db',
              }}>
                {loadingLocations ? (
                  <div style={{
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: theme.textMuted,
                    gap: '8px',
                    fontSize: '14px',
                  }}>
                    <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                    Loading GPS trail...
                  </div>
                ) : tripLocations.length === 0 ? (
                  <div style={{
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: theme.textMuted,
                    fontSize: '14px',
                  }}>
                    No GPS data available for this trip
                  </div>
                ) : (
                  <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />
                )}
              </div>

              {/* Trip Summary Stats */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr 1fr',
                gap: '10px',
                marginBottom: '16px',
              }}>
                {[
                  {
                    icon: Route, label: 'Distance',
                    value: selectedTrip.distance_miles != null
                      ? `${parseFloat(selectedTrip.distance_miles).toFixed(1)} mi`
                      : selectedTrip.distance
                        ? `${(parseFloat(selectedTrip.distance) / 1609.34).toFixed(1)} mi`
                        : '--',
                  },
                  {
                    icon: Clock, label: 'Duration',
                    value: formatDuration(selectedTrip.duration_seconds || selectedTrip.duration),
                  },
                  {
                    icon: Gauge, label: 'Avg Speed',
                    value: selectedTrip.avg_speed_mph != null
                      ? `${parseFloat(selectedTrip.avg_speed_mph).toFixed(0)} mph`
                      : selectedTrip.avg_speed != null
                        ? `${parseFloat(selectedTrip.avg_speed).toFixed(0)} mph`
                        : (() => {
                            const dist = selectedTrip.distance_miles || (selectedTrip.distance ? parseFloat(selectedTrip.distance) / 1609.34 : 0)
                            const dur = (selectedTrip.duration_seconds || selectedTrip.duration || 0) / 3600
                            return dur > 0 ? `${(dist / dur).toFixed(0)} mph` : '--'
                          })(),
                  },
                  {
                    icon: Gauge, label: 'Max Speed',
                    value: selectedTrip.max_speed_mph != null
                      ? `${parseFloat(selectedTrip.max_speed_mph).toFixed(0)} mph`
                      : selectedTrip.max_speed != null
                        ? `${parseFloat(selectedTrip.max_speed).toFixed(0)} mph`
                        : '--',
                    highlight: parseFloat(selectedTrip.max_speed_mph || selectedTrip.max_speed || 0) > 80,
                  },
                  {
                    icon: Square, label: 'Idle Time',
                    value: formatDuration(selectedTrip.idle_time_seconds || selectedTrip.idle_time || 0),
                  },
                ].map((stat, i) => {
                  const Icon = stat.icon
                  return (
                    <div key={i} style={{
                      padding: '12px',
                      backgroundColor: theme.accentBg,
                      borderRadius: '8px',
                      textAlign: 'center',
                    }}>
                      <Icon size={16} style={{ color: stat.highlight ? '#ef4444' : theme.accent, marginBottom: '4px' }} />
                      <div style={{
                        fontSize: '16px',
                        fontWeight: '700',
                        color: stat.highlight ? '#ef4444' : theme.text,
                        marginBottom: '2px',
                      }}>
                        {stat.value}
                      </div>
                      <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                        {stat.label}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Addresses */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                gap: '12px',
                marginBottom: '16px',
              }}>
                <div style={{
                  padding: '12px',
                  backgroundColor: 'rgba(34,197,94,0.08)',
                  borderRadius: '8px',
                  borderLeft: '3px solid #22c55e',
                }}>
                  <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '4px' }}>Start</div>
                  <div style={{ fontSize: '13px', color: theme.text, fontWeight: '500' }}>
                    {formatDateTime(selectedTrip.start_time || selectedTrip.started_at)}
                  </div>
                  <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '2px' }}>
                    {selectedTrip.start_address || selectedTrip.from_address || 'Address unavailable'}
                  </div>
                </div>
                <div style={{
                  padding: '12px',
                  backgroundColor: 'rgba(239,68,68,0.08)',
                  borderRadius: '8px',
                  borderLeft: '3px solid #ef4444',
                }}>
                  <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '4px' }}>End</div>
                  <div style={{ fontSize: '13px', color: theme.text, fontWeight: '500' }}>
                    {formatDateTime(selectedTrip.end_time || selectedTrip.ended_at)}
                  </div>
                  <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '2px' }}>
                    {selectedTrip.end_address || selectedTrip.to_address || 'Address unavailable'}
                  </div>
                </div>
              </div>

              {/* Location Breadcrumbs */}
              {tripLocations.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: '600', color: theme.text }}>
                    Location Breadcrumbs ({tripLocations.length} points)
                  </h4>
                  <div style={{
                    maxHeight: '200px',
                    overflowY: 'auto',
                    border: `1px solid ${theme.border}`,
                    borderRadius: '8px',
                  }}>
                    {tripLocations.map((loc, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 12px',
                          borderBottom: i < tripLocations.length - 1 ? `1px solid ${theme.border}` : 'none',
                          fontSize: '12px',
                        }}
                      >
                        <MapPin size={12} style={{
                          color: i === 0 ? '#22c55e' : i === tripLocations.length - 1 ? '#ef4444' : theme.textMuted,
                          flexShrink: 0,
                        }} />
                        <span style={{ color: theme.textSecondary, minWidth: '70px', flexShrink: 0 }}>
                          {loc.timestamp ? formatTime(loc.timestamp) : `#${i + 1}`}
                        </span>
                        <span style={{ color: theme.textMuted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {loc.address || `${parseFloat(loc.latitude).toFixed(5)}, ${parseFloat(loc.longitude).toFixed(5)}`}
                        </span>
                        {loc.speed_mph != null && (
                          <span style={{
                            color: parseFloat(loc.speed_mph) > 80 ? '#ef4444' : theme.textMuted,
                            fontWeight: '500',
                            flexShrink: 0,
                          }}>
                            {parseFloat(loc.speed_mph).toFixed(0)} mph
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Spinner keyframe (inline) */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
