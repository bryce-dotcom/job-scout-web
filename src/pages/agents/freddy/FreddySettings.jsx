import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { useIsMobile } from '../../../hooks/useIsMobile'
import {
  Settings, Save, CheckCircle2, Wifi, WifiOff,
  Radio, Gauge, CreditCard, RefreshCw, AlertTriangle
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

const defaultSettings = {
  watchdog_auth_token: '',
  auto_refresh_interval: 60,
  movement_alerts: true,
  speeding_alerts: true,
  speed_limit_mph: 75,
  movement_threshold_mph: 3,
  purchased_slots: 0,
}

const intervalOptions = [
  { value: 1, label: '1 min' },
  { value: 5, label: '5 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '60 min' },
]

export default function FreddySettings() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()

  const companyId = useStore(s => s.companyId)
  const getCompanyAgent = useStore(s => s.getCompanyAgent)
  const companyAgent = getCompanyAgent('freddy-fleet')

  const [settings, setSettings] = useState(defaultSettings)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Connection test state
  const [testing, setTesting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState(null) // { connected, deviceCount }

  useEffect(() => {
    if (companyAgent?.settings) {
      setSettings(prev => ({ ...prev, ...companyAgent.settings }))
    }
  }, [companyAgent])

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  const handleSave = async () => {
    if (!companyAgent?.id) return
    setSaving(true)
    try {
      await supabase
        .from('company_agents')
        .update({ settings, updated_at: new Date().toISOString() })
        .eq('id', companyAgent.id)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      console.error('Error saving settings:', e)
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    const token = settings.watchdog_auth_token?.trim()
    if (!token) {
      setConnectionStatus({ connected: false, error: 'No auth token provided' })
      return
    }
    setTesting(true)
    setConnectionStatus(null)
    try {
      const { data, error } = await supabase.functions.invoke('watchdog-proxy', {
        body: { action: 'devices', auth_token: token }
      })
      if (error) {
        setConnectionStatus({ connected: false, error: error.message || 'Connection failed' })
      } else {
        const devices = Array.isArray(data?.devices) ? data.devices : []
        setConnectionStatus({ connected: true, deviceCount: devices.length })
      }
    } catch (e) {
      setConnectionStatus({ connected: false, error: e.message || 'Connection failed' })
    } finally {
      setTesting(false)
    }
  }

  const Toggle = ({ value, onChange }) => (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: '44px', height: '24px', borderRadius: '12px',
        background: value ? theme.accent : theme.border,
        border: 'none', cursor: 'pointer', position: 'relative',
        transition: 'background 0.2s', flexShrink: 0
      }}
    >
      <div style={{
        width: '18px', height: '18px', borderRadius: '50%',
        background: '#fff', position: 'absolute', top: '3px',
        left: value ? '23px' : '3px',
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
      }} />
    </button>
  )

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: `1px solid ${theme.border}`, background: theme.bg,
    color: theme.text, fontSize: '14px', outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box'
  }

  const labelStyle = {
    fontSize: '13px', fontWeight: '600', color: theme.text,
    display: 'block', marginBottom: '6px'
  }

  const sectionStyle = {
    background: theme.bgCard, borderRadius: '12px',
    border: `1px solid ${theme.border}`, padding: '20px',
    marginBottom: '16px', boxShadow: theme.shadow
  }

  const linkedDevices = connectionStatus?.connected ? connectionStatus.deviceCount : 0

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text, margin: 0 }}>
          Freddy GPS Settings
        </h1>
        <p style={{ fontSize: '14px', color: theme.textMuted, marginTop: '4px' }}>
          Configure GPS tracking, sync intervals, and speed alerts
        </p>
      </div>

      {/* GPS Connection */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Radio size={20} style={{ color: theme.accent }} />
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: theme.text, margin: 0 }}>
            GPS Connection
          </h2>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>Watchdog Auth Token</label>
          <input
            type="password"
            value={settings.watchdog_auth_token}
            onChange={e => updateSetting('watchdog_auth_token', e.target.value)}
            placeholder="Enter your Watchdog API auth token"
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={handleTestConnection}
            disabled={testing}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 16px', minHeight: '44px',
              background: theme.accentBg, color: theme.accent,
              border: `1px solid ${theme.accent}`, borderRadius: '8px',
              cursor: testing ? 'default' : 'pointer',
              fontWeight: '600', fontSize: '14px',
              opacity: testing ? 0.7 : 1,
              fontFamily: 'inherit'
            }}
          >
            <RefreshCw size={16} style={{ animation: testing ? 'spin 1s linear infinite' : 'none' }} />
            {testing ? 'Testing...' : 'Test Connection'}
          </button>

          {connectionStatus && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '6px 12px', borderRadius: '20px',
              background: connectionStatus.connected ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              color: connectionStatus.connected ? '#22c55e' : '#ef4444',
              fontSize: '13px', fontWeight: '600'
            }}>
              {connectionStatus.connected ? (
                <>
                  <Wifi size={14} />
                  Connected ({connectionStatus.deviceCount} device{connectionStatus.deviceCount !== 1 ? 's' : ''})
                </>
              ) : (
                <>
                  <WifiOff size={14} />
                  Disconnected
                </>
              )}
            </div>
          )}
        </div>

        {connectionStatus && !connectionStatus.connected && connectionStatus.error && (
          <div style={{
            marginTop: '10px', padding: '8px 12px', borderRadius: '8px',
            background: 'rgba(239,68,68,0.08)', color: '#ef4444',
            fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px'
          }}>
            <AlertTriangle size={14} />
            {connectionStatus.error}
          </div>
        )}
      </div>

      {/* Tracker Slots */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <CreditCard size={20} style={{ color: theme.accent }} />
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: theme.text, margin: 0 }}>
            Tracker Slots
          </h2>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: '12px', marginBottom: '16px'
        }}>
          <div style={{
            padding: '14px', borderRadius: '10px',
            background: theme.accentBg, textAlign: 'center'
          }}>
            <div style={{ fontSize: '28px', fontWeight: '700', color: theme.accent }}>
              {settings.purchased_slots}
            </div>
            <div style={{ fontSize: '13px', color: theme.textMuted }}>Purchased Slots</div>
          </div>
          <div style={{
            padding: '14px', borderRadius: '10px',
            background: 'rgba(59,130,246,0.08)', textAlign: 'center'
          }}>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#3b82f6' }}>
              {linkedDevices}
            </div>
            <div style={{ fontSize: '13px', color: theme.textMuted }}>Linked Devices</div>
          </div>
        </div>

        <div style={{
          padding: '12px', borderRadius: '8px',
          background: theme.bg, fontSize: '13px', color: theme.textSecondary,
          marginBottom: '12px'
        }}>
          <div style={{ fontWeight: '600', marginBottom: '4px' }}>Cost Breakdown</div>
          <div>{settings.purchased_slots} slot{settings.purchased_slots !== 1 ? 's' : ''} x $8/mo = ${settings.purchased_slots * 8}/mo</div>
          <div style={{ color: theme.textMuted, marginTop: '2px' }}>
            {settings.purchased_slots - linkedDevices > 0
              ? `${settings.purchased_slots - linkedDevices} slot${settings.purchased_slots - linkedDevices !== 1 ? 's' : ''} available`
              : linkedDevices > 0 ? 'All slots in use' : 'No slots purchased'
            }
          </div>
        </div>

        <button
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            width: '100%', padding: '10px', minHeight: '44px',
            background: '#3b82f6', color: '#fff',
            border: 'none', borderRadius: '8px',
            cursor: 'pointer', fontWeight: '600', fontSize: '14px',
            fontFamily: 'inherit'
          }}
          onClick={() => updateSetting('purchased_slots', settings.purchased_slots + 1)}
        >
          <CreditCard size={16} />
          Purchase More Slots ($8/mo each)
        </button>
      </div>

      {/* Sync Settings */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <RefreshCw size={20} style={{ color: theme.accent }} />
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: theme.text, margin: 0 }}>
            Sync Settings
          </h2>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Auto-Refresh Interval</label>
          <div style={{
            display: 'flex', gap: '8px', flexWrap: 'wrap'
          }}>
            {intervalOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => updateSetting('auto_refresh_interval', opt.value)}
                style={{
                  padding: '8px 14px', minHeight: '44px',
                  borderRadius: '8px', fontWeight: '600', fontSize: '13px',
                  border: `1px solid ${settings.auto_refresh_interval === opt.value ? theme.accent : theme.border}`,
                  background: settings.auto_refresh_interval === opt.value ? theme.accent : theme.bgCard,
                  color: settings.auto_refresh_interval === opt.value ? '#fff' : theme.text,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.15s'
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>Movement Alerts</div>
            <div style={{ fontSize: '13px', color: theme.textMuted }}>
              Notify when a vehicle starts moving outside scheduled hours
            </div>
          </div>
          <Toggle value={settings.movement_alerts} onChange={v => updateSetting('movement_alerts', v)} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>Speeding Alerts</div>
            <div style={{ fontSize: '13px', color: theme.textMuted }}>
              Notify when a vehicle exceeds the speed limit threshold
            </div>
          </div>
          <Toggle value={settings.speeding_alerts} onChange={v => updateSetting('speeding_alerts', v)} />
        </div>
      </div>

      {/* Speed Settings */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Gauge size={20} style={{ color: theme.accent }} />
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: theme.text, margin: 0 }}>
            Speed Settings
          </h2>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: '16px'
        }}>
          <div>
            <label style={labelStyle}>Speed Limit Threshold (mph)</label>
            <input
              type="number"
              value={settings.speed_limit_mph}
              onChange={e => updateSetting('speed_limit_mph', parseInt(e.target.value) || 0)}
              style={inputStyle}
              min="1"
              max="120"
            />
            <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>
              Alerts trigger when speed exceeds this value
            </div>
          </div>

          <div>
            <label style={labelStyle}>Movement Threshold (mph)</label>
            <input
              type="number"
              value={settings.movement_threshold_mph}
              onChange={e => updateSetting('movement_threshold_mph', parseInt(e.target.value) || 0)}
              style={inputStyle}
              min="1"
              max="20"
            />
            <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>
              Speed below this is considered "parked"
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          width: '100%', padding: '12px', minHeight: '44px',
          background: saved ? '#22c55e' : theme.accent,
          color: '#fff', border: 'none', borderRadius: '10px',
          cursor: saving ? 'default' : 'pointer',
          fontWeight: '600', fontSize: '15px',
          opacity: saving ? 0.7 : 1,
          transition: 'background 0.2s',
          fontFamily: 'inherit'
        }}
      >
        {saved ? (
          <><CheckCircle2 size={18} /> Saved!</>
        ) : saving ? (
          <>Saving...</>
        ) : (
          <><Save size={18} /> Save Settings</>
        )}
      </button>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
