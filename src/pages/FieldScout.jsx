import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import {
  Compass, Clock, MapPin, Play, Square, Coffee,
  ChevronDown, ChevronUp, ExternalLink, Navigation,
  CheckCircle, Timer, Briefcase
} from 'lucide-react'

export default function FieldScout() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const companyId = useStore((s) => s.companyId)
  const user = useStore((s) => s.user)
  const jobs = useStore((s) => s.jobs)
  const employees = useStore((s) => s.employees)

  const [currentTime, setCurrentTime] = useState(new Date())
  const [activeEntry, setActiveEntry] = useState(null)
  const [todayEntries, setTodayEntries] = useState([])
  const [expandedJob, setExpandedJob] = useState(null)
  const [clockingIn, setClockingIn] = useState(false)
  const [clockingOut, setClockingOut] = useState(false)
  const [gpsStatus, setGpsStatus] = useState(null) // null | 'capturing' | 'done' | 'failed'
  const [selectedJobId, setSelectedJobId] = useState('')
  const [jobSections, setJobSections] = useState({})
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapError, setMapError] = useState(false)
  const [jobCoords, setJobCoords] = useState({})
  const [userLocation, setUserLocation] = useState(null)

  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const geocodeCacheRef = useRef({})
  const jobCardRefs = useRef({})

  const currentEmployee = employees.find(e => e.email === user?.email)

  // Today's jobs
  const todayStr = new Date().toDateString()
  const todaysJobs = jobs.filter(j => {
    if (!j.start_date) return false
    return new Date(j.start_date).toDateString() === todayStr
  })

  // Sort: working first, then upcoming (Scheduled/In Progress), then completed
  const sortedJobs = [...todaysJobs].sort((a, b) => {
    const aWorking = activeEntry?.job_id === a.id ? -1 : 0
    const bWorking = activeEntry?.job_id === b.id ? -1 : 0
    if (aWorking !== bWorking) return aWorking - bWorking
    const statusOrder = { 'In Progress': 0, 'Scheduled': 1, 'Completed': 2, 'Cancelled': 3 }
    return (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1)
  })

  // Update clock every second
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  // Fetch time entries
  const fetchEntries = useCallback(async () => {
    if (!companyId || !currentEmployee) return
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { data } = await supabase
      .from('time_clock')
      .select('*')
      .eq('company_id', companyId)
      .eq('employee_id', currentEmployee.id)
      .gte('clock_in', todayStart.toISOString())
      .order('clock_in', { ascending: false })

    if (data) {
      setTodayEntries(data)
      const active = data.find(e => !e.clock_out)
      setActiveEntry(active || null)
    }
  }, [companyId, currentEmployee])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  // Fetch job sections for expanded jobs
  const fetchJobSections = async (jobId) => {
    if (jobSections[jobId]) return
    const { data } = await supabase
      .from('job_sections')
      .select('*, assigned_employee:employees!job_sections_assigned_to_fkey(id, name)')
      .eq('job_id', jobId)
      .order('sort_order')
    if (data) setJobSections(prev => ({ ...prev, [jobId]: data }))
  }

  // Greeting
  const getGreeting = () => {
    const h = currentTime.getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const firstName = (user?.name || user?.email || 'Scout').split(' ')[0]

  // GPS helper
  const getLocation = () => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ lat: null, lng: null, address: null })
        return
      }
      setGpsStatus('capturing')
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
            )
            const data = await res.json()
            setGpsStatus('done')
            resolve({
              lat: latitude,
              lng: longitude,
              address: data.display_name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
            })
          } catch {
            setGpsStatus('done')
            resolve({ lat: latitude, lng: longitude, address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` })
          }
        },
        () => {
          setGpsStatus('failed')
          resolve({ lat: null, lng: null, address: null })
        },
        { timeout: 10000 }
      )
    })
  }

  // Clock in
  const handleClockIn = async (jobId) => {
    if (clockingIn) return
    setClockingIn(true)
    const location = await getLocation()
    try {
      const { error } = await supabase.from('time_clock').insert({
        company_id: companyId,
        employee_id: currentEmployee.id,
        job_id: jobId || null,
        clock_in: new Date().toISOString(),
        clock_in_lat: location.lat,
        clock_in_lng: location.lng,
        clock_in_address: location.address
      })
      if (error) throw error
      await fetchEntries()
    } catch (err) {
      alert('Error clocking in: ' + err.message)
    } finally {
      setClockingIn(false)
      setGpsStatus(null)
    }
  }

  // Clock out
  const handleClockOut = async () => {
    if (!activeEntry || clockingOut) return
    setClockingOut(true)
    const location = await getLocation()
    const clockIn = new Date(activeEntry.clock_in)
    const clockOut = new Date()
    let totalHours = (clockOut - clockIn) / (1000 * 60 * 60)
    if (activeEntry.lunch_start && activeEntry.lunch_end) {
      totalHours -= (new Date(activeEntry.lunch_end) - new Date(activeEntry.lunch_start)) / (1000 * 60 * 60)
    }
    try {
      const { error } = await supabase
        .from('time_clock')
        .update({
          clock_out: clockOut.toISOString(),
          clock_out_lat: location.lat,
          clock_out_lng: location.lng,
          clock_out_address: location.address,
          total_hours: Math.round(totalHours * 100) / 100
        })
        .eq('id', activeEntry.id)
      if (error) throw error
      await fetchEntries()
    } catch (err) {
      alert('Error clocking out: ' + err.message)
    } finally {
      setClockingOut(false)
      setGpsStatus(null)
    }
  }

  // Lunch
  const handleLunchStart = async () => {
    if (!activeEntry) return
    await supabase.from('time_clock').update({ lunch_start: new Date().toISOString() }).eq('id', activeEntry.id)
    await fetchEntries()
  }
  const handleLunchEnd = async () => {
    if (!activeEntry) return
    await supabase.from('time_clock').update({ lunch_end: new Date().toISOString() }).eq('id', activeEntry.id)
    await fetchEntries()
  }

  // Timer formatting
  const formatElapsed = (clockIn) => {
    const diff = Math.max(0, Math.floor((currentTime - new Date(clockIn)) / 1000))
    const h = Math.floor(diff / 3600)
    const m = Math.floor((diff % 3600) / 60)
    const s = diff % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const formatDuration = (hours) => {
    if (!hours) return '0h 0m'
    const h = Math.floor(hours)
    const m = Math.round((hours - h) * 60)
    return `${h}h ${m}m`
  }

  const isOnLunch = activeEntry?.lunch_start && !activeEntry?.lunch_end
  const elapsedHours = activeEntry ? (currentTime - new Date(activeEntry.clock_in)) / (1000 * 60 * 60) : 0
  const activeJobName = activeEntry?.job_id
    ? (jobs.find(j => j.id === activeEntry.job_id)?.job_title || 'Job')
    : 'General'

  // Quick stats
  const jobsToday = todaysJobs.length
  const hoursAllotted = todaysJobs.reduce((sum, j) => sum + (parseFloat(j.hours_allotted) || 0), 0)
  const completedToday = todaysJobs.filter(j => j.status === 'Completed').length

  // Open address in native maps
  const openMaps = (address) => {
    if (!address) return
    const encoded = encodeURIComponent(address)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const url = isIOS ? `maps://maps.apple.com/?q=${encoded}` : `https://www.google.com/maps/search/?api=1&query=${encoded}`
    window.open(url, '_blank')
  }

  // Status pill colors
  const statusColor = (status) => {
    const colors = {
      'Scheduled': { bg: 'rgba(90,155,213,0.15)', text: '#5a9bd5' },
      'In Progress': { bg: 'rgba(74,124,89,0.15)', text: '#4a7c59' },
      'Completed': { bg: 'rgba(107,114,128,0.15)', text: '#6b7280' },
      'Cancelled': { bg: 'rgba(239,68,68,0.1)', text: '#ef4444' }
    }
    return colors[status] || { bg: theme.accentBg, text: theme.accent }
  }

  // ============== MAP SECTION ==============
  // Geocode job addresses for map pins
  const geocodeAddress = async (address) => {
    if (!address) return null
    if (geocodeCacheRef.current[address]) return geocodeCacheRef.current[address]
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`
      )
      const data = await res.json()
      if (data?.[0]) {
        const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
        geocodeCacheRef.current[address] = coords
        return coords
      }
    } catch { /* ignore */ }
    return null
  }

  // Parse gps_location field "lat,lng"
  const parseGpsLocation = (gpsStr) => {
    if (!gpsStr) return null
    const parts = gpsStr.split(',').map(s => parseFloat(s.trim()))
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return { lat: parts[0], lng: parts[1] }
    }
    return null
  }

  // Geocode all jobs sequentially with rate limiting
  useEffect(() => {
    if (todaysJobs.length === 0) return
    let cancelled = false

    const geocodeAll = async () => {
      const newCoords = {}
      for (const job of todaysJobs) {
        if (cancelled) break
        // Try gps_location first
        const gps = parseGpsLocation(job.gps_location)
        if (gps) {
          newCoords[job.id] = gps
          continue
        }
        // Try job address or customer address
        const addr = job.job_address || job.customer?.address
        if (!addr) continue
        if (geocodeCacheRef.current[addr]) {
          newCoords[job.id] = geocodeCacheRef.current[addr]
          continue
        }
        // Rate limit: 1 req/sec
        await new Promise(r => setTimeout(r, 1100))
        if (cancelled) break
        const coords = await geocodeAddress(addr)
        if (coords) newCoords[job.id] = coords
      }
      if (!cancelled) setJobCoords(prev => ({ ...prev, ...newCoords }))
    }
    geocodeAll()
    return () => { cancelled = true }
  }, [todaysJobs.length])

  // Get user location for map
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { timeout: 10000 }
      )
    }
  }, [])

  // Load Leaflet CSS & JS from CDN
  useEffect(() => {
    if (todaysJobs.length === 0) return
    if (document.getElementById('leaflet-css')) {
      setMapLoaded(true)
      return
    }

    const link = document.createElement('link')
    link.id = 'leaflet-css'
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)

    const script = document.createElement('script')
    script.id = 'leaflet-js'
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => setMapLoaded(true)
    script.onerror = () => setMapError(true)
    document.head.appendChild(script)
  }, [todaysJobs.length])

  // Initialize map when Leaflet loaded + coords available
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || typeof window.L === 'undefined') return
    const coordEntries = Object.entries(jobCoords)
    if (coordEntries.length === 0 && !userLocation) return

    // Cleanup previous map
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove()
      mapInstanceRef.current = null
    }

    const L = window.L
    const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false })
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18
    }).addTo(map)

    const bounds = []

    // Job pins
    coordEntries.forEach(([jobId, coords]) => {
      const job = jobs.find(j => j.id === parseInt(jobId))
      if (!job) return
      const isActive = activeEntry?.job_id === parseInt(jobId)
      const marker = L.circleMarker([coords.lat, coords.lng], {
        radius: 8,
        fillColor: isActive ? '#22c55e' : theme.accent,
        color: '#fff',
        weight: 2,
        fillOpacity: 0.9
      }).addTo(map)
      marker.bindTooltip(job.job_title || job.customer?.name || 'Job', { direction: 'top', offset: [0, -10] })
      marker.on('click', () => {
        setExpandedJob(parseInt(jobId))
        jobCardRefs.current[jobId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
      bounds.push([coords.lat, coords.lng])
    })

    // User location
    if (userLocation) {
      L.circleMarker([userLocation.lat, userLocation.lng], {
        radius: 8,
        fillColor: '#3b82f6',
        color: '#fff',
        weight: 3,
        fillOpacity: 1
      }).addTo(map).bindTooltip('You', { direction: 'top', offset: [0, -10] })
      bounds.push([userLocation.lat, userLocation.lng])
    }

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 })
    }

    mapInstanceRef.current = map
  }, [mapLoaded, jobCoords, userLocation, activeEntry?.job_id])

  // Cleanup map on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  // ============== RENDER ==============
  return (
    <div style={{ padding: '16px', maxWidth: '600px', margin: '0 auto', overflowX: 'hidden' }}>

      {/* ===== SECTION 1: HEADER ===== */}
      <div style={{ marginBottom: '20px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '4px' }}>
          <Compass size={24} style={{ color: theme.accent }} />
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: theme.text, margin: 0 }}>
            {getGreeting()}, {firstName}
          </h1>
        </div>
        <div style={{ fontSize: '14px', color: theme.textMuted, marginBottom: '8px' }}>
          {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </div>
        <div style={{
          fontSize: '36px',
          fontWeight: '700',
          fontFamily: 'monospace',
          color: theme.accent,
          letterSpacing: '2px'
        }}>
          {currentTime.toLocaleTimeString()}
        </div>
      </div>

      {/* ===== SECTION 2: ACTIVE CLOCK BANNER ===== */}
      {activeEntry && (
        <div style={{
          background: isOnLunch
            ? 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)'
            : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '16px',
          color: '#fff',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Pulsing dot */}
          <div style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: '#fff',
            animation: 'fieldScoutPulse 2s infinite'
          }} />

          <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '4px' }}>
            {isOnLunch ? 'On Lunch Break' : 'Currently Working'}
          </div>
          <div style={{
            fontSize: '42px',
            fontWeight: '900',
            fontFamily: 'monospace',
            lineHeight: 1,
            marginBottom: '4px'
          }}>
            {formatElapsed(activeEntry.clock_in)}
          </div>
          <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px' }}>
            {activeJobName}
          </div>

          {/* Progress bar (8-hour day) */}
          <div style={{
            height: '6px',
            backgroundColor: 'rgba(255,255,255,0.3)',
            borderRadius: '3px',
            marginBottom: '16px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${Math.min(elapsedHours / 8 * 100, 100)}%`,
              height: '100%',
              backgroundColor: elapsedHours > 8 ? '#ef4444' : '#fff',
              borderRadius: '3px',
              transition: 'width 1s linear'
            }} />
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            {!isOnLunch ? (
              <button
                onClick={handleLunchStart}
                disabled={!!activeEntry.lunch_end}
                style={{
                  flex: 1,
                  padding: '14px',
                  backgroundColor: activeEntry.lunch_end ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.25)',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#fff',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: activeEntry.lunch_end ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  minHeight: '48px',
                  opacity: activeEntry.lunch_end ? 0.6 : 1
                }}
              >
                <Coffee size={18} />
                {activeEntry.lunch_end ? 'Lunch Done' : 'Take Lunch'}
              </button>
            ) : (
              <button
                onClick={handleLunchEnd}
                style={{
                  flex: 1,
                  padding: '14px',
                  backgroundColor: 'rgba(255,255,255,0.3)',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#fff',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  minHeight: '48px'
                }}
              >
                <Coffee size={18} />
                End Lunch
              </button>
            )}
            <button
              onClick={handleClockOut}
              disabled={clockingOut}
              style={{
                flex: 1,
                padding: '14px',
                backgroundColor: 'rgba(239,68,68,0.9)',
                border: 'none',
                borderRadius: '10px',
                color: '#fff',
                fontSize: '15px',
                fontWeight: '600',
                cursor: clockingOut ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                minHeight: '48px'
              }}
            >
              <Square size={18} />
              {clockingOut ? 'Saving...' : 'Clock Out'}
            </button>
          </div>
        </div>
      )}

      {/* ===== SECTION 3: QUICK STATS ===== */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '16px'
      }}>
        {[
          { label: 'Jobs Today', value: jobsToday, icon: Briefcase },
          { label: 'Hours Allotted', value: hoursAllotted ? `${hoursAllotted}h` : '—', icon: Timer },
          { label: 'Completed', value: completedToday, icon: CheckCircle }
        ].map((stat) => (
          <div key={stat.label} style={{
            flex: 1,
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`,
            borderRadius: '10px',
            padding: '10px 8px',
            textAlign: 'center'
          }}>
            <stat.icon size={16} style={{ color: theme.accent, marginBottom: '4px' }} />
            <div style={{ fontSize: '20px', fontWeight: '700', color: theme.text, lineHeight: 1.2 }}>
              {stat.value}
            </div>
            <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '2px' }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* ===== SECTION 4: TODAY'S JOBS ===== */}
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Briefcase size={18} style={{ color: theme.accent }} />
          Today's Jobs
        </h2>

        {sortedJobs.length === 0 ? (
          <div style={{
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`,
            borderRadius: '12px',
            padding: '32px 20px',
            textAlign: 'center',
            color: theme.textMuted
          }}>
            No jobs scheduled for today
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {sortedJobs.map(job => {
              const isActive = activeEntry?.job_id === job.id
              const isExpanded = expandedJob === job.id
              const sc = statusColor(job.status)
              const address = job.job_address || job.customer?.address
              const sections = jobSections[job.id]

              return (
                <div
                  key={job.id}
                  ref={el => jobCardRefs.current[job.id] = el}
                  style={{
                    backgroundColor: theme.bgCard,
                    border: `1px solid ${isActive ? '#22c55e' : theme.border}`,
                    borderLeft: isActive ? '4px solid #22c55e' : `1px solid ${theme.border}`,
                    borderRadius: '12px',
                    overflow: 'hidden',
                    boxShadow: isActive ? '0 0 20px rgba(34,197,94,0.15)' : theme.shadow,
                    transition: 'all 0.2s ease'
                  }}
                >
                  {/* Card header — tappable */}
                  <button
                    onClick={() => {
                      const next = isExpanded ? null : job.id
                      setExpandedJob(next)
                      if (next) fetchJobSections(next)
                    }}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      minHeight: '44px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '2px' }}>
                          {job.job_title || job.job_id}
                        </div>
                        <div style={{ fontSize: '13px', color: theme.textMuted }}>
                          {job.customer?.name}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: '20px',
                          fontSize: '11px',
                          fontWeight: '600',
                          backgroundColor: sc.bg,
                          color: sc.text
                        }}>
                          {isActive ? 'Working' : job.status}
                        </span>
                        {isExpanded ? <ChevronUp size={16} color={theme.textMuted} /> : <ChevronDown size={16} color={theme.textMuted} />}
                      </div>
                    </div>

                    {/* Address */}
                    {address && (
                      <div
                        onClick={(e) => { e.stopPropagation(); openMaps(address) }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '12px',
                          color: '#3b82f6',
                          cursor: 'pointer'
                        }}
                      >
                        <MapPin size={12} />
                        <span style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {address}
                        </span>
                      </div>
                    )}

                    {/* Meta row */}
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {job.hours_allotted && (
                        <span style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          backgroundColor: theme.accentBg,
                          color: theme.accent,
                          borderRadius: '4px',
                          fontWeight: '500'
                        }}>
                          {job.hours_allotted}h allotted
                        </span>
                      )}
                      {job.start_date && (
                        <span style={{ fontSize: '11px', color: theme.textMuted }}>
                          {new Date(job.start_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      )}
                    </div>

                    {/* Notes preview */}
                    {job.notes && !isExpanded && (
                      <div style={{
                        fontSize: '12px',
                        color: theme.textMuted,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        lineHeight: '1.4'
                      }}>
                        {job.notes}
                      </div>
                    )}
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div style={{
                      padding: '0 16px 16px',
                      borderTop: `1px solid ${theme.border}`
                    }}>
                      {/* Full notes */}
                      {job.notes && (
                        <div style={{
                          padding: '12px 0',
                          fontSize: '13px',
                          color: theme.textSecondary,
                          lineHeight: '1.5',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {job.notes}
                        </div>
                      )}

                      {/* Job details */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                        {job.customer?.phone && (
                          <a href={`tel:${job.customer.phone}`} style={{
                            fontSize: '12px',
                            color: '#3b82f6',
                            textDecoration: 'none',
                            padding: '4px 10px',
                            backgroundColor: 'rgba(59,130,246,0.1)',
                            borderRadius: '6px'
                          }}>
                            Call Customer
                          </a>
                        )}
                      </div>

                      {/* Job sections */}
                      {sections && sections.length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                          <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px' }}>
                            Job Sections
                          </div>
                          {sections.map(sec => (
                            <div key={sec.id} style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '6px 10px',
                              backgroundColor: theme.bg,
                              borderRadius: '6px',
                              marginBottom: '4px',
                              fontSize: '13px'
                            }}>
                              <span style={{ color: theme.text }}>{sec.section_name}</span>
                              <span style={{
                                fontSize: '11px',
                                padding: '2px 8px',
                                borderRadius: '10px',
                                backgroundColor: sec.status === 'Completed' ? 'rgba(34,197,94,0.15)' : 'rgba(90,155,213,0.15)',
                                color: sec.status === 'Completed' ? '#22c55e' : '#5a9bd5'
                              }}>
                                {sec.status || 'Pending'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {/* Clock In to This Job — only show if not already clocked in */}
                        {!activeEntry && (
                          <button
                            onClick={() => handleClockIn(job.id)}
                            disabled={clockingIn}
                            style={{
                              width: '100%',
                              padding: '16px',
                              height: '54px',
                              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                              border: 'none',
                              borderRadius: '12px',
                              color: '#fff',
                              fontSize: '16px',
                              fontWeight: '700',
                              cursor: clockingIn ? 'wait' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '10px'
                            }}
                          >
                            <Play size={20} />
                            {clockingIn ? 'Capturing location...' : 'Clock In to This Job'}
                          </button>
                        )}

                        <div style={{ display: 'flex', gap: '8px' }}>
                          {address && (
                            <button
                              onClick={() => openMaps(address)}
                              style={{
                                flex: 1,
                                padding: '12px',
                                backgroundColor: theme.accentBg,
                                border: `1px solid ${theme.accent}`,
                                borderRadius: '10px',
                                color: theme.accent,
                                fontSize: '14px',
                                fontWeight: '500',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                minHeight: '44px'
                              }}
                            >
                              <Navigation size={16} />
                              Navigate
                            </button>
                          )}
                          <button
                            onClick={() => navigate(`/jobs/${job.id}`)}
                            style={{
                              flex: 1,
                              padding: '12px',
                              backgroundColor: 'transparent',
                              border: `1px solid ${theme.border}`,
                              borderRadius: '10px',
                              color: theme.textSecondary,
                              fontSize: '14px',
                              fontWeight: '500',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              minHeight: '44px'
                            }}
                          >
                            <ExternalLink size={16} />
                            View Job
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ===== SECTION 5: MAP ===== */}
      {todaysJobs.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MapPin size={18} style={{ color: theme.accent }} />
            Job Locations
          </h2>

          {mapError ? (
            // Fallback: address list
            <div style={{
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: '12px',
              padding: '16px'
            }}>
              <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '8px' }}>
                Map unavailable — job addresses:
              </div>
              {todaysJobs.map(job => {
                const addr = job.job_address || job.customer?.address
                if (!addr) return null
                return (
                  <div
                    key={job.id}
                    onClick={() => openMaps(addr)}
                    style={{
                      padding: '8px 0',
                      borderBottom: `1px solid ${theme.border}`,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <MapPin size={14} style={{ color: '#3b82f6', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: theme.text }}>
                        {job.job_title || job.job_id}
                      </div>
                      <div style={{ fontSize: '12px', color: theme.textMuted }}>{addr}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div
              ref={mapRef}
              style={{
                width: '100%',
                height: '250px',
                borderRadius: '12px',
                border: `1px solid ${theme.border}`,
                backgroundColor: theme.bg,
                overflow: 'hidden'
              }}
            />
          )}
        </div>
      )}

      {/* ===== SECTION 6: STANDALONE CLOCK-IN ===== */}
      {!activeEntry && (
        <div style={{
          backgroundColor: theme.bgCard,
          border: `1px solid ${theme.border}`,
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '16px'
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={18} style={{ color: theme.accent }} />
            Clock In
          </h2>

          <select
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: theme.bg,
              border: `1px solid ${theme.border}`,
              borderRadius: '10px',
              color: theme.text,
              fontSize: '15px',
              marginBottom: '12px',
              minHeight: '44px'
            }}
          >
            <option value="">General — No specific job</option>
            {todaysJobs.map(job => (
              <option key={job.id} value={job.id}>
                {job.job_title || job.job_id} — {job.customer?.name || 'No customer'}
              </option>
            ))}
          </select>

          <button
            onClick={() => handleClockIn(selectedJobId ? parseInt(selectedJobId) : null)}
            disabled={clockingIn}
            style={{
              width: '100%',
              padding: '18px',
              height: '54px',
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              border: 'none',
              borderRadius: '12px',
              color: '#fff',
              fontSize: '18px',
              fontWeight: '700',
              cursor: clockingIn ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px'
            }}
          >
            <Play size={22} />
            {clockingIn ? (gpsStatus === 'capturing' ? 'Capturing location...' : 'Starting...') : 'Clock In'}
          </button>
        </div>
      )}

      {/* ===== SECTION 7: TODAY'S WORK LOG ===== */}
      {todayEntries.filter(e => e.clock_out).length > 0 && (
        <div style={{
          backgroundColor: theme.bgCard,
          border: `1px solid ${theme.border}`,
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '16px'
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={18} style={{ color: theme.accent }} />
            Today's Work Log
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {todayEntries.filter(e => e.clock_out).map(entry => {
              const entryJob = entry.job_id ? jobs.find(j => j.id === entry.job_id) : null
              return (
                <div key={entry.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 12px',
                  backgroundColor: theme.bg,
                  borderRadius: '8px'
                }}>
                  {/* Timeline dot */}
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: theme.accent,
                    flexShrink: 0
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                      {entryJob?.job_title || 'General'}
                    </div>
                    <div style={{ fontSize: '12px', color: theme.textMuted }}>
                      {new Date(entry.clock_in).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      {' — '}
                      {new Date(entry.clock_out).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: theme.accent, flexShrink: 0 }}>
                    {formatDuration(entry.total_hours)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Pulse animation */}
      <style>{`
        @keyframes fieldScoutPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
