import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { Link2, Send, Users, BarChart3, MousePointerClick, Plus, RefreshCw, Sparkles } from 'lucide-react'

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

const statusColors = {
  draft: { bg: 'rgba(107,114,128,0.15)', text: '#6b7280' },
  scheduled: { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6' },
  sending: { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b' },
  sent: { bg: 'rgba(34,197,94,0.15)', text: '#16a34a' },
  cancelled: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444' },
}

export default function ConradDashboard() {
  const navigate = useNavigate()
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  const ccIntegration = useStore(s => s.ccIntegration)
  const emailCampaigns = useStore(s => s.emailCampaigns)
  const ccContactMap = useStore(s => s.ccContactMap)
  const fetchCcIntegration = useStore(s => s.fetchCcIntegration)
  const companyId = useStore(s => s.companyId)

  const [connecting, setConnecting] = useState(false)

  const isConnected = ccIntegration && ccIntegration.status === 'active'

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

  const handleSyncContacts = async () => {
    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cc-sync-contacts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({ company_id: companyId })
        }
      )
    } catch (e) {
      console.error('Sync contacts error:', e)
    }
  }

  // Compute stats
  const sentCampaigns = emailCampaigns.filter(c => c.status === 'sent')
  const avgOpenRate = sentCampaigns.length > 0
    ? sentCampaigns.reduce((sum, c) => sum + (c.stats?.open_rate || 0), 0) / sentCampaigns.length
    : 0
  const avgClickRate = sentCampaigns.length > 0
    ? sentCampaigns.reduce((sum, c) => sum + (c.stats?.click_rate || 0), 0) / sentCampaigns.length
    : 0
  const recentCampaigns = emailCampaigns.slice(0, 5)

  if (!isConnected) {
    return (
      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, marginBottom: '24px' }}>
          Email Marketing Dashboard
        </h1>

        <div style={{
          background: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '48px',
          textAlign: 'center'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: theme.accentBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px'
          }}>
            <Link2 size={32} style={{ color: theme.accent }} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: theme.text, marginBottom: '8px' }}>
            Connect Constant Contact
          </h2>
          <p style={{ color: theme.textSecondary, marginBottom: '24px', maxWidth: '420px', margin: '0 auto 24px', lineHeight: '1.5' }}>
            Link your Constant Contact account to start sending professional email campaigns,
            syncing contacts, and tracking engagement -- all powered by AI.
          </p>
          <button
            onClick={handleConnect}
            disabled={connecting}
            style={{
              padding: '12px 24px',
              background: theme.accent,
              color: '#fff',
              borderRadius: '8px',
              border: 'none',
              cursor: connecting ? 'wait' : 'pointer',
              fontWeight: '600',
              fontSize: '14px',
              opacity: connecting ? 0.7 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Link2 size={16} />
            {connecting ? 'Connecting...' : 'Connect Constant Contact'}
          </button>

          {ccIntegration?.status === 'expired' && (
            <p style={{ color: '#f59e0b', fontSize: '13px', marginTop: '16px' }}>
              Your connection has expired. Please reconnect to continue sending campaigns.
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, marginBottom: '24px' }}>
        Email Marketing Dashboard
      </h1>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{
          background: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '16px',
          textAlign: 'center'
        }}>
          <Users size={20} style={{ color: theme.accent, marginBottom: '8px' }} />
          <div style={{ fontSize: '28px', fontWeight: '700', color: theme.accent }}>
            {ccContactMap.length}
          </div>
          <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>
            Contacts Synced
          </div>
        </div>

        <div style={{
          background: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '16px',
          textAlign: 'center'
        }}>
          <Send size={20} style={{ color: theme.accent, marginBottom: '8px' }} />
          <div style={{ fontSize: '28px', fontWeight: '700', color: theme.accent }}>
            {sentCampaigns.length}
          </div>
          <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>
            Campaigns Sent
          </div>
        </div>

        <div style={{
          background: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '16px',
          textAlign: 'center'
        }}>
          <BarChart3 size={20} style={{ color: theme.accent, marginBottom: '8px' }} />
          <div style={{ fontSize: '28px', fontWeight: '700', color: theme.accent }}>
            {avgOpenRate.toFixed(1)}%
          </div>
          <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>
            Avg Open Rate
          </div>
        </div>

        <div style={{
          background: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '16px',
          textAlign: 'center'
        }}>
          <MousePointerClick size={20} style={{ color: theme.accent, marginBottom: '8px' }} />
          <div style={{ fontSize: '28px', fontWeight: '700', color: theme.accent }}>
            {avgClickRate.toFixed(1)}%
          </div>
          <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>
            Avg Click Rate
          </div>
        </div>
      </div>

      {/* Recent Campaigns */}
      <div style={{
        background: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        padding: '20px',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text }}>Recent Campaigns</h2>
          <button
            onClick={() => navigate('/agents/conrad-connect/campaigns')}
            style={{
              padding: '6px 12px',
              background: 'transparent',
              color: theme.accent,
              borderRadius: '8px',
              border: `1px solid ${theme.accent}`,
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '12px'
            }}
          >
            View All
          </button>
        </div>

        {recentCampaigns.length === 0 ? (
          <p style={{ color: theme.textMuted, fontSize: '14px', textAlign: 'center', padding: '24px 0' }}>
            No campaigns yet. Create your first campaign to get started.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Name</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sent</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Opens</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Clicks</th>
              </tr>
            </thead>
            <tbody>
              {recentCampaigns.map(c => {
                const sc = statusColors[c.status] || statusColors.draft
                return (
                  <tr key={c.id}>
                    <td style={{ padding: '12px', fontSize: '14px', color: theme.text, borderBottom: `1px solid ${theme.border}` }}>{c.name}</td>
                    <td style={{ padding: '12px', fontSize: '14px', borderBottom: `1px solid ${theme.border}` }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600',
                        backgroundColor: sc.bg,
                        color: sc.text
                      }}>
                        {c.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>
                      {c.sent_at ? new Date(c.sent_at).toLocaleDateString() : '--'}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: theme.textSecondary, borderBottom: `1px solid ${theme.border}`, textAlign: 'right' }}>
                      {c.stats?.opens ?? '--'}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: theme.textSecondary, borderBottom: `1px solid ${theme.border}`, textAlign: 'right' }}>
                      {c.stats?.clicks ?? '--'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <button
          onClick={() => navigate('/agents/conrad-connect/campaigns')}
          style={{
            padding: '10px 20px',
            background: theme.accent,
            color: '#fff',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Plus size={16} />
          New Campaign
        </button>

        <button
          onClick={handleSyncContacts}
          style={{
            padding: '10px 20px',
            background: 'transparent',
            color: theme.accent,
            borderRadius: '8px',
            border: `1px solid ${theme.accent}`,
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <RefreshCw size={16} />
          Sync Contacts
        </button>

        <button
          onClick={() => navigate('/agents/conrad-connect/templates')}
          style={{
            padding: '10px 20px',
            background: 'transparent',
            color: theme.accent,
            borderRadius: '8px',
            border: `1px solid ${theme.accent}`,
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Sparkles size={16} />
          Generate AI Email
        </button>
      </div>
    </div>
  )
}
