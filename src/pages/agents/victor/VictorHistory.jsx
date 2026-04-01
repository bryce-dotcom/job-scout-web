import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { Search, ChevronRight, RefreshCw } from 'lucide-react'
import { useIsMobile } from '../../../hooks/useIsMobile'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)'
}
const gradeColors = { 'A': '#22c55e', 'B': '#3b82f6', 'C': '#f59e0b', 'D': '#f97316', 'F': '#ef4444' }

export default function VictorHistory() {
  const navigate = useNavigate()
  const companyId = useStore(s => s.companyId)
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()

  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [gradeFilter, setGradeFilter] = useState('all')

  useEffect(() => {
    if (!companyId) return
    fetchReports()
  }, [companyId])

  const fetchReports = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('verification_reports')
      .select('*, job:jobs!job_id(id, job_id, job_title, customer_name), verifier:employees!verified_by(id, name)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    setReports(data || [])
    setLoading(false)
  }

  const filtered = reports.filter(r => {
    if (gradeFilter !== 'all' && r.grade !== gradeFilter) return false
    if (search) {
      const s = search.toLowerCase()
      const match = (r.job?.job_title || '').toLowerCase().includes(s) ||
        (r.job?.customer_name || '').toLowerCase().includes(s) ||
        (r.verifier?.name || '').toLowerCase().includes(s)
      if (!match) return false
    }
    return true
  })

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '1000px', margin: '0 auto' }}>
      <h2 style={{ fontSize: isMobile ? '18px' : '20px', fontWeight: '700', color: theme.text, marginBottom: '16px' }}>Verification History</h2>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: theme.textMuted }} />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search jobs, customers..."
            style={{
              width: '100%', padding: '10px 12px 10px 36px', border: `1px solid ${theme.border}`,
              borderRadius: '8px', fontSize: '14px', color: theme.text, backgroundColor: theme.bgCard
            }}
          />
        </div>
        <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)} style={{
          padding: '10px 12px', border: `1px solid ${theme.border}`, borderRadius: '8px',
          fontSize: '14px', color: theme.text, backgroundColor: theme.bgCard
        }}>
          <option value="all">All Grades</option>
          {['A', 'B', 'C', 'D', 'F'].map(g => <option key={g} value={g}>Grade {g}</option>)}
        </select>
        <button onClick={fetchReports} style={{ padding: '10px', border: `1px solid ${theme.border}`, borderRadius: '8px', backgroundColor: theme.bgCard, cursor: 'pointer', color: theme.textMuted }}>
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Table */}
      <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>No verifications found</div>
        ) : (
          filtered.map(report => (
            <div
              key={report.id}
              onClick={() => navigate(`/agents/victor/report/${report.id}`)}
              style={{
                padding: isMobile ? '12px 14px' : '14px 20px', borderBottom: `1px solid ${theme.border}`,
                display: 'flex', alignItems: 'center', gap: isMobile ? '10px' : '16px',
                cursor: 'pointer', transition: 'background-color 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = theme.accentBg}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <div style={{
                width: '44px', height: '44px', borderRadius: '10px',
                backgroundColor: report.grade ? `${gradeColors[report.grade]}15` : theme.accentBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: '700', fontSize: '18px',
                color: report.grade ? gradeColors[report.grade] : theme.textMuted
              }}>
                {report.grade || '—'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '600', fontSize: '14px', color: theme.text }}>
                  {report.job?.job_title || `Job #${report.job?.job_id || report.job_id}`}
                </div>
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                  {report.verifier?.name || 'Unknown'} · {new Date(report.created_at).toLocaleDateString()}
                  {report.score != null && ` · ${report.score}/100`}
                  {report.industry && ` · ${report.industry}`}
                </div>
              </div>
              {!isMobile && <div style={{
                padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600',
                backgroundColor: report.status === 'complete' ? '#dcfce7' : '#fef3c7',
                color: report.status === 'complete' ? '#16a34a' : '#d97706'
              }}>
                {report.status === 'complete' ? 'Complete' : 'Pending'}
              </div>}
              <ChevronRight size={16} style={{ color: theme.textMuted, flexShrink: 0 }} />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
