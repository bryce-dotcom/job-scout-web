import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { useIsMobile } from '../../../hooks/useIsMobile'
import {
  UserCheck, Shield, Gauge, AlertTriangle, Clock, Fuel,
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp,
  Settings, Truck, RefreshCw
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

const IDLE_FUEL_BURN_RATE = 0.5 // gallons per hour
const DEFAULT_FUEL_COST = 3.50 // dollars per gallon

function getScoreColor(score) {
  if (score >= 80) return { bg: 'rgba(34,197,94,0.12)', text: '#22c55e' }
  if (score >= 60) return { bg: 'rgba(234,179,8,0.12)', text: '#eab308' }
  return { bg: 'rgba(239,68,68,0.12)', text: '#ef4444' }
}

function getScoreIcon(score) {
  if (score >= 80) return TrendingUp
  if (score >= 60) return Minus
  return TrendingDown
}

function calculateDriverScore(alerts) {
  let score = 100
  let speedingEvents = 0
  let harshBrakingEvents = 0
  let idleEvents = 0

  for (const alert of alerts) {
    const type = (alert.type || alert.alert_type || '').toLowerCase()
    if (type.includes('speed') || type.includes('speeding')) {
      score -= 5
      speedingEvents++
    } else if (type.includes('harsh') || type.includes('brak') || type.includes('accel')) {
      score -= 3
      harshBrakingEvents++
    } else if (type.includes('idle')) {
      score -= 2
      idleEvents++
    }
  }

  return {
    score: Math.max(0, score),
    speedingEvents,
    harshBrakingEvents,
    idleEvents,
  }
}

function calculateIdleHours(trips) {
  let totalIdleSeconds = 0
  for (const trip of trips) {
    if (trip.idle_duration) {
      totalIdleSeconds += trip.idle_duration
    } else if (trip.idle_time_seconds) {
      totalIdleSeconds += trip.idle_time_seconds
    } else if (trip.idle_minutes) {
      totalIdleSeconds += trip.idle_minutes * 60
    }
  }
  return totalIdleSeconds / 3600
}

export default function FreddyDrivers() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()

  const companyId = useStore(s => s.companyId)
  const fleet = useStore(s => s.fleet)
  const employees = useStore(s => s.employees)
  const fetchFleet = useStore(s => s.fetchFleet)
  const fetchEmployees = useStore(s => s.fetchEmployees)
  const getCompanyAgent = useStore(s => s.getCompanyAgent)
  const companyAgent = getCompanyAgent('freddy-fleet')
  const authToken = companyAgent?.settings?.watchdog_auth_token

  const [alerts, setAlerts] = useState([])
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(false)
  const [expandedDriver, setExpandedDriver] = useState(null)
  const [fuelCostPerGallon, setFuelCostPerGallon] = useState(DEFAULT_FUEL_COST)
  const [fuelBurnRate, setFuelBurnRate] = useState(IDLE_FUEL_BURN_RATE)
  const [sortBy, setSortBy] = useState('score') // 'score' | 'name' | 'miles'

  useEffect(() => {
    if (companyId) {
      fetchFleet()
      fetchEmployees()
    }
  }, [companyId, fetchFleet, fetchEmployees])

  useEffect(() => {
    if (!authToken) return
    fetchData()
  }, [authToken])

  const fetchData = async () => {
    if (!authToken) return
    setLoading(true)
    try {
      const [alertsRes, tripsRes] = await Promise.all([
        supabase.functions.invoke('watchdog-proxy', {
          body: { action: 'alerts', auth_token: authToken }
        }),
        supabase.functions.invoke('watchdog-proxy', {
          body: { action: 'trips_completed', auth_token: authToken }
        }),
      ])
      if (alertsRes.data?.alerts) setAlerts(alertsRes.data.alerts)
      else if (Array.isArray(alertsRes.data)) setAlerts(alertsRes.data)
      if (tripsRes.data?.trips) setTrips(tripsRes.data.trips)
      else if (Array.isArray(tripsRes.data)) setTrips(tripsRes.data)
    } catch (e) {
      console.error('[FreddyDrivers] Error fetching GPS data:', e)
    } finally {
      setLoading(false)
    }
  }

  // Build driver data from fleet vehicles with assigned employees
  const driverData = useMemo(() => {
    const driversMap = new Map()

    for (const vehicle of fleet) {
      const empId = vehicle.assigned_to || vehicle.driver_id || vehicle.employee_id
      if (!empId) continue

      const employee = employees.find(e => e.id === empId || e.id === parseInt(empId))
      if (!employee) continue

      const driverKey = employee.id
      if (!driversMap.has(driverKey)) {
        driversMap.set(driverKey, {
          employee,
          vehicles: [],
          alerts: [],
          trips: [],
        })
      }
      driversMap.get(driverKey).vehicles.push(vehicle)
    }

    // Assign alerts and trips to drivers by device/vehicle
    for (const [, driver] of driversMap) {
      const vehicleIds = driver.vehicles.map(v => v.device_id || v.tracker_id || v.id?.toString())
      const vehicleNames = driver.vehicles.map(v => (v.name || '').toLowerCase())

      driver.alerts = alerts.filter(a => {
        const deviceId = a.device_id || a.tracker_id || ''
        const vehicleName = (a.vehicle_name || a.device_name || '').toLowerCase()
        return vehicleIds.includes(deviceId?.toString()) || vehicleNames.some(n => n && vehicleName.includes(n))
      })

      driver.trips = trips.filter(t => {
        const deviceId = t.device_id || t.tracker_id || ''
        const vehicleName = (t.vehicle_name || t.device_name || '').toLowerCase()
        return vehicleIds.includes(deviceId?.toString()) || vehicleNames.some(n => n && vehicleName.includes(n))
      })

      const scoring = calculateDriverScore(driver.alerts)
      driver.score = scoring.score
      driver.speedingEvents = scoring.speedingEvents
      driver.harshBrakingEvents = scoring.harshBrakingEvents
      driver.idleEvents = scoring.idleEvents

      driver.idleHours = calculateIdleHours(driver.trips)
      driver.totalMiles = driver.trips.reduce((sum, t) => sum + (t.distance_miles || t.distance || 0), 0)
    }

    const driversArray = Array.from(driversMap.values())

    // Sort
    if (sortBy === 'score') {
      driversArray.sort((a, b) => b.score - a.score)
    } else if (sortBy === 'name') {
      driversArray.sort((a, b) => (a.employee.name || '').localeCompare(b.employee.name || ''))
    } else if (sortBy === 'miles') {
      driversArray.sort((a, b) => b.totalMiles - a.totalMiles)
    }

    return driversArray
  }, [fleet, employees, alerts, trips, sortBy])

  // Summary calculations
  const totalDrivers = driverData.length
  const avgScore = totalDrivers > 0
    ? Math.round(driverData.reduce((sum, d) => sum + d.score, 0) / totalDrivers)
    : 0
  const totalIdleHours = driverData.reduce((sum, d) => sum + d.idleHours, 0)
  const idleFuelWaste = totalIdleHours * fuelBurnRate * fuelCostPerGallon

  // Styles
  const cardStyle = {
    background: theme.bgCard,
    borderRadius: '12px',
    border: `1px solid ${theme.border}`,
    padding: isMobile ? '16px' : '20px',
    boxShadow: theme.shadow,
  }

  const summaryCardStyle = {
    ...cardStyle,
    flex: 1,
    minWidth: isMobile ? '140px' : '180px',
    textAlign: 'center',
  }

  if (!authToken) {
    return (
      <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{
          ...cardStyle,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          padding: '48px 24px',
          textAlign: 'center',
        }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%',
            background: theme.accentBg, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Settings size={28} color={theme.accent} />
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>
              Connect GPS in Settings
            </div>
            <div style={{ fontSize: '14px', color: theme.textMuted, maxWidth: '400px' }}>
              Add your GPS tracking auth token in Freddy Settings to enable driver performance scoring and idle time tracking.
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '20px', flexWrap: 'wrap', gap: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: theme.accentBg, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <UserCheck size={20} color={theme.accent} />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '700', color: theme.text, margin: 0 }}>
              Driver Performance
            </h1>
            <div style={{ fontSize: '13px', color: theme.textMuted }}>
              Safety scores and idle time tracking
            </div>
          </div>
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '10px 16px', borderRadius: '8px',
            background: theme.accent, color: '#fff',
            border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '13px', fontWeight: '600', fontFamily: 'inherit',
            opacity: loading ? 0.7 : 1, minHeight: '44px',
          }}
        >
          <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{
        display: 'flex', gap: '12px', marginBottom: '24px',
        flexWrap: 'wrap',
      }}>
        <div style={summaryCardStyle}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: theme.accentBg, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 8px',
          }}>
            <UserCheck size={18} color={theme.accent} />
          </div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
            {totalDrivers}
          </div>
          <div style={{ fontSize: '12px', color: theme.textMuted }}>Total Drivers</div>
        </div>

        <div style={summaryCardStyle}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: getScoreColor(avgScore).bg, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 8px',
          }}>
            <Shield size={18} color={getScoreColor(avgScore).text} />
          </div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: getScoreColor(avgScore).text }}>
            {avgScore}
          </div>
          <div style={{ fontSize: '12px', color: theme.textMuted }}>Avg Safety Score</div>
        </div>

        <div style={summaryCardStyle}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: 'rgba(249,115,22,0.12)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 8px',
          }}>
            <Clock size={18} color="#f97316" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
            {totalIdleHours.toFixed(1)}
          </div>
          <div style={{ fontSize: '12px', color: theme.textMuted }}>Idle Hours (Week)</div>
        </div>

        <div style={summaryCardStyle}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: 'rgba(239,68,68,0.12)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 8px',
          }}>
            <Fuel size={18} color="#ef4444" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: '#ef4444' }}>
            ${idleFuelWaste.toFixed(2)}
          </div>
          <div style={{ fontSize: '12px', color: theme.textMuted }}>Idle Fuel Waste</div>
        </div>
      </div>

      {/* Sort Controls */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        marginBottom: '16px', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '13px', color: theme.textMuted, fontWeight: '500' }}>Sort by:</span>
        {[
          { key: 'score', label: 'Safety Score' },
          { key: 'name', label: 'Name' },
          { key: 'miles', label: 'Miles Driven' },
        ].map(opt => (
          <button
            key={opt.key}
            onClick={() => setSortBy(opt.key)}
            style={{
              padding: '8px 14px', borderRadius: '8px',
              border: `1px solid ${sortBy === opt.key ? theme.accent : theme.border}`,
              background: sortBy === opt.key ? theme.accentBg : 'transparent',
              color: sortBy === opt.key ? theme.accent : theme.textSecondary,
              fontSize: '13px', fontWeight: '500', cursor: 'pointer',
              fontFamily: 'inherit', minHeight: '44px',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Driver Leaderboard */}
      {loading && driverData.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '48px 24px' }}>
          <RefreshCw size={24} color={theme.textMuted} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
          <div style={{ fontSize: '14px', color: theme.textMuted }}>Loading driver data...</div>
        </div>
      ) : driverData.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '48px 24px' }}>
          <UserCheck size={32} color={theme.textMuted} style={{ marginBottom: '12px' }} />
          <div style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>
            No Drivers Found
          </div>
          <div style={{ fontSize: '13px', color: theme.textMuted }}>
            Assign employees to fleet vehicles to track driver performance.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
          {driverData.map((driver, idx) => {
            const sc = getScoreColor(driver.score)
            const ScoreIcon = getScoreIcon(driver.score)
            const isExpanded = expandedDriver === driver.employee.id

            return (
              <div key={driver.employee.id} style={cardStyle}>
                <button
                  onClick={() => setExpandedDriver(isExpanded ? null : driver.employee.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    width: '100%', background: 'none', border: 'none',
                    cursor: 'pointer', padding: 0, textAlign: 'left',
                    fontFamily: 'inherit', minHeight: '44px',
                  }}
                >
                  {/* Rank */}
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    background: idx < 3 ? theme.accentBg : theme.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', fontWeight: '700',
                    color: idx < 3 ? theme.accent : theme.textMuted,
                    flexShrink: 0,
                  }}>
                    {idx + 1}
                  </div>

                  {/* Driver Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>
                      {driver.employee.name || 'Unknown Driver'}
                    </div>
                    <div style={{ fontSize: '12px', color: theme.textMuted, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {driver.vehicles.map(v => (
                        <span key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Truck size={11} />
                          {v.name || v.asset_id}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Score Badge */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 12px', borderRadius: '20px',
                    background: sc.bg, flexShrink: 0,
                  }}>
                    <ScoreIcon size={14} color={sc.text} />
                    <span style={{ fontSize: '16px', fontWeight: '700', color: sc.text }}>
                      {driver.score}
                    </span>
                  </div>

                  {/* Miles */}
                  {!isMobile && (
                    <div style={{ textAlign: 'right', flexShrink: 0, minWidth: '80px' }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>
                        {driver.totalMiles.toFixed(0)}
                      </div>
                      <div style={{ fontSize: '11px', color: theme.textMuted }}>miles</div>
                    </div>
                  )}

                  {/* Expand Arrow */}
                  <div style={{ flexShrink: 0 }}>
                    {isExpanded ? (
                      <ChevronUp size={18} color={theme.textMuted} />
                    ) : (
                      <ChevronDown size={18} color={theme.textMuted} />
                    )}
                  </div>
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div style={{
                    marginTop: '16px', paddingTop: '16px',
                    borderTop: `1px solid ${theme.border}`,
                  }}>
                    {/* Score Breakdown */}
                    <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>
                      Score Breakdown
                    </div>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr',
                      gap: '10px', marginBottom: '16px',
                    }}>
                      <div style={{
                        padding: '12px', borderRadius: '8px', background: theme.bg,
                        textAlign: 'center',
                      }}>
                        <Gauge size={16} color="#ef4444" style={{ marginBottom: '4px' }} />
                        <div style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>
                          {driver.speedingEvents}
                        </div>
                        <div style={{ fontSize: '11px', color: theme.textMuted }}>Speeding (-5 ea)</div>
                      </div>
                      <div style={{
                        padding: '12px', borderRadius: '8px', background: theme.bg,
                        textAlign: 'center',
                      }}>
                        <AlertTriangle size={16} color="#f97316" style={{ marginBottom: '4px' }} />
                        <div style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>
                          {driver.harshBrakingEvents}
                        </div>
                        <div style={{ fontSize: '11px', color: theme.textMuted }}>Harsh Braking (-3 ea)</div>
                      </div>
                      <div style={{
                        padding: '12px', borderRadius: '8px', background: theme.bg,
                        textAlign: 'center',
                      }}>
                        <Clock size={16} color="#eab308" style={{ marginBottom: '4px' }} />
                        <div style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>
                          {driver.idleEvents}
                        </div>
                        <div style={{ fontSize: '11px', color: theme.textMuted }}>Idle Events (-2 ea)</div>
                      </div>
                      <div style={{
                        padding: '12px', borderRadius: '8px', background: theme.bg,
                        textAlign: 'center',
                      }}>
                        <Shield size={16} color={sc.text} style={{ marginBottom: '4px' }} />
                        <div style={{ fontSize: '18px', fontWeight: '700', color: sc.text }}>
                          {driver.score}/100
                        </div>
                        <div style={{ fontSize: '11px', color: theme.textMuted }}>Final Score</div>
                      </div>
                    </div>

                    {/* Idle Time & Miles */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                      gap: '10px',
                    }}>
                      <div style={{
                        padding: '12px', borderRadius: '8px', background: theme.bg,
                        display: 'flex', alignItems: 'center', gap: '10px',
                      }}>
                        <Clock size={16} color="#f97316" />
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>
                            {driver.idleHours.toFixed(1)} hours idle
                          </div>
                          <div style={{ fontSize: '11px', color: theme.textMuted }}>
                            ~${(driver.idleHours * fuelBurnRate * fuelCostPerGallon).toFixed(2)} fuel waste
                          </div>
                        </div>
                      </div>
                      {isMobile && (
                        <div style={{
                          padding: '12px', borderRadius: '8px', background: theme.bg,
                          display: 'flex', alignItems: 'center', gap: '10px',
                        }}>
                          <Truck size={16} color={theme.accent} />
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>
                              {driver.totalMiles.toFixed(0)} miles
                            </div>
                            <div style={{ fontSize: '11px', color: theme.textMuted }}>Total driven</div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Vehicles List */}
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px' }}>
                        Assigned Vehicles
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {driver.vehicles.map(v => (
                          <span key={v.id} style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            padding: '4px 10px', borderRadius: '6px',
                            background: theme.accentBg, fontSize: '12px',
                            color: theme.accent, fontWeight: '500',
                          }}>
                            <Truck size={12} />
                            {v.name || v.asset_id}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Idle Time Section */}
      {driverData.length > 0 && (
        <div style={cardStyle}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '16px', flexWrap: 'wrap', gap: '12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Fuel size={18} color="#f97316" />
              <span style={{ fontSize: '16px', fontWeight: '600', color: theme.text }}>
                Idle Time Breakdown
              </span>
            </div>

            {/* Fuel cost config */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '12px', color: theme.textMuted, display: 'flex', alignItems: 'center', gap: '4px' }}>
                Fuel $/gal:
                <input
                  type="number"
                  value={fuelCostPerGallon}
                  onChange={e => setFuelCostPerGallon(parseFloat(e.target.value) || 0)}
                  step="0.10"
                  min="0"
                  style={{
                    width: '70px', padding: '6px 8px', borderRadius: '6px',
                    border: `1px solid ${theme.border}`, background: theme.bg,
                    color: theme.text, fontSize: '13px', fontFamily: 'inherit',
                    textAlign: 'center', minHeight: '44px',
                  }}
                />
              </label>
              <label style={{ fontSize: '12px', color: theme.textMuted, display: 'flex', alignItems: 'center', gap: '4px' }}>
                Burn rate gal/hr:
                <input
                  type="number"
                  value={fuelBurnRate}
                  onChange={e => setFuelBurnRate(parseFloat(e.target.value) || 0)}
                  step="0.1"
                  min="0"
                  style={{
                    width: '70px', padding: '6px 8px', borderRadius: '6px',
                    border: `1px solid ${theme.border}`, background: theme.bg,
                    color: theme.text, fontSize: '13px', fontFamily: 'inherit',
                    textAlign: 'center', minHeight: '44px',
                  }}
                />
              </label>
            </div>
          </div>

          {/* Per-vehicle idle breakdown */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: '10px',
          }}>
            {driverData.flatMap(d => d.vehicles.map(v => {
              // Calculate idle for this specific vehicle
              const vehicleTrips = d.trips.filter(t => {
                const deviceId = t.device_id || t.tracker_id || ''
                const vehicleName = (t.vehicle_name || t.device_name || '').toLowerCase()
                return deviceId?.toString() === (v.device_id || v.tracker_id || v.id)?.toString()
                  || vehicleName.includes((v.name || '').toLowerCase())
              })
              const vehicleIdleHours = calculateIdleHours(vehicleTrips.length > 0 ? vehicleTrips : [])
              const vehicleIdleCost = vehicleIdleHours * fuelBurnRate * fuelCostPerGallon

              return (
                <div key={v.id} style={{
                  padding: '12px 16px', borderRadius: '8px',
                  background: theme.bg, display: 'flex',
                  alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Truck size={16} color={theme.accent} />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>
                        {v.name || v.asset_id}
                      </div>
                      <div style={{ fontSize: '11px', color: theme.textMuted }}>
                        {d.employee.name}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>
                      {vehicleIdleHours.toFixed(1)}h
                    </div>
                    <div style={{ fontSize: '11px', color: '#ef4444' }}>
                      ${vehicleIdleCost.toFixed(2)}
                    </div>
                  </div>
                </div>
              )
            }))}
          </div>

          {/* Total */}
          <div style={{
            marginTop: '12px', paddingTop: '12px',
            borderTop: `1px solid ${theme.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>
              Total Idle Cost Estimate
            </span>
            <span style={{ fontSize: '18px', fontWeight: '700', color: '#ef4444' }}>
              ${idleFuelWaste.toFixed(2)}
            </span>
          </div>
          <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>
            Calculated as: idle hours x {fuelBurnRate} gal/hr x ${fuelCostPerGallon.toFixed(2)}/gal
          </div>
        </div>
      )}

      {/* CSS for spin animation */}
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
