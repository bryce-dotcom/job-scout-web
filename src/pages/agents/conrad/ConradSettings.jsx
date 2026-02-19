import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { Link2, Save } from 'lucide-react'

const defaultTheme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)'
}

const statusBadge = {
  active: { bg: 'rgba(34,197,94,0.15)', text: '#16a34a', label: 'Connected' },
  disconnected: { bg: 'rgba(107,114,128,0.15)', text: '#6b7280', label: 'Disconnected' },
  expired: { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b', label: 'Expired' },
}

export default function ConradSettings() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  const companyId = useStore(s => s.companyId)
  const company = useStore(s => s.company)
  const ccIntegration = useStore(s => s.ccIntegration)
  const fetchCcIntegration = useStore(s => s.fetchCcIntegration)

  const [fromName, setFromName] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [autoSync, setAutoSync] = useState(true)
  const [companyAddress, setCompanyAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [connecting, setConnecting] = useState(false)

  // Load settings from integration
  useEffect(() => {
    if (ccIntegration) {
      setFromName(ccIntegration.settings?.default_from_name || company?.name || '')
      setFromEmail(ccIntegration.settings?.default_from_email || '')
      setAutoSync(ccIntegration.sync_contacts_enabled ?? true)
      setCompanyAddress(ccIntegration.settings?.company_address || company?.address || '')
    }
  }, [ccIntegration, company])

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    background: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    color: theme.text,
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box'
  }

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: '4px'
  }

  const status = ccIntegration?.status || 'disconnected'
  const badge = statusBadge[status] || statusBadge.disconnected

  // Listen for OAuth popup postMessage
  const handleMessage = useCallback((event) => {
    if (event.data?.type === 'cc-oauth-success') {
      setConnecting(false)
      fetchCcIntegration()
    }
  }, [fetchCcIntegration])

  useEffect(() => {
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleMessage])

  const handleConnect = () => {
    setConnecting(true)
    const oauthUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cc-oauth?action=authorize&company_id=${companyId}`
    window.open(oauthUrl, 'cc-oauth', 'width=600,height=700')
  }

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Constant Contact? This will not delete any data, but campaigns and syncing will stop.')) return
    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cc-oauth`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({ action: 'disconnect', company_id: companyId })
        }
      )
      await fetchCcIntegration()
    } catch (e) {
      console.error('Disconnect error:', e)
    }
  }

  const handleSaveSettings = async () => {
    if (!ccIntegration) return
    setSaving(true)
    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cc-oauth`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            action: 'update_settings',
            company_id: companyId,
            settings: {
              default_from_name: fromName,
              default_from_email: fromEmail,
              company_address: companyAddress,
            },
            sync_contacts_enabled: autoSync,
          })
        }
      )
      await fetchCcIntegration()
    } catch (e) {
      console.error('Save settings error:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, marginBottom: '24px' }}>
        Settings
      </h1>

      {/* Connection Section */}
      <div style={{
        background: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        padding: '20px',
        marginBottom: '16px'
      }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
          Constant Contact Connection
        </h2>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span style={{
                padding: '3px 10px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: '600',
                backgroundColor: badge.bg,
                color: badge.text
              }}>
                {badge.label}
              </span>
            </div>
            {ccIntegration?.cc_account_id && (
              <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>
                Account ID: {ccIntegration.cc_account_id}
              </div>
            )}
            {ccIntegration?.connected_at && (
              <div style={{ fontSize: '13px', color: theme.textMuted }}>
                Connected: {new Date(ccIntegration.connected_at).toLocaleDateString()}
              </div>
            )}
          </div>

          <div>
            {status === 'active' && (
              <button
                onClick={handleDisconnect}
                style={{
                  padding: '8px 16px',
                  background: 'transparent',
                  color: '#ef4444',
                  borderRadius: '8px',
                  border: '1px solid #ef4444',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '13px'
                }}
              >
                Disconnect
              </button>
            )}
            {status === 'disconnected' && (
              <button
                onClick={handleConnect}
                disabled={connecting}
                style={{
                  padding: '8px 16px',
                  background: theme.accent,
                  color: '#fff',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: connecting ? 'wait' : 'pointer',
                  fontWeight: '600',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  opacity: connecting ? 0.7 : 1
                }}
              >
                <Link2 size={14} />
                {connecting ? 'Connecting...' : 'Connect Constant Contact'}
              </button>
            )}
            {status === 'expired' && (
              <button
                onClick={handleConnect}
                disabled={connecting}
                style={{
                  padding: '8px 16px',
                  background: '#f59e0b',
                  color: '#fff',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: connecting ? 'wait' : 'pointer',
                  fontWeight: '600',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  opacity: connecting ? 0.7 : 1
                }}
              >
                <Link2 size={14} />
                {connecting ? 'Connecting...' : 'Reconnect'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Default Sender Section */}
      <div style={{
        background: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        padding: '20px',
        marginBottom: '16px'
      }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
          Default Sender
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={labelStyle}>From Name</label>
            <input value={fromName} onChange={(e) => setFromName(e.target.value)} style={inputStyle} placeholder="Your Company Name" />
          </div>
          <div>
            <label style={labelStyle}>From Email</label>
            <input type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} style={inputStyle} placeholder="hello@yourcompany.com" />
          </div>
        </div>
      </div>

      {/* Sync Settings */}
      <div style={{
        background: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        padding: '20px',
        marginBottom: '16px'
      }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
          Sync Settings
        </h2>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>Auto-sync contacts</div>
            <div style={{ fontSize: '12px', color: theme.textMuted }}>
              Automatically keep Constant Contact contacts in sync with your customers and leads.
            </div>
          </div>
          <button
            onClick={() => setAutoSync(!autoSync)}
            style={{
              width: '44px',
              height: '24px',
              borderRadius: '12px',
              border: 'none',
              background: autoSync ? theme.accent : theme.border,
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.2s',
              flexShrink: 0
            }}
          >
            <div style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              background: '#fff',
              position: 'absolute',
              top: '3px',
              left: autoSync ? '23px' : '3px',
              transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
            }} />
          </button>
        </div>

        {ccIntegration?.last_contact_sync && (
          <div style={{ fontSize: '13px', color: theme.textMuted }}>
            Last sync: {new Date(ccIntegration.last_contact_sync).toLocaleString()}
          </div>
        )}
      </div>

      {/* Email Footer (CAN-SPAM) */}
      <div style={{
        background: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        padding: '20px',
        marginBottom: '24px'
      }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>
          Email Footer
        </h2>
        <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '16px', marginTop: 0 }}>
          Required by CAN-SPAM law. Your physical address will appear in the footer of every email.
        </p>

        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>Company Address</label>
          <textarea
            value={companyAddress}
            onChange={(e) => setCompanyAddress(e.target.value)}
            style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
            placeholder="123 Main Street, City, State, ZIP"
          />
        </div>

        <div style={{
          background: theme.bg,
          borderRadius: '8px',
          padding: '12px',
          fontSize: '12px',
          color: theme.textMuted
        }}>
          Unsubscribe link is automatically included by Constant Contact and cannot be modified.
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSaveSettings}
        disabled={saving || !ccIntegration}
        style={{
          padding: '12px 24px',
          background: theme.accent,
          color: '#fff',
          borderRadius: '8px',
          border: 'none',
          cursor: (saving || !ccIntegration) ? 'not-allowed' : 'pointer',
          fontWeight: '600',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          opacity: (saving || !ccIntegration) ? 0.5 : 1
        }}
      >
        <Save size={16} />
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  )
}
