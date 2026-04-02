import { useState, useEffect } from 'react'
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useStore } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { canAccessDevTools } from '../../lib/accessControl'
import { useIsMobile } from '../../hooks/useIsMobile'
import {
  LayoutDashboard, MessageSquare, Building2, Users, Zap, Bot,
  Package, Database, Upload, Terminal, ScrollText, Settings, Sparkles,
  ArrowLeft, Menu, X, RefreshCw
} from 'lucide-react'

// Sub-pages
import DataConsoleDashboard from './DataConsoleDashboard'
import DataConsoleCompanies from './DataConsoleCompanies'
import DataConsoleUsers from './DataConsoleUsers'
import DataConsoleUtilities from './DataConsoleUtilities'
import DataConsoleProducts from './DataConsoleProducts'
import DataConsoleAgents from './DataConsoleAgents'
import DataConsoleBrowser from './DataConsoleBrowser'
import DataConsoleBulkOps from './DataConsoleBulkOps'
import DataConsoleSQL from './DataConsoleSQL'
import DataConsoleFeedback from './DataConsoleFeedback'
import DataConsoleAuditLog from './DataConsoleAuditLog'
import DataConsoleSystem from './DataConsoleSystem'

// Placeholder for AI Assistant (coming later)
const Placeholder = ({ title }) => (
  <div style={{ color: '#888', padding: '40px', textAlign: 'center' }}>
    <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚧</div>
    <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>{title}</div>
    <div>Coming soon...</div>
  </div>
)

const navItems = [
  { path: '', label: 'Dashboard', icon: LayoutDashboard },
  { path: 'feedback', label: 'Feedback', icon: MessageSquare, badge: true },
  { path: 'companies', label: 'Companies', icon: Building2 },
  { path: 'users', label: 'Users', icon: Users },
  { path: 'utilities', label: 'Utilities & Rebates', icon: Zap },
  { path: 'agents', label: 'AI Agents', icon: Bot },
  { path: 'products', label: 'Products Library', icon: Package },
  { path: 'browser', label: 'Data Browser', icon: Database },
  { path: 'bulk-ops', label: 'Bulk Ops', icon: Upload },
  { path: 'sql', label: 'SQL Runner', icon: Terminal },
  { path: 'audit-log', label: 'Audit Log', icon: ScrollText },
  { path: 'system', label: 'System', icon: Settings },
  { path: 'ai-assist', label: 'AI Assistant', icon: Sparkles },
]

const theme = {
  bg: '#0a0a0a',
  bgCard: '#141414',
  bgHover: '#1f1f1f',
  border: '#2a2a2a',
  text: '#ffffff',
  textMuted: '#888888',
  accent: '#f97316',
  accentBg: 'rgba(249, 115, 22, 0.15)',
  success: '#22c55e',
  warning: '#eab308',
  error: '#ef4444'
}

export { theme as dataConsoleTheme }

