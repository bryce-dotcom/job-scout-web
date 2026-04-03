import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { useIsMobile } from '../../../hooks/useIsMobile'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  MapPin, RefreshCw, Truck, Fuel, Battery, Clock,
  Navigation, Settings, AlertTriangle, Gauge
} from 'lucide-react'

const defaultTheme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)',
  shadow: '0 1px 3px rgba(0,0,0,0.08)',
}

const STATUS_COLORS = {
  moving: '#22c55e',
  parked: '#3b82f6',
  offline: '#9ca3af',
}

const STATUS_LABELS = {
  moving: 'Moving',
  parked: 'Parked',
  offline: 'Offline',
}

function getVehicleStatus(device) {
  if (!device || !device.online) return 'offline'
  if (device.speed > 0) return 'moving'
  return 'parked'
}

function formatTimestamp(ts) {
  if (!ts) return 'N/A'
  const d = new Date(ts)
  const now = new Date()
  const diffMs = now - d
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return d.toLocaleDateString()
}

function createCircleIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 18px; height: 18px; border-radius: 50%;
      background: ${color}; border: 3px solid #fff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -12],
  })
}

export default function FreddyTracking() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()

  const fleet = useStore(s => s.fleet) || []
  const getCompanyAgent = useStore(s => s.getCompanyAgent)
  const companyAgent = getCompanyAgent('freddy-fleet')
  const authToken = companyAgent?.settings?.watchdog_auth_token
  const refreshInterval = (companyAgent?.settings?.auto_refresh_interval || 60) * 1000

  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState(null)

  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef([])

  // Fetch devices from Watchdog
  const fetchDevices = useCallback(async () => {
    if (!authToken) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('watchdog-proxy', {
        body: { action: 'devices', auth_token: authToken }
      })
      if (fnError) {
        setError(fnError.message || 'Failed to fetch devices')
        return
      }
      const deviceList = Array.isArray(data?.devices) ? data.devices : []
      setDevices(deviceList)
      setLastUpdated(new Date())
    } catch (e) {
      setError(e.message || 'Failed to fetch devices')
    } finally {
      setLoading(false)
    }
  }, [authToken])

  // Initial fetch
  useEffect(() => {
    fetchDevices()
  }, [fetchDevices])

  // Auto-refresh
  useEffect(() => {
    if (!authToken) return
    const interval = setInterval(fetchDevices, refreshInterval)
    return () => clearInterval(interval)
  }, [fetchDevices, refreshInterval])

  // Merge fleet vehicles with Watchdog device data
  const mergedVehicles = fleet.map(vehicle => {
    const device = devices.find(d => d.id === vehicle.gps_device_id || d.device_id === vehicle.gps_device_id)
    const status = device ? getVehicleStatus(device) : 'offline'
    return {
      ...vehicle,
      device,
      status,
      lat: device?.lat || device?.latitude,
      lng: device?.lng || device?.longitude,
      speed: device?.speed || 0,
      address: device?.address || device?.location || 'Unknown',
      fuel: device?.fuel_percent ?? device?.fuel ?? null,
      battery: device?.battery_percent ?? device?.battery ?? null,
      engineOn: device?.engine_on ?? device?.ignition ?? false,
      lastUpdate: device?.last_update || device?.timestamp,
      online: device?.online ?? false,
    }
  })

  // Filter vehicles
  const filteredVehicles = filter === 'all'
    ? mergedVehicles
    : mergedVehicles.filter(v => v.status === filter)

  // Vehicles with valid coords for map
  const mappableVehicles = mergedVehicles.filter(v => v.lat && v.lng)

  // Initialize and update map
  useEffect(() => {
    if (!mapRef.current) return

    // Initialize map if not already
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current, {
        center: [39.8283, -98.5795], // Center of US
        zoom: 4,
        zoomControl: true,
        attributionControl: true,
      })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(mapInstanceRef.current)
    }

    const map = mapInstanceRef.current

    // Clear old markers
    markersRef.current.forEach(m => map.removeLayer(m))
    markersRef.current = []

    // Add markers for each vehicle with coordinates
    mappableVehicles.forEach(v => {
      const color = STATUS_COLORS[v.status]
      const icon = createCircleIcon(color)

      const popupContent = `
        <div style="font-family: inherit; min-width: 180px;">
          <div style="font-weight: 700; font-size: 14px; margin-bottom: 6px;">${v.name || v.vehicle_name || 'Unknown Vehicle'}</div>
          <div style="font-size: 12px; color: #4d5a52; margin-bottom: 4px;">${v.address}</div>
          <div style="display: flex; gap: 12px; font-size: 12px; margin-top: 8px;">
            <span><b>Speed:</b> ${v.speed} mph</span>
            <span><b>Engine:</b> ${v.engineOn ? 'On' : 'Off'}</span>
          </div>
          ${v.fuel !== null ? `<div style="font-size: 12px; margin-top: 4px;"><b>Fuel:</b> ${v.fuel}%</div>` : ''}
          ${v.battery !== null ? `<div style="font-size: 12px; margin-top: 2px;"><b>Battery:</b> ${v.battery}%</div>` : ''}
          <div style="font-size: 11px; color: #7d8a7f; margin-top: 6px;">Updated: ${formatTimestamp(v.lastUpdate)}</div>
        </div>
      `

      const marker = L.marker([v.lat, v.lng], { icon })
        .addTo(map)
        .bindPopup(popupContent)

      markersRef.current.push(marker)
    })

    // Fit bounds if we have markers
    if (mappableVehicles.length > 0) {
      const bounds = L.latLngBounds(mappableVehicles.map(v => [v.lat, v.lng]))
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
    }
  }, [mappableVehicles.length, devices])

  // Cleanup map on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  const statusCounts = {
    all: mergedVehicles.length,
    moving: mergedVehicles.filter(v => v.status === 'moving').length,
    parked: mergedVehicles.filter(v => v.status === 'parked').length,
    offline: mergedVehicles.filter(v => v.status === 'offline').length,
  }

  const sectionStyle = {
    background: theme.bgCard, borderRadius: '12px',
    border: `1px solid ${theme.border}`, padding: '20px',
    marginBottom: '16px', boxShadow: theme.shadow
  }

  // No auth token -- show setup prompt
  if (!authToken) {
    return (
      <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{
          ...sectionStyle,
          textAlign: 'center', padding: '40px 20px'
        }}>
          <MapPin size={48} style={{ color: theme.textMuted, marginBottom: '16px' }} />
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: theme.text, margin: '0 0 8px' }}>
            GPS Tracking Not Configured
          </h2>
          <p style={{ fontSize: '14px', color: theme.textMuted, margin: '0 0 20px', maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto' }}>
            Connect your Watchdog GPS account to start tracking your fleet vehicles in real time.
          </p>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '10px 20px', borderRadius: '8px',
            background: theme.accentBg, color: theme.accent,
            fontSize: '14px', fontWeight: '600'
          }}>
            <Settings size={16} />
            Go to Settings tab to configure
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '20px', flexWrap: 'wrap', gap: '10px'
      }}>
        <div>
          <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text, margin: 0 }}>
            Fleet Tracking
          </h1>
          <p style={{ fontSize: '13px', color: theme.textMuted, marginTop: '2px', margin: '2px 0 0' }}>
            {lastUpdated ? `Last updated ${formatTimestamp(lastUpdated)}` : 'Loading...'}
          </p>
        </div>
        <button
          onClick={fetchDevices}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '10px 16px', minHeight: '44px',
            background: theme.bgCard, color: theme.accent,
            border: `1px solid ${theme.border}`, borderRadius: '8px',
            cursor: loading ? 'default' : 'pointer',
            fontWeight: '600', fontSize: '14px',
            fontFamily: 'inherit', boxShadow: theme.shadow,
            opacity: loading ? 0.7 : 1
          }}
        >
          <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          ...sectionStyle,
          background: 'rgba(239,68,68,0.06)',
          border: '1px solid rgba(239,68,68,0.2)',
          display: 'flex', alignItems: 'center', gap: '8px',
          color: '#ef4444', fontSize: '14px', padding: '12px 16px'
        }}>
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Map */}
      <div style={sectionStyle}>
        <div
          ref={mapRef}
          style={{
            width: '100%',
            height: isMobile ? '300px' : '400px',
            borderRadius: '8px',
            overflow: 'hidden',
            background: theme.bg,
          }}
        />
        {mappableVehicles.length === 0 && !loading && (
          <div style={{
            textAlign: 'center', padding: '12px',
            fontSize: '13px', color: theme.textMuted, marginTop: '8px'
          }}>
            No vehicles with GPS coordinates to display
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div style={{
        display: 'flex', gap: '8px', marginBottom: '16px',
        flexWrap: 'wrap'
      }}>
        {['all', 'moving', 'parked', 'offline'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', minHeight: '44px',
              borderRadius: '8px', fontWeight: '600', fontSize: '13px',
              border: `1px solid ${filter === f ? theme.accent : theme.border}`,
              background: filter === f ? theme.accent : theme.bgCard,
              color: filter === f ? '#fff' : theme.text,
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.15s',
              boxShadow: filter === f ? 'none' : theme.shadow
            }}
          >
            {f === 'all' ? 'All' : STATUS_LABELS[f]}
            <span style={{
              padding: '1px 7px', borderRadius: '10px',
              background: filter === f ? 'rgba(255,255,255,0.2)' : theme.accentBg,
              fontSize: '12px', fontWeight: '700',
              color: filter === f ? '#fff' : theme.textSecondary
            }}>
              {statusCounts[f]}
            </span>
          </button>
        ))}
      </div>

      {/* Fleet Status Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
        gap: '12px'
      }}>
        {filteredVehicles.map(vehicle => {
          const statusColor = STATUS_COLORS[vehicle.status]
          return (
            <div key={vehicle.id} style={{
              ...sectionStyle,
              marginBottom: 0,
              transition: 'box-shadow 0.15s',
            }}>
              {/* Vehicle header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Truck size={20} style={{ color: theme.accent }} />
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: theme.text }}>
                      {vehicle.name || vehicle.vehicle_name || 'Unknown'}
                    </div>
                    {vehicle.type && (
                      <div style={{ fontSize: '12px', color: theme.textMuted }}>
                        {vehicle.type}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '4px 10px', borderRadius: '20px',
                  background: `${statusColor}18`,
                  color: statusColor,
                  fontSize: '12px', fontWeight: '700'
                }}>
                  <div style={{
                    width: '7px', height: '7px', borderRadius: '50%',
                    background: statusColor,
                    animation: vehicle.status === 'moving' ? 'pulse 2s infinite' : 'none'
                  }} />
                  {STATUS_LABELS[vehicle.status]}
                </div>
              </div>

              {/* Address */}
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '6px',
                marginBottom: '12px', fontSize: '13px', color: theme.textSecondary
              }}>
                <Navigation size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>{vehicle.address}</span>
              </div>

              {/* Stats row */}
              <div style={{
                display: 'flex', gap: '16px', flexWrap: 'wrap',
                paddingTop: '10px', borderTop: `1px solid ${theme.border}`,
                fontSize: '13px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: theme.textSecondary }}>
                  <Gauge size={14} />
                  <span style={{ fontWeight: '600' }}>{vehicle.speed}</span> mph
                </div>
                {vehicle.fuel !== null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: theme.textSecondary }}>
                    <Fuel size={14} />
                    <span style={{ fontWeight: '600' }}>{vehicle.fuel}%</span>
                  </div>
                )}
                {vehicle.battery !== null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: theme.textSecondary }}>
                    <Battery size={14} />
                    <span style={{ fontWeight: '600' }}>{vehicle.battery}%</span>
                  </div>
                )}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  color: theme.textMuted, marginLeft: 'auto', fontSize: '12px'
                }}>
                  <Clock size={12} />
                  {formatTimestamp(vehicle.lastUpdate)}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {filteredVehicles.length === 0 && (
        <div style={{
          ...sectionStyle,
          textAlign: 'center', padding: '40px 20px'
        }}>
          <Truck size={36} style={{ color: theme.textMuted, marginBottom: '12px' }} />
          <div style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>
            No {filter !== 'all' ? STATUS_LABELS[filter].toLowerCase() : ''} vehicles
          </div>
          <div style={{ fontSize: '13px', color: theme.textMuted }}>
            {filter !== 'all'
              ? `No vehicles currently have "${STATUS_LABELS[filter]}" status`
              : 'No fleet vehicles found. Add vehicles in the Fleet section.'}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .leaflet-container { font-family: inherit; }
      `}</style>
    </div>
  )
}
