import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { useIsMobile } from '../hooks/useIsMobile'
import { Repeat, Calendar, Wrench, ChevronRight, Users, Info } from 'lucide-react'

// Recurring Jobs — the "repeat engine" management surface. Lists every active
// recurring series (jobs with a recurrence set), one row per chain, so an owner
// can see everything that repeats in one place. The actual next-occurrence
// creation is handled by the DB trigger spawn_next_recurring_job on completion.
//
// Slice 2 will add a "Membership plans" tab here (a membership is a billed
// recurring service).

const REC = '#8b5cf6'
const REC_BG = 'rgba(139,92,246,0.12)'
const REC_DK = '#6b21a8'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const FREQ_LABEL = {
  Daily: 'Daily', Weekly: 'Weekly', 'Bi-Weekly': 'Every 2 weeks',
  'Every 6 Weeks': 'Every 6 weeks', Monthly: 'Monthly', 'Bi-Monthly': 'Every 2 months',
  Quarterly: 'Quarterly', 'Bi-Annually': 'Every 6 months', Annually: 'Yearly',
}
const TERMINAL = ['Completed', 'Job Complete', 'Verified Complete', 'Paid', 'Closed', 'Done', 'Cancelled', 'Archived']

function freqLabel(r) { return FREQ_LABEL[r] || r }
function fmtDate(d) {
  if (!d) return null
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return null
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export default function RecurringJobs() {
  const navigate = useNavigate()
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()
  const companyId = useStore(s => s.companyId)

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('jobs')
        .select('id, job_id, job_title, status, recurrence, recurrence_end_date, recurrence_landing, recurrence_parent_id, start_date, service_due_date, customer_name, business_name, business_unit')
        .eq('company_id', companyId)
        .not('recurrence', 'is', null)
        .neq('recurrence', 'None')
        .not('status', 'in', '("Archived")')
        .order('start_date', { ascending: true })
        .limit(1000)
      if (cancelled) return
      // Collapse to one row per chain (root). Prefer the open (non-terminal)
      // occurrence — that's the live "next" one — else keep the latest.
      const byRoot = new Map()
      ;(data || []).filter(j => j.recurrence && j.recurrence !== 'None').forEach(j => {
        const root = j.recurrence_parent_id || j.id
        const cur = byRoot.get(root)
        if (!cur) { byRoot.set(root, j); return }
        const jOpen = !TERMINAL.includes(j.status)
        const curOpen = !TERMINAL.includes(cur.status)
        if (jOpen && !curOpen) byRoot.set(root, j)
      })
      setRows([...byRoot.values()])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [companyId])

  const active = useMemo(() => rows.filter(r => !TERMINAL.includes(r.status)), [rows])

  const card = {
    background: theme.bgCard, border: `1px solid ${theme.border}`, borderLeft: `4px solid ${REC}`,
    borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
  }
  const pill = (bg, color) => ({ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: bg, color })

  return (
    <div style={{ padding: isMobile ? '16px' : '24px 28px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: REC_BG, color: REC, display: 'grid', placeItems: 'center', flex: 'none' }}>
          <Repeat size={22} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: theme.text }}>Recurring Jobs</h1>
          <div style={{ fontSize: 13.5, color: theme.textMuted }}>Everything that repeats — set the rhythm once, it re-creates itself.</div>
        </div>
      </div>

      {/* How it works */}
      <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: theme.accentBg, border: `1px solid ${theme.border}`, borderRadius: 12, padding: '11px 14px', margin: '14px 0 18px', fontSize: 13, color: theme.textSecondary }}>
        <Info size={16} style={{ color: theme.accent, marginTop: 1, flex: 'none' }} />
        <div>Make any job repeat from its <strong>Repeat</strong> panel (on the job or when you schedule it). When a recurring job is marked <strong>Completed</strong>, the next one is created automatically — same crew and scope, no re-entry.</div>
      </div>

      {loading ? (
        <div style={{ color: theme.textMuted, fontSize: 14, padding: '30px 0', textAlign: 'center' }}>Loading…</div>
      ) : active.length === 0 ? (
        // Empty state with guidance
        <div style={{ textAlign: 'center', padding: '40px 20px', border: `1.5px dashed ${theme.border}`, borderRadius: 16, background: theme.bgCard }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: REC_BG, color: REC, display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}>
            <Repeat size={26} />
          </div>
          <div style={{ fontWeight: 750, fontSize: 16, color: theme.text }}>No recurring jobs yet</div>
          <div style={{ fontSize: 13.5, color: theme.textMuted, maxWidth: 420, margin: '6px auto 16px', lineHeight: 1.5 }}>
            Turn a repeat rhythm on from any job's <strong>Repeat</strong> panel — weekly mowing, quarterly maintenance, an annual tune-up — and it'll show up here and re-create itself on schedule.
          </div>
          <button onClick={() => navigate('/jobs')} style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '11px 18px', fontWeight: 700, fontSize: 14, cursor: 'pointer', minHeight: 44 }}>
            Go to Jobs
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: theme.textMuted, fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: '.08em', textTransform: 'uppercase' }}>{active.length} active {active.length === 1 ? 'series' : 'series'}</div>
          {active.map(j => {
            const nextDate = fmtDate(j.start_date) || fmtDate(j.service_due_date)
            const toServices = j.recurrence_landing === 'services'
            return (
              <div key={j.id} style={card} onClick={() => navigate(`/jobs/${j.id}`)}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 14px -6px rgba(44,53,48,0.18)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                    <span style={pill(REC_BG, REC_DK)}><Repeat size={11} /> {freqLabel(j.recurrence)}</span>
                    <span style={pill(toServices ? theme.accentBg : 'rgba(59,130,246,0.12)', toServices ? theme.accent : '#2563eb')}>
                      {toServices ? <Wrench size={11} /> : <Calendar size={11} />} {toServices ? 'Services' : 'Job Board'}
                    </span>
                    {j.recurrence_end_date && (
                      <span style={{ fontSize: 11, color: theme.textMuted }}>ends {fmtDate(j.recurrence_end_date)}</span>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: theme.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {j.job_title || j.job_id || `Job #${j.id}`}
                  </div>
                  <div style={{ fontSize: 12.5, color: theme.textMuted, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 2 }}>
                    {(j.business_name || j.customer_name) && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Users size={12} /> {j.business_name || j.customer_name}</span>}
                    {nextDate && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Calendar size={12} /> next {nextDate}</span>}
                  </div>
                </div>
                <ChevronRight size={18} style={{ color: theme.textMuted, flex: 'none' }} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