export default function DataConsole() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useStore((state) => state.user)
  const isDeveloper = canAccessDevTools(user)
  const checkDeveloperStatus = useStore((state) => state.checkDeveloperStatus)
  const company = useStore((state) => state.company)
  const setCompany = useStore((state) => state.setCompany)
  const setUser = useStore((state) => state.setUser)
  const fetchAllData = useStore((state) => state.fetchAllData)
  const isMobile = useIsMobile()

  const [loading, setLoading] = useState(true)
  const [feedbackCount, setFeedbackCount] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [allCompanies, setAllCompanies] = useState([])
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    const init = async () => {
      await checkDeveloperStatus?.()
      await fetchFeedbackCount()
      // Fetch all companies for the switcher
      const { data } = await supabase.from('companies').select('id, company_name, active').order('id')
      if (data) setAllCompanies(data)
      setLoading(false)
    }
    init()
  }, [])

  const switchCompany = async (companyId) => {
    const target = allCompanies.find(c => c.id === companyId)
    if (!target || target.id === company?.id) return
    setSwitching(true)
    // Fetch full company record
    const { data } = await supabase.from('companies').select('*').eq('id', companyId).single()
    if (data) {
      setCompany(data)
      // Switch user to matching employee in the new company
      const currentEmail = user?.email
      if (currentEmail) {
        const { data: emp } = await supabase
          .from('employees')
          .select('*')
          .eq('company_id', companyId)
          .ilike('email', currentEmail)
          .eq('active', true)
          .limit(1)
          .single()
        if (emp) setUser(emp)
      }
      await fetchAllData()
    }
    setSwitching(false)
  }

  useEffect(() => {
    if (!loading && !isDeveloper) {
      navigate('/dashboard')
    }
  }, [loading, isDeveloper, navigate])

  const fetchFeedbackCount = async () => {
    try {
      const { count } = await supabase
        .from('feedback')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'new')
      setFeedbackCount(count || 0)
    } catch (err) {
      // Table might not exist yet
      console.log('Feedback table not ready')
    }
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: theme.bg,
        color: theme.textMuted
      }}>
        Loading...
      </div>
    )
  }

  if (!isDeveloper) {
    return null
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: theme.bg, position: 'relative' }}>
      {/* Mobile Header Bar */}
      {isMobile && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '56px',
          backgroundColor: theme.bgCard,
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          zIndex: 1001
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => navigate('/dashboard')}
              style={{
                padding: '8px',
                backgroundColor: theme.bgHover,
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                color: theme.textMuted,
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <ArrowLeft size={16} />
            </button>
            <div style={{ color: theme.accent, fontWeight: '700', fontSize: '16px' }}>
              Data Console
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              padding: '8px',
              backgroundColor: theme.bgHover,
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              color: theme.textMuted,
              display: 'flex',
              alignItems: 'center'
            }}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      )}

      {/* Mobile Overlay */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 1002
          }}
        />
      )}

      {/* Sidebar */}
      <div style={{
        width: '240px',
        backgroundColor: theme.bgCard,
        borderRight: `1px solid ${theme.border}`,
        display: 'flex',
        flexDirection: 'column',
        ...(isMobile ? {
          position: 'fixed',
          top: 0,
          left: sidebarOpen ? 0 : '-260px',
          bottom: 0,
          zIndex: 1003,
          transition: 'left 0.25s ease',
          boxShadow: sidebarOpen ? '4px 0 20px rgba(0,0,0,0.3)' : 'none'
        } : {})
      }}>
        {/* Header */}
        <div style={{
          padding: '20px',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              padding: '8px',
              backgroundColor: theme.bgHover,
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              color: theme.textMuted,
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div style={{ color: theme.accent, fontWeight: '700', fontSize: '16px' }}>
              Data Console
            </div>
            <div style={{ color: theme.textMuted, fontSize: '11px' }}>
              Developer Only
            </div>
          </div>
        </div>

        {/* Company Switcher */}
        <div style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${theme.border}`,
        }}>
          <div style={{ color: theme.textMuted, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
            Viewing as
          </div>
          <select
            value={company?.id || ''}
            onChange={(e) => switchCompany(Number(e.target.value))}
            disabled={switching}
            style={{
              width: '100%',
              padding: '8px 10px',
              backgroundColor: theme.bgHover,
              color: theme.text,
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer',
              outline: 'none',
              opacity: switching ? 0.5 : 1,
            }}
          >
            {allCompanies.map(c => (
              <option key={c.id} value={c.id} style={{ backgroundColor: theme.bg }}>
                {c.company_name} (#{c.id}){!c.active ? ' [inactive]' : ''}
              </option>
            ))}
          </select>
          {switching && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', color: theme.accent, fontSize: '11px' }}>
              <RefreshCw size={12} className="animate-spin" />
              Loading company data...
            </div>
          )}
          <style>{`@keyframes spin { to { transform: rotate(360deg) } } .animate-spin { animation: spin 1s linear infinite; }`}</style>
        </div>

        {/* Navigation */}
        <nav style={{ padding: '12px 8px', flex: 1, overflowY: 'auto' }}>
          {navItems.map(item => {
            const isActive = location.pathname === `/admin/data-console${item.path ? '/' + item.path : ''}`
            return (
              <NavLink
                key={item.path}
                to={`/admin/data-console${item.path ? '/' + item.path : ''}`}
                onClick={() => isMobile && setSidebarOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  color: isActive ? theme.accent : theme.textMuted,
                  backgroundColor: isActive ? theme.accentBg : 'transparent',
                  textDecoration: 'none',
                  fontSize: '13px',
                  marginBottom: '2px',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = theme.bgHover
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <item.icon size={18} />
                {item.label}
                {item.badge && feedbackCount > 0 && (
                  <span style={{
                    marginLeft: 'auto',
                    backgroundColor: theme.accent,
                    color: '#fff',
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '10px',
                    fontWeight: '600'
                  }}>
                    {feedbackCount}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Footer */}
        <div style={{
          padding: '12px 16px',
          borderTop: `1px solid ${theme.border}`,
          fontSize: '11px',
          color: theme.textMuted
        }}>
          {user?.email}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', ...(isMobile ? { marginTop: '56px' } : {}) }}>
        <Routes>
          <Route index element={<DataConsoleDashboard theme={theme} />} />
          <Route path="feedback" element={<DataConsoleFeedback />} />
          <Route path="companies" element={<DataConsoleCompanies />} />
          <Route path="users" element={<DataConsoleUsers />} />
          <Route path="utilities" element={<DataConsoleUtilities />} />
          <Route path="agents" element={<DataConsoleAgents />} />
          <Route path="products" element={<DataConsoleProducts />} />
          <Route path="browser" element={<DataConsoleBrowser />} />
          <Route path="bulk-ops" element={<DataConsoleBulkOps />} />
          <Route path="sql" element={<DataConsoleSQL />} />
          <Route path="audit-log" element={<DataConsoleAuditLog />} />
          <Route path="system" element={<DataConsoleSystem />} />
          <Route path="ai-assist" element={<Placeholder title="AI Assistant" />} />
        </Routes>
      </div>
    </div>
  )
}
