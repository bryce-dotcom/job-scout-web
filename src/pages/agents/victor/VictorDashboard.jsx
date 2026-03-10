import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import {
  Shield, Camera, CheckCircle2, AlertTriangle, TrendingUp,
  Star, ChevronRight, RefreshCw, Plus
} from 'lucide-react'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)'
}

const gradeColors = {
  'A': '#22c55e', 'B': '#3b82f6', 'C': '#f59e0b', 'D': '#f97316', 'F': '#ef4444'
}

export default function VictorDashboard() {
  const navigate = useNavigate()
  const companyId = useStore(s => s.companyId)
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, avgScore: 0, passRate: 0, pending: 0 })

  useEffect(() => {
    if (!companyId) return
    fetchReports()
  }, [companyId])

  const fetchReports = async () => {
    setLoading(true)

    // Fetch all reports for accurate stats
    const { data: allData } = await supabase
      .from('verification_reports')
      .select('id, status, score, grade, created_at')
      .eq('company_id', companyId)

    const all = allData || []
    const completed = all.filter(r => r.status === 'complete')
    const scores = completed.map(r => r.score).filter(Boolean)
    setStats({
      total: all.length,
      avgScore: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      passRate: scores.length > 0 ? Math.round(scores.filter(s => s >= 70).length / scores.length * 100) : 0,
      pending: all.filter(r => r.status === 'pending').length
    })

    // Fetch recent 20 with full joins for the list
    const { data } = await supabase
      .from('verification_reports')
      .select('*, job:jobs!job_id(id, job_id, job_title, customer_name), verifier:employees!verified_by(id, name)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(20)

    setReports(data || [])
    setLoading(false)
  }

  const statCards = [
    { label: 'Total Verifications', value: stats.total, icon: Shield, color: '#3b82f6' },
    { label: 'Average Score', value: stats.avgScore || '—', icon: Star, color: '#f59e0b' },
    { label: 'Pass Rate', value: stats.passRate ? `${stats.passRate}%` : '—', icon: TrendingUp, color: '#22c55e' },
    { label: 'Pending', value: stats.pending, icon: AlertTriangle, color: '#f97316' },
  ]

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>Victor Dashboard</h1>
          <p style={{ fontSize: '14px', color: theme.textMuted, marginTop: '4px' }}>AI-powered field verification & quality control</p>
        </div>
        <button
          onClick={() => navigate('/agents/victor/verify')}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 20px', backgroundColor: theme.accent, color: '#fff',
            border: 'none', borderRadius: '8px', cursor: 'pointer',
            fontWeight: '600', fontSize: '14px'
          }}
        >
          <Plus size={16} /> New Verification
        </button>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {statCards.map(card => (
          <div key={card.label} style={{
            backgroundColor: theme.bgCard, borderRadius: '12px',
            border: `1px solid ${theme.border}`, padding: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', color: theme.textMuted }}>{card.label}</span>
              <card.icon size={18} style={{ color: card.color }} />
            </div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: theme.text }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Recent Verifications */}
      <div style={{
        backgroundColor: theme.bgCard, borderRadius: '12px',
        border: `1px solid ${theme.border}`, overflow: 'hidden'
      }}>
        <div style={{
          padding: '16px 20px', borderBottom: `1px solid ${theme.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <span style={{ fontWeight: '600', fontSize: '16px', color: theme.text }}>Recent Verifications</span>
          <button onClick={fetchReports} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
            <RefreshCw size={16} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>Loading...</div>
        ) : reports.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <Camera size={40} style={{ color: theme.textMuted, margin: '0 auto 12px' }} />
            <p style={{ color: theme.textMuted, fontSize: '14px' }}>No verifications yet</p>
            <button
              onClick={() => navigate('/agents/victor/verify')}
              style={{
                marginTop: '12px', padding: '8px 16px', backgroundColor: theme.accent,
                color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px'
              }}
            >
              Start First Verification
            </button>
          </div>
        ) : (
          <div>
            {reports.map(report => (
              <div
                key={report.id}
                onClick={() => navigate(`/agents/victor/report/${report.id}`)}
                style={{
                  padding: '14px 20px', borderBottom: `1px solid ${theme.border}`,
                  display: 'flex', alignItems: 'center', gap: '16px',
                  cursor: 'pointer', transition: 'background-color 0.15s'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = theme.accentBg}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {/* Score */}
                <div style={{
                  width: '48px', height: '48px', borderRadius: '12px',
                  backgroundColor: report.grade ? `${gradeColors[report.grade]}15` : theme.accentBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: '700', fontSize: '18px',
                  color: report.grade ? gradeColors[report.grade] : theme.textMuted
                }}>
                  {report.grade || '—'}
                </div>

                {/* Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '600', fontSize: '14px', color: theme.text }}>
                    {report.job?.job_title || `Job #${report.job?.job_id || report.job_id}`}
                  </div>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                    {report.verifier?.name || 'Unknown'} · {new Date(report.created_at).toLocaleDateString()}
                    {report.score && ` · Score: ${report.score}/100`}
                  </div>
                </div>

                {/* Status */}
                <div style={{
                  padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600',
                  backgroundColor: report.status === 'complete' ? '#dcfce7' : report.status === 'analyzing' ? '#dbeafe' : '#fef3c7',
                  color: report.status === 'complete' ? '#16a34a' : report.status === 'analyzing' ? '#2563eb' : '#d97706'
                }}>
                  {report.status === 'complete' ? 'Complete' : report.status === 'analyzing' ? 'Analyzing' : 'Pending'}
                </div>

                <ChevronRight size={16} style={{ color: theme.textMuted }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
