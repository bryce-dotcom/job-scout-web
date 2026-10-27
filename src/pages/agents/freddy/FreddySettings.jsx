// Freddy's settings — what GPS is doing, and the one knob that changes it.
//
// What this page used to be: a "Watchdog Auth Token" field, a Test Connection
// button, a Tracker Slots panel with a "Purchase More Slots ($8/mo each)"
// button, and four alert toggles. Every one of those was theatre.
//
//   * The token field wrote company_agents.settings.watchdog_auth_token.
//     watchdog-proxy resolves credentials server-side and IGNORES a token in
//     the request body, so typing one changed nothing. Test Connection
//     reported the company's existing state regardless of what was typed —
//     "Connected (1 device)" for gibberish, or a failure for a new tenant no
//     matter what they pasted. Nobody in production had a value in it.
//   * The slots button incremented a number in a jsonb blob. No Stripe call,
//     no charge, no effect on anything — a billing control that billed nobody.
//   * movement_alerts / speeding_alerts / speed_limit_mph /
//     movement_threshold_mph were read by no code anywhere. Those are
//     per-device settings in Moto Watchdog's own app; a toggle here promised
//     alerts that could never fire.
//
// The legacy key is NOT deleted from storage: watchdog-proxy still honours a
// per-company partner token for any tenant who bought their own API access
// before fleet_integrations existed (see legacyPartnerToken there). Saving
// here spreads over the stored settings, so anything already in them survives.
//
// What is left is true: the connection state as the server actually sees it,
// where a tracker gets linked, and the map refresh interval — the only setting
// on this page that any code reads (FreddyTracking polls at it).

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { useGpsIntegration } from '../../../hooks/useGpsIntegration'
import {
  Save, CheckCircle2, Wifi, WifiOff, Radio, RefreshCw,
  AlertTriangle, Truck, ArrowRight
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

const intervalOptions = [
  { value: 1, label: '1 min' },
  { value: 5, label: '5 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '60 min' },
]

// A sync stamp is an instant, not a calendar day, so new Date(iso) is right
// here — the localDate rule applies to bare 'YYYY-MM-DD' values.
function sinceText(iso) {
  if (!iso) return null
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (!Number.isFinite(mins)) return null
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins} minutes ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.round(hrs / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export default function FreddySettings() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()
  const navigate = useNavigate()

  const getCompanyAgent = useStore(s => s.getCompanyAgent)
  const companyAgent = getCompanyAgent('freddy-fleet')
  const fleet = useStore(s => s.fleet) || []

  // Status as the server sees it, from the view with the secrets projected
  // out — not from a token sitting in a blob the browser happens to hold.
  const { loading: gpsLoading, status, connected, needsReauth, lastSyncAt, integration } = useGpsIntegration()

  const linked = fleet.filter(a => a.gps_device_id)

  const [interval, setIntervalMins] = useState(60)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const stored = Number(companyAgent?.settings?.auto_refresh_interval)
    if (Number.isFinite(stored) && stored > 0) setIntervalMins(stored)
  }, [companyAgent])

  const handleSave = async () => {
    if (!companyAgent?.id) return
    setSaving(true)
    try {
      // Spread over what is stored: a legacy partner token (still honoured
      // server-side) and anything another screen keeps in here must survive
      // a save from this page.
      await supabase
        .from('company_agents')
        .update({
          settings: { ...(companyAgent.settings || {}), auto_refresh_interval: interval },
          updated_at: new Date().toISOString(),
        })
        .eq('id', companyAgent.id)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      console.error('Error saving settings:', e)
    } finally {
      setSaving(false)
    }
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

  const noteStyle = {
    padding: '12px', borderRadius: '8px', background: theme.bg,
    fontSize: '13px', color: theme.textSecondary, lineHeight: 1.5,
  }

  const pill = (bg, fg, Icon, text) => (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '6px 12px', borderRadius: '20px',
      background: bg, color: fg, fontSize: '13px', fontWeight: '600',
    }}>
      <Icon size={14} />
      {text}
    </div>
  )

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text, margin: 0 }}>
          Freddy GPS Settings
        </h1>
        <p style={{ fontSize: '14px', color: theme.textMuted, marginTop: '4px' }}>
          Where your tracking stands, and how often the map refreshes
        </p>
      </div>

      {/* GPS Connection — status, not a form */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Radio size={20} style={{ color: theme.accent }} />
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: theme.text, margin: 0 }}>
            GPS Connection
          </h2>
        </div>

        {gpsLoading ? (
          <div style={{ fontSize: '14px', color: theme.textMuted }}>Checking…</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
              {connected && !needsReauth && pill('rgba(34,197,94,0.1)', '#22c55e', Wifi, 'Connected')}
              {needsReauth && pill('rgba(245,158,11,0.12)', '#b45309', AlertTriangle, 'Sign-in needs attention')}
              {!connected && pill('rgba(239,68,68,0.1)', '#ef4444', WifiOff, 'No trackers connected')}

              {lastSyncAt && (
                <span style={{ fontSize: '13px', color: theme.textMuted }}>
                  Last synced {sinceText(lastSyncAt)}
                </span>
              )}
            </div>

            {connected && (
              <div style={{ ...noteStyle, marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', color: theme.text }}>
                  <Truck size={15} style={{ color: theme.accent }} />
                  {linked.length} of {fleet.length} {fleet.length === 1 ? 'asset has' : 'assets have'} a tracker linked
                </div>
                {linked.length > 0 && (
                  <div style={{ marginTop: '4px' }}>
                    {linked.slice(0, 6).map(a => a.name || a.make_model || `Asset ${a.id}`).join(', ')}
                    {linked.length > 6 ? ` and ${linked.length - 6} more` : ''}
                  </div>
                )}
              </div>
            )}

            {needsReauth && integration?.last_error && (
              <div style={{
                marginBottom: '12px', padding: '8px 12px', borderRadius: '8px',
                background: 'rgba(245,158,11,0.08)', color: '#b45309', fontSize: '13px',
              }}>
                {integration.last_error}
              </div>
            )}

            {/* The real setup path. There is no account to connect here: the
                tracker is registered to the JobScout provider account when it
                is bought, and linking it to a vehicle is what turns tracking
                on for this company. */}
            <div style={noteStyle}>
              <div style={{ fontWeight: '600', color: theme.text, marginBottom: '4px' }}>
                How a tracker gets connected
              </div>
              Your Moto Watchdog trackers are registered to JobScout when you buy them, and we pair each
              one to its vehicle when it is fitted — there is no account to connect here. Once a tracker
              reports, that vehicle carries live position on its Fleet page and on Company Map, and its
              trips and driver scores fill in behind it.
              <div style={{ marginTop: '6px', color: theme.textMuted }}>
                {connected
                  ? 'Adding or moving a tracker: send us the serial and which vehicle it is on.'
                  : 'No trackers yet? Send us the serial of each one and the vehicle it is fitted to.'}
              </div>
            </div>

            <button
              onClick={() => navigate('/fleet')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                marginTop: '12px', padding: '10px 16px', minHeight: '44px',
                background: theme.accentBg, color: theme.accent,
                border: `1px solid ${theme.accent}`, borderRadius: '8px',
                cursor: 'pointer', fontWeight: '600', fontSize: '14px', fontFamily: 'inherit',
              }}
            >
              Open Fleet
              <ArrowRight size={16} />
            </button>
          </>
        )}
      </div>

      {/* Map refresh — the one setting on this page that code reads */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <RefreshCw size={20} style={{ color: theme.accent }} />
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: theme.text, margin: 0 }}>
            Map Refresh
          </h2>
        </div>

        <label style={labelStyle}>How often the tracking map reloads</label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {intervalOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setIntervalMins(opt.value); setSaved(false) }}
              style={{
                padding: '8px 14px', minHeight: '44px',
                borderRadius: '8px', fontWeight: '600', fontSize: '13px',
                border: `1px solid ${interval === opt.value ? theme.accent : theme.border}`,
                background: interval === opt.value ? theme.accent : theme.bgCard,
                color: interval === opt.value ? '#fff' : theme.text,
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.15s'
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div style={noteStyle}>
          Trackers report to Moto Watchdog on their own schedule and JobScout mirrors them every
          15 minutes, so refreshing the map more often shows the same positions sooner — it does not
          make the trackers report faster.
        </div>
      </div>

      {/* Speed and movement alerts live on the device, in the provider's app.
          Toggles here saved to keys no code read, which promised alerts that
          could never fire. Said plainly instead of re-implemented, because
          pushing them through watchdog-proxy's update_device is a feature,
          not a settings page. */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <AlertTriangle size={20} style={{ color: theme.accent }} />
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: theme.text, margin: 0 }}>
            Speeding &amp; Movement Alerts
          </h2>
        </div>
        <div style={noteStyle}>
          These are set on the tracker itself, in the Moto Watchdog app, per device — speed threshold,
          movement-outside-hours, geofences. Whatever a device raises shows up on Freddy's Alerts tab.
          JobScout does not override those settings.
        </div>
      </div>

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
    </div>
  )
}
