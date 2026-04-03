import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { useIsMobile } from '../../../hooks/useIsMobile'
import {
  Bell, Gauge, MapPin, Move, Zap, Clock, Settings,
  RefreshCw, Filter, Plus, Edit3, Trash2, X,
  ToggleLeft, ToggleRight, Circle, Hexagon,
  ChevronDown, ChevronUp, Save, AlertTriangle, Navigation
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

const alertTypeColors = {
  speed: { bg: 'rgba(239,68,68,0.12)', text: '#ef4444', icon: Gauge },
  geofence: { bg: 'rgba(59,130,246,0.12)', text: '#3b82f6', icon: MapPin },
  movement: { bg: 'rgba(249,115,22,0.12)', text: '#f97316', icon: Move },
  power: { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b', icon: Zap },
  curfew: { bg: 'rgba(168,85,247,0.12)', text: '#a855f7', icon: Clock },
}

function getAlertTypeInfo(alertType) {
  const type = (alertType || '').toLowerCase()
  if (type.includes('speed')) return alertTypeColors.speed
  if (type.includes('geofence') || type.includes('geo') || type.includes('zone')) return alertTypeColors.geofence
  if (type.includes('movement') || type.includes('motion') || type.includes('start') || type.includes('stop')) return alertTypeColors.movement
  if (type.includes('power') || type.includes('battery') || type.includes('plug')) return alertTypeColors.power
  if (type.includes('curfew') || type.includes('after_hours')) return alertTypeColors.curfew
  return { bg: 'rgba(125,138,127,0.12)', text: '#7d8a7f', icon: Bell }
}

function getAlertTypeLabel(alertType) {
  const type = (alertType || '').toLowerCase()
  if (type.includes('speed')) return 'Speed'
  if (type.includes('geofence') || type.includes('geo') || type.includes('zone')) return 'Geofence'
  if (type.includes('movement') || type.includes('motion') || type.includes('start') || type.includes('stop')) return 'Movement'
  if (type.includes('power') || type.includes('battery') || type.includes('plug')) return 'Power'
  if (type.includes('curfew') || type.includes('after_hours')) return 'Curfew'
  return 'Other'
}

function formatTimestamp(ts) {
  if (!ts) return ''
  try {
    const d = new Date(ts)
    const now = new Date()
    const diffMs = now - d
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch {
    return ts
  }
}

const defaultGeofenceForm = {
  name: '',
  latitude: '',
  longitude: '',
  radius: 500,
  alert_on_entry: true,
  alert_on_exit: true,
}

export default function FreddyAlerts() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()

  const companyId = useStore(s => s.companyId)
  const getCompanyAgent = useStore(s => s.getCompanyAgent)
  const companyAgent = getCompanyAgent('freddy-fleet')
  const authToken = companyAgent?.settings?.watchdog_auth_token

  // Tab state
  const [activeTab, setActiveTab] = useState('alerts')

  // Alerts state
  const [alerts, setAlerts] = useState([])
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertFilter, setAlertFilter] = useState('all')

  // Geofences state
  const [geofences, setGeofences] = useState([])
  const [geofencesLoading, setGeofencesLoading] = useState(false)
  const [showGeofenceModal, setShowGeofenceModal] = useState(false)
  const [editingGeofence, setEditingGeofence] = useState(null)
  const [geofenceForm, setGeofenceForm] = useState(defaultGeofenceForm)
  const [savingGeofence, setSavingGeofence] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [expandedGeofence, setExpandedGeofence] = useState(null)
  const [geofenceLogs, setGeofenceLogs] = useState({})
  const [logsLoading, setLogsLoading] = useState(null)

  useEffect(() => {
    if (!authToken) return
    fetchAlerts()
    fetchGeofences()
  }, [authToken])

  const fetchAlerts = async () => {
    if (!authToken) return
    setAlertsLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('watchdog-proxy', {
        body: { action: 'alerts', auth_token: authToken }
      })
      if (error) {
        console.error('[FreddyAlerts] Error fetching alerts:', error)
      } else {
        const alertsList = data?.alerts || (Array.isArray(data) ? data : [])
        setAlerts(alertsList)
      }
    } catch (e) {
      console.error('[FreddyAlerts] Error:', e)
    } finally {
      setAlertsLoading(false)
    }
  }

  const fetchGeofences = async () => {
    if (!authToken) return
    setGeofencesLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('watchdog-proxy', {
        body: { action: 'geofences', auth_token: authToken }
      })
      if (error) {
        console.error('[FreddyAlerts] Error fetching geofences:', error)
      } else {
        const list = data?.geofences || (Array.isArray(data) ? data : [])
        setGeofences(list)
      }
    } catch (e) {
      console.error('[FreddyAlerts] Error:', e)
    } finally {
      setGeofencesLoading(false)
    }
  }

  const fetchGeofenceLogs = async (geofenceId) => {
    if (!authToken || !geofenceId) return
    setLogsLoading(geofenceId)
    try {
      const { data, error } = await supabase.functions.invoke('watchdog-proxy', {
        body: { action: 'geofence_logs', auth_token: authToken, geofence_id: geofenceId }
      })
      if (!error) {
        const logs = data?.logs || (Array.isArray(data) ? data : [])
        setGeofenceLogs(prev => ({ ...prev, [geofenceId]: logs }))
      }
    } catch (e) {
      console.error('[FreddyAlerts] Error fetching geofence logs:', e)
    } finally {
      setLogsLoading(null)
    }
  }

  const handleSaveGeofence = async () => {
    if (!authToken || !geofenceForm.name.trim()) return
    setSavingGeofence(true)
    try {
      const body = {
        action: editingGeofence ? 'update_geofence' : 'create_geofence',
        auth_token: authToken,
        name: geofenceForm.name.trim(),
        latitude: parseFloat(geofenceForm.latitude),
        longitude: parseFloat(geofenceForm.longitude),
        radius: parseInt(geofenceForm.radius) || 500,
        alert_on_entry: geofenceForm.alert_on_entry,
        alert_on_exit: geofenceForm.alert_on_exit,
      }
      if (editingGeofence) {
        body.geofence_id = editingGeofence.id
      }
      const { error } = await supabase.functions.invoke('watchdog-proxy', { body })
      if (!error) {
        setShowGeofenceModal(false)
        setEditingGeofence(null)
        setGeofenceForm(defaultGeofenceForm)
        fetchGeofences()
      }
    } catch (e) {
      console.error('[FreddyAlerts] Error saving geofence:', e)
    } finally {
      setSavingGeofence(false)
    }
  }

  const handleDeleteGeofence = async (geofenceId) => {
    if (!authToken || !geofenceId) return
    setDeletingId(geofenceId)
    try {
      await supabase.functions.invoke('watchdog-proxy', {
        body: { action: 'delete_geofence', auth_token: authToken, geofence_id: geofenceId }
      })
      fetchGeofences()
    } catch (e) {
      console.error('[FreddyAlerts] Error deleting geofence:', e)
    } finally {
      setDeletingId(null)
    }
  }

  const openEditGeofence = (gf) => {
    setEditingGeofence(gf)
    setGeofenceForm({
      name: gf.name || '',
      latitude: gf.latitude || gf.lat || '',
      longitude: gf.longitude || gf.lng || gf.lon || '',
      radius: gf.radius || 500,
      alert_on_entry: gf.alert_on_entry !== false,
      alert_on_exit: gf.alert_on_exit !== false,
    })
    setShowGeofenceModal(true)
  }

  const openCreateGeofence = () => {
    setEditingGeofence(null)
    setGeofenceForm(defaultGeofenceForm)
    setShowGeofenceModal(true)
  }

  // Filter alerts
  const filteredAlerts = useMemo(() => {
    if (alertFilter === 'all') return alerts
    return alerts.filter(a => {
      const label = getAlertTypeLabel(a.type || a.alert_type || '').toLowerCase()
      return label === alertFilter
    })
  }, [alerts, alertFilter])

  // Styles
  const cardStyle = {
    background: theme.bgCard,
    borderRadius: '12px',
    border: `1px solid ${theme.border}`,
    padding: isMobile ? '16px' : '20px',
    boxShadow: theme.shadow,
  }

  const tabButtonStyle = (active) => ({
    padding: '10px 20px',
    borderRadius: '8px',
    border: `1px solid ${active ? theme.accent : theme.border}`,
    background: active ? theme.accent : 'transparent',
    color: active ? '#fff' : theme.textSecondary,
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit',
    minHeight: '44px',
    flex: isMobile ? 1 : 'unset',
  })

  const filterBtnStyle = (active) => ({
    padding: '8px 14px',
    borderRadius: '20px',
    border: `1px solid ${active ? theme.accent : theme.border}`,
    background: active ? theme.accentBg : 'transparent',
    color: active ? theme.accent : theme.textMuted,
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: 'inherit',
    minHeight: '44px',
    whiteSpace: 'nowrap',
  })

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: `1px solid ${theme.border}`,
    background: theme.bg,
    color: theme.text,
    fontSize: '14px',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    minHeight: '44px',
  }

  const labelStyle = {
    fontSize: '13px',
    fontWeight: '600',
    color: theme.text,
    display: 'block',
    marginBottom: '6px',
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
              Add your GPS tracking auth token in Freddy Settings to enable alerts and geofence management.
            </div>
          </div>
        </div>
      </div>
    )
  }

  const Toggle = ({ value, onChange, label }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
      <span style={{ fontSize: '14px', color: theme.text }}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: '44px', height: '24px', borderRadius: '12px',
          background: value ? theme.accent : theme.border,
          border: 'none', cursor: 'pointer', position: 'relative',
          transition: 'background 0.2s', flexShrink: 0,
          minWidth: '44px',
        }}
      >
        <div style={{
          width: '18px', height: '18px', borderRadius: '50%',
          background: '#fff', position: 'absolute', top: '3px',
          left: value ? '23px' : '3px',
          transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </button>
    </div>
  )

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
            <Bell size={20} color={theme.accent} />
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: '700', color: theme.text, margin: 0 }}>
            Alerts & Geofences
          </h1>
        </div>

        <button
          onClick={() => { fetchAlerts(); fetchGeofences() }}
          disabled={alertsLoading || geofencesLoading}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '10px 16px', borderRadius: '8px',
            background: theme.accent, color: '#fff',
            border: 'none', cursor: (alertsLoading || geofencesLoading) ? 'not-allowed' : 'pointer',
            fontSize: '13px', fontWeight: '600', fontFamily: 'inherit',
            opacity: (alertsLoading || geofencesLoading) ? 0.7 : 1, minHeight: '44px',
          }}
        >
          <RefreshCw size={16} style={{
            animation: (alertsLoading || geofencesLoading) ? 'spin 1s linear infinite' : 'none'
          }} />
          Refresh
        </button>
      </div>

      {/* Tab Toggle */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button
          onClick={() => setActiveTab('alerts')}
          style={tabButtonStyle(activeTab === 'alerts')}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Bell size={16} />
            Alerts
            {alerts.length > 0 && (
              <span style={{
                background: activeTab === 'alerts' ? 'rgba(255,255,255,0.25)' : theme.accentBg,
                padding: '1px 8px', borderRadius: '10px', fontSize: '11px',
                fontWeight: '700',
              }}>
                {alerts.length}
              </span>
            )}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('geofences')}
          style={tabButtonStyle(activeTab === 'geofences')}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MapPin size={16} />
            Geofences
            {geofences.length > 0 && (
              <span style={{
                background: activeTab === 'geofences' ? 'rgba(255,255,255,0.25)' : theme.accentBg,
                padding: '1px 8px', borderRadius: '10px', fontSize: '11px',
                fontWeight: '700',
              }}>
                {geofences.length}
              </span>
            )}
          </span>
        </button>
      </div>

      {/* ========== ALERTS TAB ========== */}
      {activeTab === 'alerts' && (
        <div>
          {/* Filter Buttons */}
          <div style={{
            display: 'flex', gap: '8px', marginBottom: '16px',
            overflowX: 'auto', paddingBottom: '4px',
          }}>
            {[
              { key: 'all', label: 'All' },
              { key: 'speed', label: 'Speed' },
              { key: 'geofence', label: 'Geofence' },
              { key: 'movement', label: 'Movement' },
              { key: 'power', label: 'Power' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setAlertFilter(f.key)}
                style={filterBtnStyle(alertFilter === f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Alert Feed */}
          {alertsLoading && filteredAlerts.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: 'center', padding: '48px 24px' }}>
              <RefreshCw size={24} color={theme.textMuted} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
              <div style={{ fontSize: '14px', color: theme.textMuted }}>Loading alerts...</div>
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: 'center', padding: '48px 24px' }}>
              <Bell size={32} color={theme.textMuted} style={{ marginBottom: '12px' }} />
              <div style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>
                No Alerts
              </div>
              <div style={{ fontSize: '13px', color: theme.textMuted }}>
                {alertFilter !== 'all'
                  ? `No ${alertFilter} alerts found. Try a different filter.`
                  : 'No alerts have been triggered yet.'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredAlerts.map((alert, idx) => {
                const typeInfo = getAlertTypeInfo(alert.type || alert.alert_type)
                const TypeIcon = typeInfo.icon

                return (
                  <div key={alert.id || idx} style={{
                    ...cardStyle,
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                  }}>
                    {/* Icon */}
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '50%',
                      background: typeInfo.bg, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <TypeIcon size={18} color={typeInfo.text} />
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        marginBottom: '4px', flexWrap: 'wrap',
                      }}>
                        <span style={{
                          fontSize: '11px', fontWeight: '600', textTransform: 'uppercase',
                          letterSpacing: '0.5px', color: typeInfo.text,
                          background: typeInfo.bg, padding: '2px 8px',
                          borderRadius: '4px',
                        }}>
                          {getAlertTypeLabel(alert.type || alert.alert_type)}
                        </span>
                        {(alert.vehicle_name || alert.device_name) && (
                          <span style={{
                            fontSize: '12px', color: theme.textSecondary, fontWeight: '500',
                            display: 'flex', alignItems: 'center', gap: '3px',
                          }}>
                            <Truck size={12} />
                            {alert.vehicle_name || alert.device_name}
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: '14px', color: theme.text, marginBottom: '4px' }}>
                        {alert.description || alert.message || alert.alert_message || `${getAlertTypeLabel(alert.type || alert.alert_type)} alert triggered`}
                      </div>

                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        flexWrap: 'wrap', fontSize: '12px', color: theme.textMuted,
                      }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Clock size={11} />
                          {formatTimestamp(alert.created_at || alert.timestamp || alert.time)}
                        </span>
                        {(alert.address || alert.location) && (
                          <span style={{
                            display: 'flex', alignItems: 'center', gap: '3px',
                            maxWidth: isMobile ? '200px' : '400px',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            <Navigation size={11} />
                            {alert.address || alert.location}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ========== GEOFENCES TAB ========== */}
      {activeTab === 'geofences' && (
        <div>
          {/* Create Button */}
          <div style={{ marginBottom: '16px' }}>
            <button
              onClick={openCreateGeofence}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '10px 18px', borderRadius: '8px',
                background: theme.accent, color: '#fff',
                border: 'none', cursor: 'pointer',
                fontSize: '13px', fontWeight: '600', fontFamily: 'inherit',
                minHeight: '44px',
              }}
            >
              <Plus size={16} />
              Create Geofence
            </button>
          </div>

          {/* Geofence List */}
          {geofencesLoading && geofences.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: 'center', padding: '48px 24px' }}>
              <RefreshCw size={24} color={theme.textMuted} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
              <div style={{ fontSize: '14px', color: theme.textMuted }}>Loading geofences...</div>
            </div>
          ) : geofences.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: 'center', padding: '48px 24px' }}>
              <MapPin size={32} color={theme.textMuted} style={{ marginBottom: '12px' }} />
              <div style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>
                No Geofences
              </div>
              <div style={{ fontSize: '13px', color: theme.textMuted }}>
                Create a geofence to get alerts when vehicles enter or leave specific areas.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {geofences.map((gf) => {
                const isExpanded = expandedGeofence === (gf.id || gf.name)
                const gfLogs = geofenceLogs[gf.id] || []
                const gfType = gf.type || (gf.points ? 'polygon' : 'circle')

                return (
                  <div key={gf.id || gf.name} style={cardStyle}>
                    {/* Geofence Header */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                    }}>
                      <div style={{
                        width: '36px', height: '36px', borderRadius: '50%',
                        background: alertTypeColors.geofence.bg, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        {gfType === 'polygon' ? (
                          <Hexagon size={18} color={alertTypeColors.geofence.text} />
                        ) : (
                          <Circle size={18} color={alertTypeColors.geofence.text} />
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>
                          {gf.name || 'Unnamed Geofence'}
                        </div>
                        <div style={{ fontSize: '12px', color: theme.textMuted, display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                          <span style={{ textTransform: 'capitalize' }}>{gfType}</span>
                          {gf.radius && <span>{gf.radius}m radius</span>}
                          <span style={{
                            color: gf.active !== false ? '#22c55e' : theme.textMuted,
                          }}>
                            {gf.active !== false ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button
                          onClick={() => {
                            const id = gf.id || gf.name
                            if (isExpanded) {
                              setExpandedGeofence(null)
                            } else {
                              setExpandedGeofence(id)
                              if (!geofenceLogs[gf.id]) fetchGeofenceLogs(gf.id)
                            }
                          }}
                          style={{
                            width: '44px', height: '44px', borderRadius: '8px',
                            border: `1px solid ${theme.border}`, background: 'transparent',
                            cursor: 'pointer', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                          }}
                          title="View logs"
                        >
                          {isExpanded ? (
                            <ChevronUp size={16} color={theme.textMuted} />
                          ) : (
                            <ChevronDown size={16} color={theme.textMuted} />
                          )}
                        </button>
                        <button
                          onClick={() => openEditGeofence(gf)}
                          style={{
                            width: '44px', height: '44px', borderRadius: '8px',
                            border: `1px solid ${theme.border}`, background: 'transparent',
                            cursor: 'pointer', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                          }}
                          title="Edit geofence"
                        >
                          <Edit3 size={16} color={theme.textMuted} />
                        </button>
                        <button
                          onClick={() => handleDeleteGeofence(gf.id)}
                          disabled={deletingId === gf.id}
                          style={{
                            width: '44px', height: '44px', borderRadius: '8px',
                            border: `1px solid ${theme.border}`, background: 'transparent',
                            cursor: deletingId === gf.id ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            opacity: deletingId === gf.id ? 0.5 : 1,
                          }}
                          title="Delete geofence"
                        >
                          <Trash2 size={16} color="#ef4444" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded: Entry/Exit Logs */}
                    {isExpanded && (
                      <div style={{
                        marginTop: '16px', paddingTop: '16px',
                        borderTop: `1px solid ${theme.border}`,
                      }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text, marginBottom: '10px' }}>
                          Entry / Exit Logs
                        </div>

                        {logsLoading === gf.id ? (
                          <div style={{
                            padding: '20px', textAlign: 'center',
                            fontSize: '13px', color: theme.textMuted,
                          }}>
                            <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite', marginBottom: '6px' }} />
                            <div>Loading logs...</div>
                          </div>
                        ) : gfLogs.length === 0 ? (
                          <div style={{
                            padding: '20px', textAlign: 'center',
                            fontSize: '13px', color: theme.textMuted,
                            background: theme.bg, borderRadius: '8px',
                          }}>
                            No entry/exit events recorded yet.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {gfLogs.slice(0, 20).map((log, idx) => {
                              const isEntry = (log.type || log.event || '').toLowerCase().includes('entry') || (log.type || log.event || '').toLowerCase().includes('enter')
                              return (
                                <div key={log.id || idx} style={{
                                  display: 'flex', alignItems: 'center', gap: '10px',
                                  padding: '10px 12px', borderRadius: '8px',
                                  background: theme.bg,
                                }}>
                                  <div style={{
                                    width: '8px', height: '8px', borderRadius: '50%',
                                    background: isEntry ? '#22c55e' : '#ef4444',
                                    flexShrink: 0,
                                  }} />
                                  <div style={{ flex: 1 }}>
                                    <span style={{
                                      fontSize: '13px', fontWeight: '500', color: theme.text,
                                    }}>
                                      {isEntry ? 'Entered' : 'Exited'}
                                    </span>
                                    {(log.vehicle_name || log.device_name) && (
                                      <span style={{ fontSize: '12px', color: theme.textMuted, marginLeft: '8px' }}>
                                        {log.vehicle_name || log.device_name}
                                      </span>
                                    )}
                                  </div>
                                  <span style={{ fontSize: '11px', color: theme.textMuted, flexShrink: 0 }}>
                                    {formatTimestamp(log.created_at || log.timestamp || log.time)}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ========== GEOFENCE MODAL ========== */}
      {showGeofenceModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.4)', padding: '16px',
        }}>
          <div style={{
            background: theme.bgCard, borderRadius: '16px',
            border: `1px solid ${theme.border}`, boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            width: '100%', maxWidth: '480px', maxHeight: '90vh',
            overflow: 'auto',
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '20px 20px 0',
            }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: theme.text, margin: 0 }}>
                {editingGeofence ? 'Edit Geofence' : 'Create Geofence'}
              </h2>
              <button
                onClick={() => { setShowGeofenceModal(false); setEditingGeofence(null) }}
                style={{
                  width: '44px', height: '44px', borderRadius: '8px',
                  border: 'none', background: theme.bg, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={18} color={theme.textMuted} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Name */}
              <div>
                <label style={labelStyle}>Name</label>
                <input
                  type="text"
                  value={geofenceForm.name}
                  onChange={e => setGeofenceForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Office, Warehouse"
                  style={inputStyle}
                />
              </div>

              {/* Lat/Lng */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Latitude</label>
                  <input
                    type="number"
                    value={geofenceForm.latitude}
                    onChange={e => setGeofenceForm(prev => ({ ...prev, latitude: e.target.value }))}
                    placeholder="40.7128"
                    step="any"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Longitude</label>
                  <input
                    type="number"
                    value={geofenceForm.longitude}
                    onChange={e => setGeofenceForm(prev => ({ ...prev, longitude: e.target.value }))}
                    placeholder="-74.0060"
                    step="any"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Radius */}
              <div>
                <label style={labelStyle}>Radius (meters)</label>
                <input
                  type="number"
                  value={geofenceForm.radius}
                  onChange={e => setGeofenceForm(prev => ({ ...prev, radius: e.target.value }))}
                  placeholder="500"
                  min="50"
                  style={inputStyle}
                />
              </div>

              {/* Alert Toggles */}
              <div style={{
                padding: '16px', borderRadius: '8px',
                background: theme.bg, display: 'flex',
                flexDirection: 'column', gap: '14px',
              }}>
                <Toggle
                  value={geofenceForm.alert_on_entry}
                  onChange={v => setGeofenceForm(prev => ({ ...prev, alert_on_entry: v }))}
                  label="Alert on entry"
                />
                <Toggle
                  value={geofenceForm.alert_on_exit}
                  onChange={v => setGeofenceForm(prev => ({ ...prev, alert_on_exit: v }))}
                  label="Alert on exit"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '16px 20px 20px',
              display: 'flex', gap: '10px', justifyContent: 'flex-end',
              borderTop: `1px solid ${theme.border}`,
            }}>
              <button
                onClick={() => { setShowGeofenceModal(false); setEditingGeofence(null) }}
                style={{
                  padding: '10px 20px', borderRadius: '8px',
                  border: `1px solid ${theme.border}`, background: 'transparent',
                  color: theme.textSecondary, fontSize: '14px', fontWeight: '500',
                  cursor: 'pointer', fontFamily: 'inherit', minHeight: '44px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveGeofence}
                disabled={savingGeofence || !geofenceForm.name.trim() || !geofenceForm.latitude || !geofenceForm.longitude}
                style={{
                  padding: '10px 20px', borderRadius: '8px',
                  border: 'none', background: theme.accent,
                  color: '#fff', fontSize: '14px', fontWeight: '600',
                  cursor: savingGeofence ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', minHeight: '44px',
                  opacity: (savingGeofence || !geofenceForm.name.trim()) ? 0.7 : 1,
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                <Save size={16} />
                {savingGeofence ? 'Saving...' : editingGeofence ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS for spin animation */}
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
