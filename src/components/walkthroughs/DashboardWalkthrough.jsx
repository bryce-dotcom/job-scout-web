// Dashboard walkthrough — KPI overview, job pipeline, revenue, AR aging, and action items.
// Source: src/lib/featureKnowledge/dashboard.js

import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, TrendingUp, TrendingDown, Briefcase, DollarSign,
  AlertTriangle, ArrowRight, Clock, CheckCircle, ChevronRight,
  BarChart2, Users, FileText,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/dashboard.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const MONTH_BARS = [
  { month: 'Jan', val: 142000 },
  { month: 'Feb', val: 158000 },
  { month: 'Mar', val: 131000 },
  { month: 'Apr', val: 174000 },
  { month: 'May', val: 163000 },
  { month: 'Jun', val: 187400, current: true },
]
const BAR_MAX = 200000

const RECENT_JOBS = [
  { id: 'JOB-041', name: 'Warehouse LED Retrofit',  customer: 'Apex Logistics',    tech: 'Marcus Webb',   value: 24500, status: 'In Progress' },
  { id: 'JOB-039', name: 'Office Lighting Upgrade', customer: 'Crestline Group',   tech: 'Doug Anderson', value: 18200, status: 'Scheduled'   },
  { id: 'JOB-037', name: 'Parking Lot Fixtures',    customer: 'Summit Properties', tech: 'Ryan Diaz',     value: 11800, status: 'Completed'   },
  { id: 'JOB-035', name: 'Exterior Canopy Lights',  customer: 'Harmon Foods',      tech: 'Marcus Webb',   value: 9400,  status: 'Completed'   },
  { id: 'JOB-033', name: 'Showroom Refit',          customer: 'Valley Auto Group', tech: 'Tracy Benson',  value: 15600, status: 'Scheduled'   },
]

const JOB_STATUS_COLORS = {
  'Scheduled':   { bg: 'rgba(59,130,246,0.12)',  text: '#3b82f6' },
  'In Progress': { bg: 'rgba(90,99,73,0.15)',    text: '#5a6349' },
  'Completed':   { bg: 'rgba(34,197,94,0.12)',   text: '#22c55e' },
}

const AR_ROWS = [
  { bucket: '0 – 30 days',  amount: 64000, invoices: 18, risk: false },
  { bucket: '31 – 60 days', amount: 48000, invoices: 11, risk: false },
  { bucket: '61 – 90 days', amount: 22000, invoices:  6, risk: true  },
  { bucket: '90+ days',     amount: 12500, invoices:  3, risk: true  },
]

const ACTION_ITEMS = [
  { icon: FileText,     color: '#ef4444', label: '3 invoices 60+ days past due',        sub: 'Oldest: INV-214 — $8,400 — 73 days' },
  { icon: AlertTriangle,color: '#eab308', label: 'Job #041 missing before photos',       sub: 'Required before scheduling final inspection' },
  { icon: Clock,        color: '#3b82f6', label: '2 estimates awaiting follow-up',       sub: 'EST-044 and EST-046 — sent 5+ days ago' },
  { icon: DollarSign,   color: '#a855f7', label: 'Payroll close in 2 days',              sub: 'Jun 13 cutoff — 4 timesheets need approval' },
  { icon: AlertTriangle,color: '#ef4444', label: 'Victor failed review — JOB-041',       sub: 'AI verification flagged 2 issues, needs manual review' },
]

export default function DashboardWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, sceneElapsed, setupIdx, setupShowingIntro,
    elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner

  return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: T.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && <Stage scene={sceneKey} />}
        <AnimatePresence mode="wait">
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <CenteredOverlay key="checklist">
              <SetupChecklist title={`Set it up in ${card.setup.steps.length} steps`} steps={card.setup.steps} currentIdx={setupIdx} />
            </CenteredOverlay>
          )}
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Numbers at a glance." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <LayoutDashboard size={15} style={{ color: T.accent }} />
        <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Dashboard</span>
        <span style={{ fontSize: '10px', color: T.textMuted, marginLeft: '4px' }}>June 2026</span>
      </div>

      {scene === 'kpis' && <SceneKPIs />}
      {scene === 'jobs' && <SceneJobs />}
      {scene === 'revenue' && <SceneRevenue />}
      {scene === 'ar' && <SceneAR />}
      {scene === 'actions' && <SceneActions />}
    </div>
  )
}

