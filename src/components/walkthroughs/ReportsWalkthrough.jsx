// Reports walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/Reports.jsx — report type selector + financial/jobs/sales reports.
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import { BarChart3, DollarSign, Briefcase, TrendingUp, TrendingDown, ChevronRight } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/reports.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

// Report types from Reports.jsx lines 81-82
const REPORT_TYPES = [
  { id: 'sales',     label: 'Sales Report',     icon: TrendingUp,  desc: 'Pipeline conversion, rep performance, close rates' },
  { id: 'jobs',      label: 'Jobs Report',       icon: Briefcase,   desc: 'Job status, revenue, time tracking'                },
  { id: 'financial', label: 'Financial Report',  icon: DollarSign,  desc: 'Invoices, payments, revenue, expenses'             },
]

// Financial report stat cards (renderFinancialReport lines 384-397)
const FINANCIAL_STATS = [
  { label: 'Total Invoiced',   value: '$142,400', color: null      },
  { label: 'Total Collected',  value: '$118,200', color: '#4a7c59' },
  { label: 'Outstanding',      value: '$24,200',  color: '#c25a5a', drillable: true },
  { label: 'Total Expenses',   value: '$38,700',  color: '#c25a5a' },
  { label: 'Net Income',       value: '$79,500',  color: '#4a7c59' },
]

const MONTHLY_REVENUE = [
  { month: 'Jan', amount: 12400 }, { month: 'Feb', amount: 18200 },
  { month: 'Mar', amount: 24500 }, { month: 'Apr', amount: 31800 },
  { month: 'May', amount: 28600 }, { month: 'Jun', amount: 42700 },
]

// Sales report stats (renderSalesReport)
const SALES_STATS = [
  { label: 'Pipeline',   value: '$284k', color: null      },
  { label: 'Win Rate',   value: '42%',   color: '#4a7c59' },
  { label: 'Avg Deal',   value: '$18.2k',color: null      },
  { label: 'Active',     value: '12',    color: null      },
]

const REP_DATA = [
  { name: 'Doug A.',  deals: 6, won: 3, revenue: '$94.2k', rate: '50%' },
  { name: 'Tracy B.', deals: 4, won: 1, revenue: '$38.5k', rate: '25%' },
  { name: 'Marcus O.',deals: 2, won: 0, revenue: '$0',     rate: '0%'  },
]

// Drill-through rows for Outstanding $24,200
const DRILL_ROWS = [
  { invoice: 'INV-041', customer: 'Marcus Okafor',   amount: '$12,400', age: '14d', status: 'Sent'     },
  { invoice: 'INV-039', customer: 'Sarah Chen',      amount: '$8,200',  age: '8d',  status: 'Sent'     },
  { invoice: 'INV-037', customer: 'David Kim',       amount: '$3,600',  age: '22d', status: 'Overdue'  },
]

