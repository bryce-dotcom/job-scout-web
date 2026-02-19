import { useState } from 'react'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { RefreshCw, Users, AlertTriangle, Search } from 'lucide-react'

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

const syncStatusColors = {
  synced: { bg: 'rgba(34,197,94,0.15)', text: '#16a34a' },
  error: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444' },
  unsubscribed: { bg: 'rgba(107,114,128,0.15)', text: '#6b7280' },
}

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'customers', label: 'Customers' },
  { value: 'leads', label: 'Leads' },
  { value: 'unsubscribed', label: 'Unsubscribed' },
]

export default function ConradContacts() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  const companyId = useStore(s => s.companyId)
  const ccContactMap = useStore(s => s.ccContactMap)
  const ccIntegration = useStore(s => s.ccIntegration)
  const customers = useStore(s => s.customers)
  const leads = useStore(s => s.leads)
  const fetchCcContactMap = useStore(s => s.fetchCcContactMap)
  const fetchCcIntegration = useStore(s => s.fetchCcIntegration)

  const [syncing, setSyncing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState('all')

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    background: theme.bgCard,
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    color: theme.text,
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box'
  }

  const handleSync = async () => {
    setSyncing(true)
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
      await fetchCcContactMap()
      await fetchCcIntegration()
    } catch (e) {
      console.error('Sync contacts error:', e)
    } finally {
      setSyncing(false)
    }
  }

  // Compute stats
  const customerContacts = ccContactMap.filter(c => c.customer_id)
  const leadContacts = ccContactMap.filter(c => c.lead_id)
  const unsubscribed = ccContactMap.filter(c => c.sync_status === 'unsubscribed')

  // Check marketing opt-in
  const optedOutCustomers = customers.filter(c => c.marketing_opt_in === false)
  const showOptInWarning = optedOutCustomers.length > 5

  // Filter contacts
  const filteredContacts = ccContactMap.filter(contact => {
    // Search
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      const name = contact.customer?.name?.toLowerCase() || contact.lead?.customer_name?.toLowerCase() || ''
      const email = contact.email?.toLowerCase() || ''
      if (!name.includes(search) && !email.includes(search)) return false
    }

    // Filter
    if (filter === 'customers' && !contact.customer_id) return false
    if (filter === 'leads' && !contact.lead_id) return false
    if (filter === 'unsubscribed' && contact.sync_status !== 'unsubscribed') return false

    return true
  })

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, marginBottom: '24px' }}>
        Contacts
      </h1>

      {/* Sync Status Card */}
      <div style={{
        background: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        padding: '20px',
        marginBottom: '16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>
            Contact Sync
          </div>
          <div style={{ fontSize: '13px', color: theme.textMuted, marginTop: '4px' }}>
            {ccIntegration?.last_contact_sync
              ? `Last synced: ${new Date(ccIntegration.last_contact_sync).toLocaleString()}`
              : 'Never synced'}
          </div>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            background: theme.accent,
            color: '#fff',
            borderRadius: '8px',
            border: 'none',
            cursor: syncing ? 'wait' : 'pointer',
            fontWeight: '600',
            fontSize: '13px',
            opacity: syncing ? 0.7 : 1
          }}
        >
          <RefreshCw size={16} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      {/* Warning Banner */}
      {showOptInWarning && (
        <div style={{
          background: 'rgba(245,158,11,0.1)',
          border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <AlertTriangle size={18} style={{ color: '#f59e0b', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', color: theme.textSecondary }}>
            {optedOutCustomers.length} customers have marketing_opt_in disabled. They will not receive campaign emails.
          </span>
        </div>
      )}

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', fontWeight: '700', color: theme.accent }}>{ccContactMap.length}</div>
          <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>Total Contacts</div>
        </div>
        <div style={{ background: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', fontWeight: '700', color: theme.accent }}>{customerContacts.length}</div>
          <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>Customers</div>
        </div>
        <div style={{ background: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', fontWeight: '700', color: theme.accent }}>{leadContacts.length}</div>
          <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>Leads</div>
        </div>
        <div style={{ background: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', fontWeight: '700', color: theme.accent }}>{unsubscribed.length}</div>
          <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>Unsubscribed</div>
        </div>
      </div>

      {/* Search & Filter */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search
            size={18}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: theme.textMuted
            }}
          />
          <input
            type="text"
            placeholder="Search contacts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ ...inputStyle, paddingLeft: '38px' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
                border: filter === f.value ? 'none' : `1px solid ${theme.border}`,
                background: filter === f.value ? theme.accent : 'transparent',
                color: filter === f.value ? '#fff' : theme.textSecondary,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contacts Table */}
      <div style={{
        background: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        overflow: 'hidden'
      }}>
        {filteredContacts.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <Users size={40} style={{ color: theme.textMuted, marginBottom: '12px' }} />
            <p style={{ color: theme.textSecondary }}>
              {ccContactMap.length === 0
                ? 'No contacts synced yet. Click "Sync Now" to import your contacts.'
                : 'No contacts match your search.'}
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Name</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Source</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>CC Status</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Synced</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.map(contact => {
                const name = contact.customer?.name || contact.lead?.customer_name || '--'
                const source = contact.customer_id ? 'Customer' : 'Lead'
                const sourceColor = contact.customer_id
                  ? { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6' }
                  : { bg: 'rgba(139,92,246,0.15)', text: '#8b5cf6' }
                const sc = syncStatusColors[contact.sync_status] || syncStatusColors.synced

                return (
                  <tr key={contact.id}>
                    <td style={{ padding: '12px', fontSize: '14px', color: theme.text, borderBottom: `1px solid ${theme.border}`, fontWeight: '500' }}>
                      {name}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>
                      {contact.email}
                    </td>
                    <td style={{ padding: '12px', borderBottom: `1px solid ${theme.border}` }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600',
                        backgroundColor: sourceColor.bg,
                        color: sourceColor.text
                      }}>
                        {source}
                      </span>
                    </td>
                    <td style={{ padding: '12px', borderBottom: `1px solid ${theme.border}` }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600',
                        backgroundColor: sc.bg,
                        color: sc.text
                      }}>
                        {contact.sync_status}
                      </span>
                    </td>
                    <td style={{ padding: '12px', fontSize: '13px', color: theme.textMuted, borderBottom: `1px solid ${theme.border}` }}>
                      {contact.synced_at ? new Date(contact.synced_at).toLocaleDateString() : '--'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Inline animation for sync spinner */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
