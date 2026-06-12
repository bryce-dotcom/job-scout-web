import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useIsMobile } from '../../hooks/useIsMobile'
import {
  Building2, Users, Zap, Bot, Package, MessageSquare,
  TrendingUp, Clock, AlertCircle, CheckCircle, Database, Upload, Terminal
} from 'lucide-react'

export default function DataConsoleDashboard({ theme }) {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [stats, setStats] = useState({
    companies: 0,
    users: 0,
    utilityProviders: 0,
    utilityPrograms: 0,
    agents: 0,
    activeAgents: 0,
    products: 0,
    feedbackNew: 0,
    auditsThisMonth: 0,
    totalRecords: 0
  })
  const [recentActivity, setRecentActivity] = useState([])
  const [loading, setLoading] = useState(true)
  // AI usage metering (ai_usage table, fed by the shared edge-fn wrapper).
  // Answers "what is AI costing us / is anything failing" without leaving
  // the console — Tracy asked for a visible balance after the June 9-10
  // credit outage.
  const [aiUsage, setAiUsage] = useState(null)

  useEffect(() => {
    fetchStats()
    fetchRecentActivity()
    fetchAiUsage()
  }, [])

  const fetchAiUsage = async () => {
    try {
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
      const { data } = await supabase
        .from('ai_usage')
        .select('feature, est_cost_usd, success, error_kind, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(20000)
      if (!data) { setAiUsage({ rows: 0 }); return }
      const byFeature = {}
      let totalCost = 0
      let failures = 0
      let billing24h = 0
      const dayAgo = Date.now() - 24 * 3600 * 1000
      for (const r of data) {
        totalCost += parseFloat(r.est_cost_usd) || 0
        if (r.success === false) {
          failures++
          if ((r.error_kind === 'billing' || r.error_kind === 'auth') && new Date(r.created_at).getTime() > dayAgo) billing24h++
        }
        const f = byFeature[r.feature] || { calls: 0, cost: 0 }
        f.calls++
        f.cost += parseFloat(r.est_cost_usd) || 0
        byFeature[r.feature] = f
      }
      const topFeatures = Object.entries(byFeature)
        .map(([feature, v]) => ({ feature, ...v }))
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 8)
      setAiUsage({ rows: data.length, totalCost, failures, billing24h, topFeatures })
    } catch (err) {
      console.error('Error fetching ai usage:', err)
      setAiUsage({ rows: 0 })
    }
  }

  const fetchStats = async () => {
    try {
      const [
        companiesRes,
        usersRes,
        providersRes,
        programsRes,
        agentsRes,
        productsRes,
        feedbackRes,
        auditsRes
      ] = await Promise.all([
        supabase.from('companies').select('*', { count: 'exact', head: true }),
        supabase.from('employees').select('*', { count: 'exact', head: true }),
        supabase.from('utility_providers').select('*', { count: 'exact', head: true }),
        supabase.from('utility_programs').select('*', { count: 'exact', head: true }),
        supabase.from('agents').select('*', { count: 'exact', head: true }),
        supabase.from('products_services').select('*', { count: 'exact', head: true }),
        supabase.from('feedback').select('*', { count: 'exact', head: true }).eq('status', 'new'),
        supabase.from('lighting_audits').select('*', { count: 'exact', head: true })
          .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
      ])

      // Count active agents
      const { count: activeCount } = await supabase
        .from('agents')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')

      setStats({
        companies: companiesRes.count || 0,
        users: usersRes.count || 0,
        utilityProviders: providersRes.count || 0,
        utilityPrograms: programsRes.count || 0,
        agents: agentsRes.count || 0,
        activeAgents: activeCount || 0,
        products: productsRes.count || 0,
        feedbackNew: feedbackRes.count || 0,
        auditsThisMonth: auditsRes.count || 0,
        totalRecords: (companiesRes.count || 0) + (usersRes.count || 0) + (productsRes.count || 0)
      })
    } catch (err) {
      console.error('Error fetching stats:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchRecentActivity = async () => {
    try {
      // Get recent audit log entries if table exists
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10)

      if (!error && data) {
        setRecentActivity(data)
      }
    } catch (err) {
      // Table might not exist
    }
  }

  const StatCard = ({ icon: Icon, label, value, subValue, color, onClick }) => (
    <div
      onClick={onClick}
      style={{
        backgroundColor: theme.bgCard,
        border: `1px solid ${theme.border}`,
        borderRadius: '12px',
        padding: '20px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s ease'
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.borderColor = theme.accent
          e.currentTarget.style.transform = 'translateY(-2px)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = theme.border
        e.currentTarget.style.transform = 'none'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '8px' }}>
            {label}
          </div>
          <div style={{ color: theme.text, fontSize: '28px', fontWeight: '700' }}>
            {loading ? '...' : value}
          </div>
          {subValue && (
            <div style={{ color: color || theme.textMuted, fontSize: '12px', marginTop: '4px' }}>
              {subValue}
            </div>
          )}
        </div>
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '10px',
          backgroundColor: color ? `${color}20` : theme.accentBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Icon size={22} style={{ color: color || theme.accent }} />
        </div>
      </div>
    </div>
  )

  const formatTimeAgo = (dateStr) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = Math.floor((now - date) / 1000)

    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  return (
    <div style={{ padding: isMobile ? '16px' : '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: isMobile ? '16px' : '24px' }}>
        <h1 style={{ color: theme.text, fontSize: isMobile ? '20px' : '24px', fontWeight: '700', marginBottom: '4px' }}>
          Data Console
        </h1>
        <p style={{ color: theme.textMuted, fontSize: '14px' }}>
          System overview and quick stats
        </p>
      </div>

      {/* Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: isMobile ? '12px' : '16px',
        marginBottom: isMobile ? '16px' : '24px'
      }}>
        <StatCard
          icon={Building2}
          label="Companies"
          value={stats.companies}
          onClick={() => navigate('/admin/data-console/companies')}
        />
        <StatCard
          icon={Users}
          label="Users"
          value={stats.users}
          onClick={() => navigate('/admin/data-console/users')}
        />
        <StatCard
          icon={Zap}
          label="Utility Providers"
          value={stats.utilityProviders}
          subValue={`${stats.utilityPrograms} programs`}
          onClick={() => navigate('/admin/data-console/utilities')}
        />
        <StatCard
          icon={Bot}
          label="AI Agents"
          value={stats.agents}
          subValue={`${stats.activeAgents} active`}
          color="#22c55e"
          onClick={() => navigate('/admin/data-console/agents')}
        />
        <StatCard
          icon={Package}
          label="Products"
          value={stats.products}
          onClick={() => navigate('/admin/data-console/products')}
        />
        <StatCard
          icon={MessageSquare}
          label="New Feedback"
          value={stats.feedbackNew}
          color={stats.feedbackNew > 0 ? '#eab308' : undefined}
          onClick={() => navigate('/admin/data-console/feedback')}
        />
      </div>

      {/* Quick Stats Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '16px',
        marginBottom: isMobile ? '16px' : '24px'
      }}>
        <div style={{
          backgroundColor: theme.bgCard,
          border: `1px solid ${theme.border}`,
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <TrendingUp size={20} style={{ color: theme.accent }} />
            <span style={{ color: theme.text, fontWeight: '600' }}>This Month</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ color: theme.textMuted, fontSize: '12px' }}>Audits Created</div>
              <div style={{ color: theme.text, fontSize: '24px', fontWeight: '600' }}>
                {loading ? '...' : stats.auditsThisMonth}
              </div>
            </div>
          </div>
        </div>

        <div style={{
          backgroundColor: theme.bgCard,
          border: `1px solid ${theme.border}`,
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <Database size={20} style={{ color: theme.accent }} />
            <span style={{ color: theme.text, fontWeight: '600' }}>Database</span>
          </div>
          <div style={{ display: 'flex', gap: '24px' }}>
            <div>
              <div style={{ color: theme.textMuted, fontSize: '12px' }}>Total Records</div>
              <div style={{ color: theme.text, fontSize: '24px', fontWeight: '600' }}>
                {loading ? '...' : stats.totalRecords.toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ color: theme.textMuted, fontSize: '12px' }}>Status</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                <CheckCircle size={18} style={{ color: '#22c55e' }} />
                <span style={{ color: '#22c55e', fontWeight: '500' }}>Healthy</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{
        backgroundColor: theme.bgCard,
        border: `1px solid ${theme.border}`,
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '24px'
      }}>
        <h3 style={{ color: theme.text, fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
          Quick Actions
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          {[
            { label: 'Browse Data', icon: Database, path: '/admin/data-console/browser' },
            { label: 'Run SQL', icon: Terminal, path: '/admin/data-console/sql' },
            { label: 'Bulk Import', icon: Upload, path: '/admin/data-console/bulk-ops' },
            { label: 'View Audit Log', icon: Clock, path: '/admin/data-console/audit-log' },
            { label: 'AI Assistant', icon: Bot, path: '/admin/data-console/ai-assist' }
          ].map(action => (
            <button
              key={action.label}
              onClick={() => navigate(action.path)}
              style={{
                padding: '10px 16px',
                backgroundColor: theme.bgHover,
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                color: theme.text,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = theme.accent
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = theme.border
              }}
            >
              {typeof action.icon === 'string' ? action.icon : <action.icon size={16} />}
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* AI Usage — last 30 days (ai_usage table via the edge-fn wrapper) */}
      <div style={{
        backgroundColor: theme.bgCard,
        border: `1px solid ${theme.border}`,
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <h3 style={{ color: theme.text, fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bot size={18} style={{ color: theme.accent }} />
            AI Usage — Last 30 Days
          </h3>
          {aiUsage && aiUsage.rows > 0 && (
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: theme.text, fontSize: '14px', fontWeight: '700' }}>
                ${(aiUsage.totalCost || 0).toFixed(2)}
                <span style={{ color: theme.textMuted, fontWeight: '400', fontSize: '12px' }}> est. spend</span>
              </span>
              <span style={{ color: theme.textMuted, fontSize: '13px' }}>{aiUsage.rows.toLocaleString()} calls</span>
              <span style={{ color: aiUsage.failures > 0 ? theme.warning : theme.textMuted, fontSize: '13px' }}>
                {aiUsage.failures} failed
              </span>
            </div>
          )}
        </div>
        {aiUsage?.billing24h > 0 && (
          <div style={{
            padding: '10px 12px', marginBottom: '12px', borderRadius: '8px',
            backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
            color: theme.error, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px'
          }}>
            <AlertCircle size={16} />
            {aiUsage.billing24h} billing/key failure{aiUsage.billing24h === 1 ? '' : 's'} in the last 24h — check Anthropic credits (console.anthropic.com).
          </div>
        )}
        {!aiUsage || aiUsage.rows === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>
            No AI calls logged yet. Usage appears here as features run.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {aiUsage.topFeatures.map(f => (
              <div key={f.feature} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px', backgroundColor: theme.bgHover, borderRadius: '8px'
              }}>
                <span style={{ color: theme.text, fontSize: '13px', fontWeight: '500' }}>{f.feature}</span>
                <span style={{ color: theme.textMuted, fontSize: '13px' }}>
                  {f.calls.toLocaleString()} calls · ${f.cost.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div style={{
        backgroundColor: theme.bgCard,
        border: `1px solid ${theme.border}`,
        borderRadius: '12px',
        padding: '20px'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px'
        }}>
          <h3 style={{ color: theme.text, fontSize: '16px', fontWeight: '600' }}>
            Recent Activity
          </h3>
          <button
            onClick={() => navigate('/admin/data-console/audit-log')}
            style={{
              padding: '6px 12px',
              backgroundColor: 'transparent',
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              color: theme.textMuted,
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            View All
          </button>
        </div>

        {recentActivity.length === 0 ? (
          <div style={{
            padding: '32px',
            textAlign: 'center',
            color: theme.textMuted,
            fontSize: '14px'
          }}>
            No recent activity recorded.
            <br />
            <span style={{ fontSize: '12px' }}>
              Run the database migration to enable audit logging.
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {recentActivity.map(activity => (
              <div
                key={activity.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 12px',
                  backgroundColor: theme.bgHover,
                  borderRadius: '8px'
                }}
              >
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: activity.action === 'delete' ? theme.error :
                    activity.action === 'create' ? theme.success : theme.warning
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ color: theme.text, fontSize: '13px' }}>
                    {activity.action} on {activity.table_name}
                  </div>
                  <div style={{ color: theme.textMuted, fontSize: '11px' }}>
                    {activity.user_email}
                  </div>
                </div>
                <div style={{ color: theme.textMuted, fontSize: '11px' }}>
                  {formatTimeAgo(activity.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