export default function ReportsWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Your numbers are clear." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const maxAmt = Math.max(...MONTHLY_REVENUE.map(x => x.amount))

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BarChart3 size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Reports</span>
        </div>
        {/* Date range pills */}
        <div style={{ display: 'flex', gap: '3px' }}>
          {['MTD', 'QTD', 'YTD', '30d'].map((label, i) => (
            <button key={label} style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '9px', border: `1px solid ${i === 2 ? T.accent : T.border}`, backgroundColor: i === 2 ? T.accentBg : 'transparent', color: i === 2 ? T.accent : T.textSecondary, fontWeight: i === 2 ? '600' : '400', cursor: 'pointer' }}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── OVERVIEW: report type selector ── */}
      {scene === 'overview' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
          {REPORT_TYPES.map((rt, i) => (
            <motion.div key={rt.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1, duration: 0.3 }}
              style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
            >
              <div style={{ width: '36px', height: '36px', borderRadius: '9px', backgroundColor: T.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <rt.icon size={16} style={{ color: T.accent }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: T.text }}>{rt.label}</div>
                <div style={{ fontSize: '10px', color: T.textMuted }}>{rt.desc}</div>
              </div>
              <ChevronRight size={13} style={{ color: T.textMuted }} />
            </motion.div>
          ))}
        </div>
      )}

      {/* ── SALES: rep performance table ── */}
      {scene === 'sales' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '5px' }}>
            {SALES_STATS.map(s => (
              <div key={s.label} style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '7px', padding: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: s.color || T.text }}>{s.value}</div>
                <div style={{ fontSize: '8px', color: T.textMuted }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`, fontSize: '11px', fontWeight: '600', color: T.text }}>Rep Performance</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {REP_DATA.map((rep, i) => (
                <motion.div key={rep.name} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08, duration: 0.25 }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderBottom: i < REP_DATA.length - 1 ? `1px solid ${T.border}` : 'none', cursor: 'pointer' }}
                >
                  <div style={{ width: '28px', height: '28px', borderRadius: '7px', backgroundColor: T.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', color: T.accent, flexShrink: 0 }}>
                    {rep.name.split(' ').map(p => p[0]).join('')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: T.text }}>{rep.name}</div>
                    <div style={{ fontSize: '9px', color: T.textMuted }}>{rep.deals} deals · {rep.won} won</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: T.accent }}>{rep.revenue}</div>
                    <div style={{ fontSize: '9px', color: rep.rate === '0%' ? T.textMuted : '#4a7c59', fontWeight: '500' }}>{rep.rate} win rate</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── FINANCIAL: stat cards only ── */}
      {scene === 'financial' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '5px' }}>
            {FINANCIAL_STATS.map(s => (
              <div key={s.label} style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '7px', padding: '8px', textAlign: 'center', cursor: 'pointer' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: s.color || T.text }}>{s.value}</div>
                <div style={{ fontSize: '8px', color: T.textMuted }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: '600', color: T.text }}>Net Income Trend</div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: '6px', paddingBottom: '4px' }}>
              {MONTHLY_REVENUE.map((m, i) => {
                const net = Math.round(m.amount * 0.56)
                const pct = (net / Math.round(maxAmt * 0.56)) * 100
                return (
                  <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                    <div style={{ fontSize: '8px', color: T.textMuted }}>${(net/1000).toFixed(0)}k</div>
                    <motion.div initial={{ height: 0 }} animate={{ height: `${pct}%` }} transition={{ delay: i * 0.07, duration: 0.4 }}
                      style={{ width: '100%', maxWidth: '32px', backgroundColor: i === 5 ? '#4a7c59' : '#4a7c5960', borderRadius: '3px 3px 0 0', minHeight: '2px' }}
                    />
                    <div style={{ fontSize: '9px', color: T.textMuted }}>{m.month}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* ── REVENUE: bar chart ── */}
      {scene === 'revenue' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
            {[{ label: 'Total Revenue', value: '$158.2k', color: T.accent }, { label: 'Best Month', value: 'Jun · $42.7k', color: null }, { label: 'MoM Growth', value: '+49%', color: '#4a7c59' }].map(s => (
              <div key={s.label} style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '7px', padding: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: s.color || T.text }}>{s.value}</div>
                <div style={{ fontSize: '8px', color: T.textMuted }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: T.text }}>Revenue by Month</div>
              <div style={{ fontSize: '9px', color: T.textMuted }}>Click bar to drill</div>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: '6px', paddingBottom: '4px' }}>
              {MONTHLY_REVENUE.map((m, i) => {
                const pct = (m.amount / maxAmt) * 100
                return (
                  <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', cursor: 'pointer' }}>
                    <div style={{ fontSize: '8px', color: T.textMuted }}>${(m.amount/1000).toFixed(0)}k</div>
                    <motion.div initial={{ height: 0 }} animate={{ height: `${pct}%` }} transition={{ delay: i * 0.07, duration: 0.4 }}
                      style={{ width: '100%', maxWidth: '32px', backgroundColor: i === 5 ? T.accent : T.accent + '60', borderRadius: '3px 3px 0 0', minHeight: '2px' }}
                    />
                    <div style={{ fontSize: '9px', color: T.textMuted }}>{m.month}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* ── DRILL: Outstanding stat selected + detail table ── */}
      {scene === 'drill' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '5px' }}>
            {FINANCIAL_STATS.map(s => (
              <div key={s.label} style={{ backgroundColor: s.drillable ? 'rgba(194,90,90,0.08)' : T.bgCard, border: `1px solid ${s.drillable ? '#c25a5a' : T.border}`, borderRadius: '7px', padding: '8px', textAlign: 'center', cursor: 'pointer' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: s.color || T.text }}>{s.value}</div>
                <div style={{ fontSize: '8px', color: T.textMuted }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: T.text }}>Outstanding — $24,200</span>
              <span style={{ fontSize: '9px', padding: '2px 7px', borderRadius: '8px', backgroundColor: 'rgba(194,90,90,0.1)', color: '#c25a5a', fontWeight: '500' }}>3 invoices</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {DRILL_ROWS.map((row, i) => (
                <motion.div key={row.invoice} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.25 }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderBottom: i < DRILL_ROWS.length - 1 ? `1px solid ${T.border}` : 'none', cursor: 'pointer' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>{row.customer}</div>
                    <div style={{ fontSize: '9px', color: T.accent }}>{row.invoice}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>{row.amount}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: '8px', color: T.textMuted }}>{row.age}</span>
                      <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: '5px', backgroundColor: row.status === 'Overdue' ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)', color: row.status === 'Overdue' ? '#ef4444' : '#3b82f6', fontWeight: '500' }}>{row.status}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    overview:  '1 · Reports — three report types: Sales, Jobs, Financial',
    sales:     '2 · Sales Report — pipeline $284k, win rate 42%, per-rep performance table',
    financial: '3 · Financial Report — Invoiced, Collected, Outstanding, Expenses, Net Income + trend chart',
    revenue:   '4 · Revenue by Month — bar chart, click any bar to drill into the payments behind it',
    drill:     '5 · Drill-through — Outstanding $24,200 → 3 invoices with customer, age, and status',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Reports work'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