function SceneKPIs() {
  const kpis = [
    { label: 'Revenue MTD',    value: '$187,400', color: '#22c55e', Icon: TrendingUp,   trend: '+14%', trendUp: true  },
    { label: 'Open AR',        value: '$146,500', color: '#ef4444', Icon: TrendingDown, trend: '+8%',  trendUp: false },
    { label: 'Active Jobs',    value: '23',       color: T.accent,  Icon: Briefcase,    trend: '+3',   trendUp: true  },
    { label: 'Avg Job Value',  value: '$8,150',   color: '#3b82f6', Icon: BarChart2,    trend: '+5%',  trendUp: true  },
  ]
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', flexShrink: 0 }}>
        {kpis.map((k, i) => (
          <motion.div key={k.label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '12px 11px', borderTop: `3px solid ${k.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '9px', color: T.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.label}</span>
              <k.Icon size={12} style={{ color: k.color }} />
            </div>
            <div style={{ fontSize: '17px', fontWeight: '800', color: k.color, lineHeight: 1, marginBottom: '5px' }}>{k.value}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              {k.trendUp
                ? <TrendingUp size={9} style={{ color: '#22c55e' }} />
                : <TrendingDown size={9} style={{ color: '#ef4444' }} />}
              <span style={{ fontSize: '9px', color: k.trendUp ? '#22c55e' : '#ef4444', fontWeight: '600' }}>{k.trend} vs last month</span>
            </div>
          </motion.div>
        ))}
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', overflow: 'hidden' }}>
        <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '10px 12px', overflow: 'hidden' }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: T.text, marginBottom: '8px' }}>Jobs by Status</div>
          {[{ label: 'Scheduled', count: 8, color: '#3b82f6', pct: 35 }, { label: 'In Progress', count: 9, color: T.accent, pct: 39 }, { label: 'Completed', count: 6, color: '#22c55e', pct: 26 }].map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.07 }}
              style={{ marginBottom: '7px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', fontSize: '9px' }}>
                <span style={{ color: T.textSecondary }}>{s.label}</span>
                <span style={{ fontWeight: '700', color: s.color }}>{s.count}</span>
              </div>
              <div style={{ height: '6px', backgroundColor: T.border, borderRadius: '3px', overflow: 'hidden' }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${s.pct}%` }} transition={{ duration: 0.5, delay: 0.2 + i * 0.07 }}
                  style={{ height: '100%', backgroundColor: s.color, borderRadius: '3px' }} />
              </div>
            </motion.div>
          ))}
        </div>

        <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '10px 12px', overflow: 'hidden' }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: T.text, marginBottom: '7px' }}>Action Items</div>
          {ACTION_ITEMS.slice(0, 3).map((a, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.07 }}
              style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 0', borderBottom: `1px solid ${T.border}` }}>
              <a.icon size={10} style={{ color: a.color, flexShrink: 0 }} />
              <span style={{ fontSize: '9px', color: T.textSecondary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</span>
              <ChevronRight size={9} style={{ color: T.textMuted, flexShrink: 0 }} />
            </motion.div>
          ))}
          <div style={{ marginTop: '5px', fontSize: '9px', color: T.accent, fontWeight: '600', cursor: 'pointer' }}>+ 2 more items</div>
        </div>
      </div>
    </div>
  )
}

