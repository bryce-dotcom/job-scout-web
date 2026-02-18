import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { ClipboardList, Search, Plus, Zap, DollarSign, TrendingDown, User } from 'lucide-react'

// Light theme fallback
const defaultTheme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  bgCardHover: '#eef2eb',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)'
}

const statusColors = {
  'Draft': { bg: 'rgba(125,138,127,0.15)', text: '#7d8a7f' },
  'In Progress': { bg: 'rgba(90,99,73,0.15)', text: '#5a6349' },
  'Completed': { bg: 'rgba(74,124,89,0.15)', text: '#4a7c59' },
  'Submitted': { bg: 'rgba(106,90,205,0.15)', text: '#6a5acd' },
  'Approved': { bg: 'rgba(74,124,89,0.15)', text: '#4a7c59' },
  'Rejected': { bg: 'rgba(194,90,90,0.15)', text: '#c25a5a' }
}

export default function LightingAudits() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const user = useStore((state) => state.user)
  const lightingAudits = useStore((state) => state.lightingAudits)
  const utilityProviders = useStore((state) => state.utilityProviders)
  const fetchLightingAudits = useStore((state) => state.fetchLightingAudits)

  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterProvider, setFilterProvider] = useState('all')
  const [showMyAudits, setShowMyAudits] = useState(false)

  // Theme with fallback
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchLightingAudits()
  }, [companyId, navigate, fetchLightingAudits])

  // Filter audits
  const filteredAudits = lightingAudits.filter(audit => {
    // Search filter
    const customerName = audit.customer?.name?.toLowerCase() || ''
    const auditId = audit.audit_id?.toLowerCase() || ''
    const address = `${audit.address || ''} ${audit.city || ''} ${audit.state || ''}`.toLowerCase()
    const searchLower = searchTerm.toLowerCase()

    if (searchTerm && !customerName.includes(searchLower) && !auditId.includes(searchLower) && !address.includes(searchLower)) {
      return false
    }

    // Status filter
    if (filterStatus !== 'all' && audit.status !== filterStatus) {
      return false
    }

    // Provider filter
    if (filterProvider !== 'all' && audit.utility_provider_id !== filterProvider) {
      return false
    }

    // My Audits filter
    if (showMyAudits && user?.email && audit.created_by !== user.email) {
      return false
    }

    return true
  })

  // Calculate stats
  const totalRebates = lightingAudits.reduce((sum, a) => sum + (a.estimated_rebate || 0), 0)
  const totalSavings = lightingAudits.reduce((sum, a) => sum + (a.annual_savings_dollars || 0), 0)

  const formatCurrency = (amount) => {
    if (!amount) return '$0'
    return '$' + parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <div className="page-padding audit-list-root" style={{ padding: '24px' }}>
      <style>{`
        @media (max-width: 768px) {
          .audit-list-filters { gap: 8px !important; }
          .audit-list-filters > * { min-width: 0 !important; flex: 1 1 100% !important; }
          .audit-list-filters input,
          .audit-list-filters select { width: 100% !important; font-size: 16px !important; }
          .audit-card-header { flex-direction: column !important; gap: 8px !important; }
          .audit-card-header > div:last-child { text-align: left !important; }
          .audit-list-new-btn { width: 100% !important; justify-content: center !important; min-height: 48px !important; border-radius: 10px !important; }
          .audit-card-stats { grid-template-columns: repeat(2, 1fr) !important; gap: 8px !important; }
        }
        @media (max-width: 480px) {
          .audit-list-root .stat-grid > div { padding: 12px !important; }
          .audit-list-root .stat-grid > div > div:last-child { font-size: 22px !important; }
          .audit-card-stats > div > div:first-child { font-size: 10px !important; }
          .audit-card-stats > div > div:last-child { font-size: 14px !important; font-weight: 600 !important; }
          .audit-list-root .audit-card { padding: 14px !important; }
        }
      `}</style>
      {/* Header */}
      <div className="page-header" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ClipboardList size={28} style={{ color: theme.accent }} />
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
            Lighting Audits
          </h1>
        </div>

        <button
          className="audit-list-new-btn"
          onClick={() => navigate('/lighting-audits/new')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 20px',
            backgroundColor: theme.accent,
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          <Plus size={18} />
          New Audit
        </button>
      </div>

      {/* Stats Cards */}
      <div className="stat-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{
          backgroundColor: theme.bgCard,
          padding: '20px',
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '4px'
          }}>
            <ClipboardList size={16} style={{ color: theme.textMuted }} />
            <span style={{ fontSize: '13px', color: theme.textMuted }}>Total Audits</span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: theme.text }}>
            {lightingAudits.length}
          </div>
        </div>

        <div style={{
          backgroundColor: theme.bgCard,
          padding: '20px',
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '4px'
          }}>
            <DollarSign size={16} style={{ color: theme.textMuted }} />
            <span style={{ fontSize: '13px', color: theme.textMuted }}>Est. Rebates</span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#4a7c59' }}>
            {formatCurrency(totalRebates)}
          </div>
        </div>

        <div style={{
          backgroundColor: theme.bgCard,
          padding: '20px',
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '4px'
          }}>
            <TrendingDown size={16} style={{ color: theme.textMuted }} />
            <span style={{ fontSize: '13px', color: theme.textMuted }}>Annual Savings</span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#c28b38' }}>
            {formatCurrency(totalSavings)}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="audit-list-filters" style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '20px',
        flexWrap: 'wrap'
      }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
          <Search size={18} style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: theme.textMuted
          }} />
          <input
            type="text"
            placeholder="Search by customer, address..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px 10px 40px',
              borderRadius: '8px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.bgCard,
              color: theme.text,
              fontSize: '14px'
            }}
          />
        </div>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            padding: '10px 12px',
            borderRadius: '8px',
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.bgCard,
            color: theme.text,
            fontSize: '14px',
            minWidth: '150px'
          }}
        >
          <option value="all">All Statuses</option>
          <option value="Draft">Draft</option>
          <option value="In Progress">In Progress</option>
          <option value="Completed">Completed</option>
          <option value="Submitted">Submitted</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>

        <select
          value={filterProvider}
          onChange={(e) => setFilterProvider(e.target.value)}
          style={{
            padding: '10px 12px',
            borderRadius: '8px',
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.bgCard,
            color: theme.text,
            fontSize: '14px',
            minWidth: '180px'
          }}
        >
          <option value="all">All Providers</option>
          {utilityProviders.map(provider => (
            <option key={provider.id} value={provider.id}>
              {provider.provider_name}
            </option>
          ))}
        </select>

        <button
          onClick={() => setShowMyAudits(!showMyAudits)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 16px',
            borderRadius: '8px',
            border: `1px solid ${showMyAudits ? theme.accent : theme.border}`,
            backgroundColor: showMyAudits ? theme.accentBg : theme.bgCard,
            color: showMyAudits ? theme.accent : theme.textSecondary,
            fontSize: '14px',
            fontWeight: showMyAudits ? '600' : '400',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          <User size={16} />
          My Audits
        </button>
      </div>

      {/* Audits List */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        {filteredAudits.length === 0 ? (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            color: theme.textMuted,
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`
          }}>
            No lighting audits found. Click "New Audit" to create one.
          </div>
        ) : (
          filteredAudits.map(audit => {
            const statusStyle = statusColors[audit.status] || statusColors['Draft']

            return (
              <div
                key={audit.id}
                className="audit-card"
                onClick={() => navigate(`/lighting-audits/${audit.id}`)}
                style={{
                  backgroundColor: theme.bgCard,
                  borderRadius: '12px',
                  border: `1px solid ${theme.border}`,
                  padding: '20px',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = theme.bgCardHover}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = theme.bgCard}
              >
                <div className="audit-card-header" style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '12px'
                }}>
                  <div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '4px',
                      flexWrap: 'wrap'
                    }}>
                      <span style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: theme.text
                      }}>
                        {audit.customer?.name || 'No Customer'}
                      </span>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600',
                        backgroundColor: statusStyle.bg,
                        color: statusStyle.text
                      }}>
                        {audit.status || 'Draft'}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: theme.textMuted }}>
                      {audit.audit_id} · {audit.city}, {audit.state}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '12px', color: theme.textMuted }}>
                      {formatDate(audit.created_at)}
                    </div>
                    {audit.utility_provider && (
                      <div style={{
                        fontSize: '12px',
                        color: theme.accent,
                        marginTop: '4px'
                      }}>
                        {audit.utility_provider?.provider_name}
                      </div>
                    )}
                  </div>
                </div>

                <div className="audit-card-stats" style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                  gap: '16px',
                  paddingTop: '12px',
                  borderTop: `1px solid ${theme.border}`
                }}>
                  <div>
                    <div style={{ fontSize: '12px', color: theme.textMuted }}>Fixtures</div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: theme.text }}>
                      {audit.total_fixtures || 0}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: theme.textMuted }}>Watts Reduced</div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: theme.text }}>
                      {((audit.total_existing_watts || 0) - (audit.total_proposed_watts || 0)).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: theme.textMuted }}>Est. Rebate</div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#4a7c59' }}>
                      {formatCurrency(audit.estimated_rebate)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: theme.textMuted }}>Annual Savings</div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#c28b38' }}>
                      {formatCurrency(audit.annual_savings_dollars)}
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
