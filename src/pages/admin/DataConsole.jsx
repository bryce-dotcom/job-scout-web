import { useState, useEffect } from 'react'
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useStore } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import {
  LayoutDashboard, MessageSquare, Building2, Users, Zap, Bot,
  Package, Database, Upload, Terminal, ScrollText, Settings, Sparkles,
  ArrowLeft
} from 'lucide-react'

// Sub-pages
import DataConsoleDashboard from './DataConsoleDashboard'
import DataConsoleCompanies from './DataConsoleCompanies'
import DataConsoleUsers from './DataConsoleUsers'
import DataConsoleUtilities from './DataConsoleUtilities'
import DataConsoleProducts from './DataConsoleProducts'
import DataConsoleAgents from './DataConsoleAgents'

// Placeholder for remaining Phase 3+ pages
const Placeholder = ({ title }) => (
  <div style={{ color: '#888', padding: '40px', textAlign: 'center' }}>
    <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚧</div>
    <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>{title}</div>
    <div>Coming in Phase 3...</div>
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
  const isDeveloper = useStore((state) => state.isDeveloper)
  const checkDeveloperStatus = useStore((state) => state.checkDeveloperStatus)

  const [loading, setLoading] = useState(true)
  const [feedbackCount, setFeedbackCount] = useState(0)

  useEffect(() => {
    const init = async () => {
      await checkDeveloperStatus?.()
      await fetchFeedbackCount()
      setLoading(false)
    }
    init()
  }, [])

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
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: theme.bg }}>
      {/* Sidebar */}
      <div style={{
        width: '240px',
        backgroundColor: theme.bgCard,
        borderRight: `1px solid ${theme.border}`,
        display: 'flex',
        flexDirection: 'column'
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

        {/* Navigation */}
        <nav style={{ padding: '12px 8px', flex: 1, overflowY: 'auto' }}>
          {navItems.map(item => {
            const isActive = location.pathname === `/admin/data-console${item.path ? '/' + item.path : ''}`
            return (
              <NavLink
                key={item.path}
                to={`/admin/data-console${item.path ? '/' + item.path : ''}`}
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
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <Routes>
          <Route index element={<DataConsoleDashboard theme={theme} />} />
          <Route path="feedback" element={<Placeholder title="Feedback" />} />
          <Route path="companies" element={<DataConsoleCompanies />} />
          <Route path="users" element={<DataConsoleUsers />} />
          <Route path="utilities" element={<DataConsoleUtilities />} />
          <Route path="agents" element={<DataConsoleAgents />} />
          <Route path="products" element={<DataConsoleProducts />} />
          <Route path="browser" element={<Placeholder title="Data Browser" />} />
          <Route path="bulk-ops" element={<Placeholder title="Bulk Ops" />} />
          <Route path="sql" element={<Placeholder title="SQL Runner" />} />
          <Route path="audit-log" element={<Placeholder title="Audit Log" />} />
          <Route path="system" element={<Placeholder title="System" />} />
          <Route path="ai-assist" element={<Placeholder title="AI Assistant" />} />
        </Routes>
      </div>
    </div>
  )
}