function SceneJobs() {
  const pipeline = [
    { label: 'Scheduled',   count: 8, color: '#3b82f6', pct: 35 },
    { label: 'In Progress', count: 9, color: T.accent,   pct: 39 },
    { label: 'Completed',   count: 6, color: '#22c55e',  pct: 26 },
  ]
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', flexShrink: 0 }}>
        {pipeline.map((p, i) => (
          <motion.div key={p.label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '10px 12px', borderLeft: `3px solid ${p.color}` }}>
            <div style={{ fontSize: '20px', fontWeight: '800', color: p.color, lineHeight: 1 }}>{p.count}</div>
            <div style={{ fontSize: '9px', color: T.textMuted, marginTop: '3px' }}>{p.label}</div>
            <div style={{ marginTop: '6px', height: '5px', backgroundColor: T.border, borderRadius: '3px', overflow: 'hidden' }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${p.pct}%` }} transition={{ duration: 0.5, delay: 0.15 + i * 0.06 }}
                style={{ height: '100%', backgroundColor: p.color, borderRadius: '3px' }} />
            </div>
          </motion.div>
        ))}
      </div>

      <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ padding: '7px 12px', borderBottom: `1px solid ${T.border}`, fontSize: '10px', fontWeight: '700', color: T.text }}>Recent Jobs</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
          <thead>
            <tr style={{ backgroundColor: T.accentBg }}>
              {['Job', 'Customer', 'Assigned To', 'Value', 'Status'].map(h => (
                <th key={h} style={{ padding: '5px 10px', textAlign: h === 'Value' ? 'right' : 'left', fontSize: '9px', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RECENT_JOBS.map((j, i) => {
              const sc = JOB_STATUS_COLORS[j.status] || JOB_STATUS_COLORS['Scheduled']
              return (
                <motion.tr key={j.id} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.06 }}
                  style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: '6px 10px' }}>
                    <div style={{ fontWeight: '600', color: T.text }}>{j.id}</div>
                    <div style={{ fontSize: '8px', color: T.textMuted, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.name}</div>
                  </td>
                  <td style={{ padding: '6px 10px', color: T.textSecondary }}>{j.customer}</td>
                  <td style={{ padding: '6px 10px', color: T.textSecondary }}>{j.tech}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '700', color: T.text }}>${j.value.toLocaleString()}</td>
                  <td style={{ padding: '6px 10px' }}>
                    <span style={{ padding: '2px 7px', borderRadius: '8px', fontSize: '8px', fontWeight: '600', backgroundColor: sc.bg, color: sc.text }}>{j.status}</span>
                  </td>
                </motion.tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SceneRevenue() {
  const maxH = 90
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'hidden' }}>
      <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '12px', overflow: 'hidden' }}>
        <div style={{ fontSize: '10px', fontWeight: '700', color: T.text, marginBottom: '10px' }}>Revenue — Jan through Jun 2026</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: `${maxH}px` }}>
          {MONTH_BARS.map((b, i) => {
            const h = Math.round((b.val / BAR_MAX) * maxH)
            return (
              <div key={b.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: '8px', color: b.current ? T.accent : T.textMuted, fontWeight: b.current ? '700' : '400' }}>
                  ${Math.round(b.val / 1000)}k
                </span>
                <motion.div initial={{ height: 0 }} animate={{ height: h }} transition={{ duration: 0.5, delay: i * 0.07 }}
                  style={{ width: '100%', backgroundColor: b.current ? T.accent : '#c5cdb8', borderRadius: '4px 4px 0 0', outline: b.current ? `2px solid ${T.accent}` : 'none', outlineOffset: '1px' }} />
                <span style={{ fontSize: '8px', color: b.current ? T.accent : T.textMuted, fontWeight: b.current ? '700' : '400' }}>{b.month}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', flexShrink: 0 }}>
        {[
          { label: 'This Month (Jun)', value: '$187,400', color: T.accent,   delta: '+14.9%', up: true  },
          { label: 'Last Month (May)', value: '$163,200', color: T.textMuted, delta: '',       up: null  },
        ].map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 + i * 0.07 }}
            style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '10px 12px' }}>
            <div style={{ fontSize: '9px', color: T.textMuted, marginBottom: '4px' }}>{c.label}</div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: c.color }}>{c.value}</div>
            {c.delta && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '3px' }}>
                <TrendingUp size={9} style={{ color: '#22c55e' }} />
                <span style={{ fontSize: '9px', color: '#22c55e', fontWeight: '600' }}>{c.delta} vs May</span>
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function SceneAR() {
  const total = AR_ROWS.reduce((s, r) => s + r.amount, 0)
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', flexShrink: 0 }}>
        {AR_ROWS.map((r, i) => (
          <motion.div key={r.bucket} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            style={{ backgroundColor: T.bgCard, border: `1px solid ${r.risk ? 'rgba(239,68,68,0.35)' : T.border}`, borderRadius: '9px', padding: '10px 11px', borderTop: `3px solid ${r.risk ? '#ef4444' : T.accent}` }}>
            <div style={{ fontSize: '14px', fontWeight: '800', color: r.risk ? '#ef4444' : T.text }}>${Math.round(r.amount / 1000)}k</div>
            <div style={{ fontSize: '8px', color: T.textMuted, marginTop: '2px', marginBottom: '4px' }}>{r.bucket}</div>
            <div style={{ fontSize: '8px', color: r.risk ? '#ef4444' : T.textSecondary, fontWeight: r.risk ? '600' : '400' }}>{r.invoices} invoices</div>
          </motion.div>
        ))}
      </div>

      <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '10px', fontWeight: '700', color: T.text }}>AR Aging Detail</span>
          <span style={{ fontSize: '10px', fontWeight: '800', color: T.text }}>Total: ${(total / 1000).toFixed(1)}k</span>
        </div>
        {AR_ROWS.map((r, i) => {
          const pct = Math.round((r.amount / total) * 100)
          return (
            <motion.div key={r.bucket} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.08 }}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 12px', borderBottom: `1px solid ${T.border}`, backgroundColor: r.risk ? 'rgba(239,68,68,0.03)' : 'transparent' }}>
              <div style={{ width: '90px', flexShrink: 0, fontSize: '9px', color: r.risk ? '#ef4444' : T.textSecondary, fontWeight: r.risk ? '600' : '400' }}>{r.bucket}</div>
              <div style={{ flex: 1, height: '7px', backgroundColor: T.border, borderRadius: '4px', overflow: 'hidden' }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5, delay: 0.2 + i * 0.08 }}
                  style={{ height: '100%', backgroundColor: r.risk ? '#ef4444' : T.accent, borderRadius: '4px' }} />
              </div>
              <div style={{ width: '36px', textAlign: 'right', fontSize: '9px', color: T.textMuted }}>{pct}%</div>
              <div style={{ width: '52px', textAlign: 'right', fontSize: '10px', fontWeight: '700', color: r.risk ? '#ef4444' : T.text }}>${(r.amount / 1000).toFixed(0)}k</div>
              <div style={{ width: '48px', textAlign: 'right', fontSize: '9px', color: T.textMuted }}>{r.invoices} inv.</div>
            </motion.div>
          )
        })}
        <div style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: 'rgba(239,68,68,0.05)', borderTop: `1px solid rgba(239,68,68,0.2)` }}>
          <AlertTriangle size={10} style={{ color: '#ef4444' }} />
          <span style={{ fontSize: '9px', color: '#ef4444', fontWeight: '600' }}>$34,500 (23%) is 61+ days past due — action needed</span>
        </div>
      </div>
    </div>
  )
}

function SceneActions() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'hidden' }}>
      <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden', flex: 1 }}>
        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle size={12} style={{ color: '#ef4444' }} />
            <span style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>Action Items</span>
          </div>
          <span style={{ padding: '2px 7px', borderRadius: '8px', fontSize: '8px', fontWeight: '700', backgroundColor: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>5 items</span>
        </div>
        {ACTION_ITEMS.map((a, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderBottom: `1px solid ${T.border}`, cursor: 'pointer' }}>
            <div style={{ width: '30px', height: '30px', borderRadius: '8px', backgroundColor: `${a.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <a.icon size={13} style={{ color: a.color }} />
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: '10px', fontWeight: '600', color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</div>
              <div style={{ fontSize: '8px', color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.sub}</div>
            </div>
            <div style={{ width: '26px', height: '26px', borderRadius: '6px', border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', backgroundColor: T.bg }}>
              <ArrowRight size={11} style={{ color: T.accent }} />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    kpis:    '1 · Top KPIs — Revenue MTD, Open AR, Active Jobs, Avg Job Value with trend arrows',
    jobs:    '2 · Job pipeline — Scheduled / In Progress / Completed with recent-jobs detail table',
    revenue: '3 · Revenue bar chart — Jan – Jun, current month highlighted, vs last month delta',
    ar:      '4 · AR aging — 0–30 / 31–60 / 61–90 / 90+ buckets, red alert on 61+ days overdue',
    actions: '5 · Action items — 5 flagged items with quick-action buttons to jump to the right page',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Dashboard works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
