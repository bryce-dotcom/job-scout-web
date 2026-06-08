import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { useIsMobile } from '../hooks/useIsMobile'
import { Calendar, AlertCircle, Wrench, FileText, Clock } from 'lucide-react'

// Upcoming Services — service visits (warranty / annual / tune-up / etc.)
// whose service_due_date falls in the next N days. Lets ops staff actually
// see what's coming up so they can call the customer to schedule, rather
// than discovering it the day-of.

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const KIND_COLOR = {
  annual: '#22c55e', warranty: '#dc2626', tune_up: '#0ea5e9',
  repair: '#f97316', upsell: '#a855f7', callback: '#6b7280',
}
const WINDOWS = [
  { id: '30', label: 'Next 30 days', days: 30 },
  { id: '60', label: 'Next 60 days', days: 60 },
  { id: '90', label: 'Next 90 days', days: 90 },
  { id: '180', label: 'Next 6 months', days: 180 },
  { id: 'overdue', label: 'Overdue', days: -1 },
]

export default function UpcomingServices() {
  const navigate = useNavigate()
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()
  const companyId = useStore(s => s.companyId)

  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [windowId, setWindowId] = useState('60')
  const [kindFilter, setKindFilter] = useState('all')

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('jobs')
        .select('id, job_id, job_title, status, service_kind, service_due_date, parts_coverage, labor_coverage, parent_job_id, customer_name, business_name, business_unit, salesperson, completed_at')
        .eq('company_id', companyId)
        .not('service_due_date', 'is', null)
        .order('service_due_date', { ascending: true })
        .limit(500)
      if (cancelled) return
      setServices(data || [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [companyId])

  const filtered = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const win = WINDOWS.find(w => w.id === windowId)
    return services.filter(s => {
      if (kindFilter !== 'all' && s.service_kind !== kindFilter) return false
      if (!s.service_due_date) return false
      // Exclude visits already done.
      if (['Completed', 'Verified Complete', 'Paid', 'Closed', 'Archived'].includes(s.status)) return false
      const due = new Date(s.service_due_date)
      const daysUntil = Math.floor((due - today) / 86400000)
      if (win.id === 'overdue') return daysUntil < 0
      return daysUntil >= 0 && daysUntil <= win.days
    })
  }, [services, windowId, kindFilter])

  const kindCounts = useMemo(() => {
    const counts = {}
    for (const s of services) counts[s.service_kind || 'other'] = (counts[s.service_kind || 'other'] || 0) + 1
    return counts
  }, [services])

  const daysUntil = (dateStr) => {
    if (!dateStr) return null
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return Math.floor((new Date(dateStr) - today) / 86400000)
  }

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Intro card */}
      <div style={{
        marginBottom: '20px', padding: '16px 20px',
        backgroundColor: 'rgba(90, 99, 73, 0.06)',
        border: `1px solid ${theme.border}`, borderRadius: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <Wrench size={18} style={{ color: theme.accent }} />
          <h1 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: theme.text }}>
            Upcoming Services
          </h1>
        </div>
        <p style={{ margin: '0 0 4px', fontSize: '13px', color: theme.textSecondary, lineHeight: 1.5 }}>
          Service visits coming due based on the date set when the visit was created (typically 1 year from the
          original install). <strong>Call the customer 30–60 days before the due date</strong> to schedule the work.
        </p>
        <p style={{ margin: 0, fontSize: '12px', color: theme.textMuted, lineHeight: 1.5 }}>
          Once you schedule a visit, set its start_date on the Job page and it'll move out of this list into the calendar.
        </p>
      </div>

      {/* Window + kind filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        {WINDOWS.map(w => (
          <button key={w.id} onClick={() => setWindowId(w.id)} style={{
            padding: '8px 14px', borderRadius: '8px', border: `1px solid ${theme.border}`,
            backgroundColor: windowId === w.id ? theme.accent : theme.bgCard,
            color: windowId === w.id ? '#fff' : theme.text, fontSize: '13px',
            fontWeight: windowId === w.id ? 600 : 500, cursor: 'pointer',
          }}>
            {w.label}
          </button>
        ))}
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} style={{
          padding: '8px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`,
          backgroundColor: theme.bgCard, color: theme.text, fontSize: '13px',
        }}>
          <option value="all">All types</option>
          {['annual', 'warranty', 'tune_up', 'repair', 'upsell', 'callback'].map(k => (
            <option key={k} value={k}>{k.replace(/_/g, ' ')} ({kindCounts[k] || 0})</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p style={{ color: theme.textMuted, fontSize: '14px', textAlign: 'center', padding: '40px' }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <div style={{ ...{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px' }, padding: '40px 20px', textAlign: 'center' }}>
          <Calendar size={32} style={{ color: theme.textMuted, opacity: 0.4, marginBottom: '10px' }} />
          <h3 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 600, color: theme.text }}>
            Nothing due in this window
          </h3>
          <p style={{ margin: 0, fontSize: '13px', color: theme.textMuted }}>
            Pick a wider window above, or add a service visit from any Job Detail page.
          </p>
        </div>
      ) : (
        <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${theme.border}`, backgroundColor: theme.bg }}>
                  {['Due', 'Days', 'Customer', 'Type', 'Title', 'Status'].map(h => (
                    <th key={h} style={{
                      padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 600,
                      color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const days = daysUntil(s.service_due_date)
                  const color = KIND_COLOR[s.service_kind] || theme.textMuted
                  const isOverdue = days != null && days < 0
                  const isSoon = days != null && days >= 0 && days <= 30
                  return (
                    <tr key={s.id} onClick={() => navigate(`/jobs/${s.id}`)} style={{
                      borderBottom: `1px solid ${theme.border}`, cursor: 'pointer',
                    }}>
                      <td style={{ padding: '10px 12px', color: theme.text, whiteSpace: 'nowrap' }}>
                        {new Date(s.service_due_date).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                          backgroundColor: isOverdue ? 'rgba(220,38,38,0.12)' : isSoon ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.10)',
                          color: isOverdue ? '#dc2626' : isSoon ? '#d97706' : '#16a34a', fontWeight: 600,
                        }}>
                          {isOverdue ? `${Math.abs(days)}d overdue` : `${days}d`}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: theme.text }}>
                        {s.business_name || s.customer_name || '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                          backgroundColor: color + '22', color, fontWeight: 500, textTransform: 'capitalize',
                        }}>
                          {(s.service_kind || 'service').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: theme.text }}>
                        {s.job_title || s.job_id || '—'}
                      </td>
                      <td style={{ padding: '10px 12px', color: theme.textMuted }}>
                        {s.status || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
